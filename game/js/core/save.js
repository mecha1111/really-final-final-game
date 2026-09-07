// 이 파일 역할: 이 게임의 유일한 영속 계층. 진행도를 localStorage의 단일 키에 JSON
// 하나로 저장하고, 저장소가 막혀 있으면 메모리 세이브로 조용히 강등한다 — 어떤
// 경우에도 게임 진행을 막지 않는다(크래시·경고 팝업 금지가 요구사항이다).
//
// ★ 세이브는 "판 데이터"를 복원하지 않는다. 이어할 구간 번호만 복원하고, 판은 그
//   구간의 처음부터 새로 시작한다(중간 저장이 아니다). core/stageManager.js의
//   startGame()이 하는 기존 리셋은 이 파일이 전혀 건드리지 않는다 — 세이브가
//   판 상태에 손을 대기 시작하면 "어디까지가 새 판이고 어디부터가 복원인지"가
//   흐려져서, 지금 한 곳(startGame)으로 모아둔 리셋 규칙이 곧장 무너진다.
//
// ★ 저장소 접근은 전부 try/catch다. 조심해서가 아니라 실제로 필요해서다 — 쿠키/사이트
//   데이터가 차단된 브라우저에서는 setItem이 던지는 정도가 아니라 window.localStorage
//   프로퍼티에 "접근하는 것 자체"가 SecurityError를 던진다. 그래서 아래 storage()는
//   접근까지 통째로 try 안에 넣는다.

import { state } from './state.js';
import { config } from '../config.js';

// 키 이름의 v1과 아래 schemaVersion은 층위가 다른 두 버전이라 일부러 같이 둔다.
// 키의 v1 = "이 키가 담는 큰 형태"의 세대(형태를 통째로 갈아엎어야 하면 새 키로
// 옮기고 옛 키는 그냥 버린다). schemaVersion = 그 형태 안에서의 세부 변경(필드
// 추가·의미 변경)으로, 아래 sanitize()가 마이그레이션을 태우는 기준이다.
const STORAGE_KEY = 'rff-save-v1';
// v2(2026-09-06): 유한 5구간 + 무한모드 구조가 들어오면서 completed와
// best.infiniteStage가 생겼다. 아래 migrate()가 v1 세이브를 그대로 물려받는다
// (해금 그림·이어할 구간을 잃지 않는 게 이 마이그레이션의 존재 이유다).
// v3(2026-09-07): 방해꾼 도감(ui/dexPanel.js) 신설로 unlockedEnemies/killCounts가
// 생겼다. ★ 예전에 이 필드들을 세이브 스키마 없이 그냥 얹으려다 v1 전체를 날릴
// 뻔한 적이 있어서, 반드시 migrate()를 거쳐 옛 필드(해금 그림·이어할 구간 등)를
// 그대로 물려받는다 — 아래 v2→v3 분기 참고.
// v4(2026-09-07): 인트로 연출(ui/intro.js) 신설로 seenIntro가 생겼다. 위 v3의
// 경고가 그대로 적용된다 — 필드 하나 늘었다고 옛 세이브를 버리면 해금 그림과
// 이어할 구간이 통째로 날아간다. 아래 v3→v4 분기가 나머지를 전부 물려받는다.
const SCHEMA_VERSION = 4;

/** 세이브의 초기값 = 스키마의 정의 그 자체. 손상·구버전·저장소 없음이 전부 여기로 온다. */
function defaultSave() {
  return {
    schemaVersion: SCHEMA_VERSION,

    // 다음에 [이어하기]로 시작할 구간(0-based). best.stage(최고 도달 구간)와 일부러
    // 다른 값이다 — 게임오버는 best만 갱신하고 이 값은 안 건드린다(실패했다고 이어할
    // 자리가 뒤로 밀리면 "이어하기"가 아니라 벌칙이 된다).
    stageIndex: 0,

    // 지금까지 완성한 그림의 src 목록(중복 없음). systems/file.js의 completeFile()이
    // state.completedPictures에 쌓아둔 {src, label} 중 src만 그대로 축적한다 — src가
    // 파일 단위로 고유한 식별자라(assets/files/<등급>/char_*_NN.png) 갤러리 해금에
    // 쓸 새 추적 코드가 아예 필요 없다.
    unlockedPictures: [],

    // 유한 구간(0 … config.stage.finiteCount-1)을 전부 깼는가 = 전체 완주.
    // 무한모드 해금 조건이고, 한 번 true가 되면 다시 false로 안 내려간다
    // (완주 기록을 되돌릴 이유가 없다 — [저장 데이터 초기화]로만 사라진다).
    completed: false,

    // 최고 기록. stage는 "끝까지 가 본 가장 높은 구간"(0-based, 클리어/실패 무관),
    // score는 그 판에서 번 크레딧(state.reward)의 최고값이다.
    // infiniteStage는 무한모드에서 "끝까지 가 본"(클리어든 실패든 판이 끝난) 가장
    // 높은 구간이다 — 위 stage와 같은 규칙이고, 유한 구간은 안 센다. 유한과 섞어
    // 재면 "5구간까지 깬 사람"과 "무한 1층"이 한 숫자에 뭉개져 구분이 안 된다.
    // (지금 플레이 중인 구간은 아직 안 센다. 판이 끝나야 기록된다.)
    // ★ 이 게임엔 아직 "점수" 개념이 없어서 무엇을 score로 삼을지는 판단이었다.
    //   uploaded는 할당량에 수렴해 사실상 구간 번호를 따라가고, reward는 피해로
    //   깎이지 않는 "그 판에 실제로 해낸 양"이라 판끼리 비교가 된다. 아래 coins가
    //   붙을 때 그게 곧 크레딧이라 자연스럽게 이어지기도 한다.
    best: { stage: 0, score: 0, infiniteStage: 0 },

    // 지금까지 메모리에만 있던 설정값(core/state.js의 state.settings + 환경 방해
    // 토글 config.hazard.enabled). 슬라이더 셋은 state.settings와 같은 이름을 쓴다.
    // rotationEnabled는 [환경 방해]와 별개인 접근성 토글이다(화면 회전만 끄기).
    // tutorialEnabled도 마찬가지로 독립 토글이다(러버 힌트만 끄기, ui/rover.js).
    settings: {
      soundMaster: 100, soundSfx: 100, soundBgm: 100,
      hazardEnabled: true, rotationEnabled: true, tutorialEnabled: true,
    },

    // 러버가 이미 보여준 팁 id 목록(중복 없음) — 한 팁은 평생 1회만 뜬다
    // (ui/rover.js의 showTip이 여기 있는 id는 다시 큐에 안 넣는다). 설정창의
    // [튜토리얼 다시 보기]가 이 배열을 비운다.
    seenTips: [],

    // 인트로 연출(부팅 → 바탕화면 → 커서가 게임을 찾아 클릭 → 강아지 튜토리얼,
    // ui/intro.js)을 한 번이라도 끝까지 본 적 있나. false면 다음 부팅에서
    // loading → intro → title, true면 곧장 loading → title이다(main.js).
    // ★ "봤다"는 인트로가 타이틀로 넘어가는 그 순간에만 찍는다 — 도중에
    //   새로고침하면 다시 처음부터 본다(중간에 끊긴 걸 봤다고 치지 않는다).
    // 설정창의 [튜토리얼 다시 보기]가 seenTips와 함께 이 값도 false로 되돌린다.
    seenIntro: false,

    // 방해꾼 도감(ui/dexPanel.js) 해금 목록(중복 없음, enemies 시트의 id).
    // recordEnemyEncounter()가 killCounts를 올리다가 문턱값(config.dex.
    // unlockThreshold, 기본 1)에 닿는 순간 여기 추가한다 — 한 번 해금되면
    // (그림 갤러리와 같은 원칙으로) 다시 잠기지 않는다.
    unlockedEnemies: [],

    // 종류별 누적 횟수(id -> number) — 보통은 "처치 수"지만 bait는 "클릭당한
    // 횟수", hourglass/fake_btn은 "발동 횟수", copier는 "자폭 횟수"다(위 config.
    // dex 주석 참고). 도감 카드의 "처치 N회" 표시와 해금 판정이 같은 값을 본다.
    killCounts: {},

    // ★ 자리만 잡아둔 필드 — 지금 아무도 읽지도 쓰지도 않는다. 공모전 뒤 상점이
    //   붙을 때 schemaVersion을 올리고 마이그레이션을 짜는 일 없이 그냥 채워 넣기만
    //   하면 되게 미리 넣어둔다(빈 값이라 있어도 아무 동작에 영향이 없다).
    coins: 0,
    upgrades: {},
  };
}

const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
const vol = (v, fallback) => Math.max(0, Math.min(100, Math.round(num(v, fallback))));

/** killCounts{}는 "id -> 음이 아닌 정수" 맵이어야 한다 — 손상된 값은 그 항목만 0으로 되돌린다. */
function sanitizeKillCounts(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [id, v] of Object.entries(raw)) {
    if (typeof id === 'string' && id) out[id] = Math.max(0, Math.floor(num(v, 0)));
  }
  return out;
}

/**
 * 옛 세대의 세이브를 현재 세대 모양으로 끌어올린다. 못 올리면 null(= 초기값 폴백).
 *
 * ★ 여기서 옛 세이브를 그냥 버리면 안 된다 — 해금한 그림과 이어할 구간이 통째로
 *   날아간다. 그래서 "새로 생긴 필드만 기본값으로 채우고 나머지는 그대로 물려받는"
 *   변환을 세대마다 하나씩 쌓는다(아래 필드 정합성 검사는 어차피 sanitize가
 *   한 번 더 하므로, 여기서는 모양만 맞춰주면 된다).
 */
function migrate(raw) {
  let cur = raw;
  // v1 → v2: completed / best.infiniteStage 신설(유한 5구간 + 무한모드 구조).
  if (cur.schemaVersion === 1) {
    cur = {
      ...cur,
      schemaVersion: 2,
      // 옛 세이브에는 완주 개념 자체가 없었다 — 5구간을 다 깼는지 알 방법이 없으니
      // 안전한 쪽(아직 완주 안 함)으로 둔다. 5구간을 다시 깨면 그때 true가 된다.
      completed: false,
      best: { ...(cur.best && typeof cur.best === 'object' ? cur.best : {}), infiniteStage: 0 },
    };
  }
  // v2 → v3: 방해꾼 도감 신설. 옛 세이브엔 처치 이력이 없으니 안전한 쪽(전부
  // 미해금)으로 둔다 — 이미 잡아본 방해꾼도 이 판부터 다시 세기 시작할 뿐,
  // 해금 그림·이어할 구간 등 나머지 필드는 위에서 그대로 물려받은 채다.
  if (cur.schemaVersion === 2) {
    cur = {
      ...cur,
      schemaVersion: 3,
      unlockedEnemies: [],
      killCounts: {},
    };
  }
  // v3 → v4: 인트로 연출 신설. 옛 세이브에는 인트로 자체가 없었으니 "아직 안 봤다"
  // 쪽으로 둔다(위 v1→v2의 completed와 같은 판단 기준) — 새 연출이니 기존
  // 플레이어도 한 번은 보는 게 맞고, 반대로 true로 두면 아무도 못 보게 된다.
  // 나머지 필드(해금 그림·이어할 구간·도감 등)는 여기서 전부 그대로 물려받는다.
  if (cur.schemaVersion === 3) {
    cur = { ...cur, schemaVersion: 4, seenIntro: false };
  }
  return cur.schemaVersion === SCHEMA_VERSION ? cur : null;
}

/**
 * 저장소에서 읽은 아무 값이나 받아 "반드시 온전한 세이브 객체"로 만든다.
 * 손상된 JSON은 이 함수에 오기 전에 이미 걸러지고, 여기서는 "JSON으로는 읽혔지만
 * 내용이 이상한" 경우(숫자 자리에 문자열, 배열이어야 하는데 객체, 통째로 null 등)를
 * 필드 단위로 초기값으로 되돌린다 — 어느 한 필드가 망가졌다고 세이브 전체를 버리면
 * 멀쩡한 해금 목록까지 같이 날아간다.
 */
function sanitize(raw) {
  const d = defaultSave();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d;

  // 세대가 다르면 마이그레이션을 태운다. 그래도 안 맞으면(미래 세대·정체불명)
  // 그때는 통째로 초기값으로 되돌린다 — 모르는 모양을 억지로 읽지 않는다.
  if (raw.schemaVersion !== SCHEMA_VERSION) {
    const migrated = migrate(raw);
    if (!migrated) return d;
    raw = migrated;
  }

  const best = raw.best && typeof raw.best === 'object' ? raw.best : {};
  const st = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};

  return {
    schemaVersion: SCHEMA_VERSION,
    stageIndex: Math.max(0, Math.floor(num(raw.stageIndex, d.stageIndex))),
    unlockedPictures: Array.isArray(raw.unlockedPictures)
      ? [...new Set(raw.unlockedPictures.filter((s) => typeof s === 'string'))]
      : d.unlockedPictures,
    completed: bool(raw.completed, d.completed),
    best: {
      stage: Math.max(0, Math.floor(num(best.stage, d.best.stage))),
      score: Math.max(0, Math.round(num(best.score, d.best.score))),
      infiniteStage: Math.max(0, Math.floor(num(best.infiniteStage, d.best.infiniteStage))),
    },
    settings: {
      soundMaster: vol(st.soundMaster, d.settings.soundMaster),
      soundSfx: vol(st.soundSfx, d.settings.soundSfx),
      soundBgm: vol(st.soundBgm, d.settings.soundBgm),
      hazardEnabled: bool(st.hazardEnabled, d.settings.hazardEnabled),
      // 옛 세이브엔 이 필드가 없다 — bool()이 기본값(켜짐)으로 채운다. 새 필드가
      // 하나 늘었을 뿐 스키마 세대를 올릴 일은 아니다(sanitize가 흡수한다).
      rotationEnabled: bool(st.rotationEnabled, d.settings.rotationEnabled),
      tutorialEnabled: bool(st.tutorialEnabled, d.settings.tutorialEnabled),
    },
    seenTips: Array.isArray(raw.seenTips)
      ? [...new Set(raw.seenTips.filter((s) => typeof s === 'string'))]
      : d.seenTips,
    seenIntro: bool(raw.seenIntro, d.seenIntro),
    unlockedEnemies: Array.isArray(raw.unlockedEnemies)
      ? [...new Set(raw.unlockedEnemies.filter((s) => typeof s === 'string'))]
      : d.unlockedEnemies,
    killCounts: sanitizeKillCounts(raw.killCounts),
    coins: Math.max(0, Math.floor(num(raw.coins, d.coins))),
    upgrades:
      raw.upgrades && typeof raw.upgrades === 'object' && !Array.isArray(raw.upgrades) ? raw.upgrades : d.upgrades,
  };
}

// 저장소를 못 쓴다는 경고는 딱 한 번만 찍는다 — 저장 시점이 여러 곳이라 그냥 두면
// 같은 줄이 콘솔을 뒤덮는다. 사용자에게 보이는 알림은 절대 안 띄운다(요구사항).
let warned = false;
function warnOnce(what, err) {
  if (warned) return;
  warned = true;
  console.warn(`[save] 저장소를 못 써서 메모리 세이브로 진행한다 (${what}):`, err);
}

/**
 * 쓸 수 있는 localStorage를 꺼낸다. 못 쓰면 null(호출한 쪽은 메모리로 진행한다).
 *
 * "있는지"만 보고 넘어가면 안 된다 — 사파리 프라이빗처럼 객체는 멀쩡히 있는데
 * 용량이 0이라 setItem에서만 던지는 환경이 있다. 그래서 실제로 한 번 쓰고 지워서
 * 확인한다. 이 판정을 캐시하지 않는 이유: 사용자가 도중에 사이트 데이터 설정을
 * 바꿀 수 있고, 어차피 호출 빈도가 매우 낮다(부팅 1회 + 구간 끝 + 설정 확정).
 */
function storage() {
  try {
    const ls = window.localStorage;
    const probe = `${STORAGE_KEY}--probe`;
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch (err) {
    warnOnce('접근 불가', err);
    return null;
  }
}

// 이번 세션의 세이브(진실의 원천). 저장소가 막혀도 이 값은 살아 있어서, 적어도
// 새로고침 전까지는 해금·진행이 정상으로 보인다("조용히 메모리 세이브로 강등").
let cached = null;

function readFromStorage() {
  const ls = storage();
  if (!ls) return defaultSave();
  try {
    const raw = ls.getItem(STORAGE_KEY);
    if (raw === null) return defaultSave(); // 첫 실행 — 없는 건 오류가 아니다
    return sanitize(JSON.parse(raw));
  } catch (err) {
    // 손상된 JSON(수동 편집·중간에 끊긴 쓰기 등). 조용히 초기값으로 되돌린다.
    warnOnce('읽기 실패(손상된 세이브)', err);
    return defaultSave();
  }
}

/** 지금 세이브를 읽는다. 최초 1회만 저장소를 타고, 이후엔 메모리 값을 그대로 돌려준다. */
export function getSave() {
  if (!cached) cached = readFromStorage();
  return cached;
}

/** 메모리 세이브를 저장소에 밀어 넣는다. 실패해도 메모리 값은 그대로 살아 있다. */
function flush() {
  const ls = storage();
  if (!ls) return false;
  try {
    ls.setItem(STORAGE_KEY, JSON.stringify(cached));
    return true;
  } catch (err) {
    warnOnce('쓰기 실패', err);
    return false;
  }
}

/**
 * 세이브를 고치고 저장한다. 모든 쓰기는 이 한 곳을 지나간다.
 * @param {(save: object) => void} mutate
 * @returns {boolean} 저장소까지 실제로 기록됐으면 true(메모리만 됐으면 false)
 */
export function updateSave(mutate) {
  mutate(getSave());
  return flush();
}

/**
 * "이어할 만한 게 있나" — 타이틀의 [이어하기] 노출 조건.
 * 설정만 만지고 나간 경우(세이브 레코드는 있지만 진행은 0)에는 false여야 한다.
 * 그 상태의 [이어하기]는 [새 게임]과 완전히 같은 동작이라 있으면 오히려 헷갈린다.
 */
export function hasProgress() {
  const s = getSave();
  return s.stageIndex > 0 || s.best.stage > 0 || s.unlockedPictures.length > 0;
}

/** [이어하기]가 시작할 구간(0-based). */
export function savedStageIndex() {
  return getSave().stageIndex;
}

/** 이번 판에 완성한 그림들을 해금 목록에 합친다(중복 없이).
 * @returns {number} 그중 "이번에 처음" 해금된 것의 수(이미 해금돼 있던 것 제외) —
 *   클리어 화면의 "새 그림 해금!" 표시가 이 값을 그대로 쓴다.
 */
function mergeUnlockedPictures(save) {
  if (!state.completedPictures.length) return 0;
  const before = new Set(save.unlockedPictures);
  let newCount = 0;
  for (const pic of state.completedPictures) {
    if (typeof pic?.src === 'string' && !before.has(pic.src)) newCount++;
  }
  const seen = new Set(save.unlockedPictures);
  for (const pic of state.completedPictures) {
    if (typeof pic?.src === 'string') seen.add(pic.src);
  }
  save.unlockedPictures = [...seen];
  return newCount;
}

/** 최고 기록 갱신 — 클리어/게임오버 양쪽이 같은 규칙을 쓴다. */
function mergeBest(save) {
  save.best.stage = Math.max(save.best.stage, state.stageIndex);
  save.best.score = Math.max(save.best.score, Math.round(state.reward));
  // 무한모드 구간에서만 infiniteStage를 올린다 — 유한 구간(0..finiteCount-1)까지
  // 같이 세면 "5구간을 깬 것"과 "무한 1층까지 간 것"이 한 숫자에 섞여버린다.
  if (state.stageIndex >= config.stage.finiteCount) {
    save.best.infiniteStage = Math.max(save.best.infiniteStage, state.stageIndex);
  }
}

/**
 * 전체 완주(마지막 유한 구간 클리어)를 못박는다 — 무한모드 해금 조건.
 * core/stageManager.js의 checkWinLose()가 그 순간에 부른다.
 * 한 번 true가 되면 다시 내려가지 않는다(디버그로 낮은 구간을 다시 깨도 그대로).
 */
export function recordRunCompleted() {
  return updateSave((save) => {
    save.completed = true;
  });
}

/** 유한 구간을 전부 깼는가 — 타이틀의 [무한 모드] 노출 조건. */
export function hasCompletedRun() {
  return getSave().completed === true;
}

/**
 * 구간 클리어 순간의 기록(core/stageManager.js의 checkWinLose에서 호출).
 * 이어할 구간을 방금 깬 구간의 다음으로 올린다.
 * @returns {{ savedToStorage: boolean, newUnlocks: number }} newUnlocks는 이번
 *   판에서 "처음으로" 해금된 그림 수 — 클리어 화면의 "새 그림 해금!" 한 줄이
 *   이 값을 그대로 쓴다(ui/clearScreen.js).
 */
export function recordStageCleared() {
  let newUnlocks = 0;
  const savedToStorage = updateSave((save) => {
    // ★ 이어할 구간(save.stageIndex)은 "유한 캠페인의 진행도"만 가리킨다.
    //   - 유한 구간을 깼으면 다음 유한 구간으로 올리되, 마지막 구간을 넘지 않게
    //     클램프한다. 안 그러면 완주 직후 이 값이 finiteCount(=무한모드 첫 구간)가
    //     되어, 플레이어가 [무한 모드]를 고르지도 않았는데 [이어하기]가 조용히
    //     무한모드로 데려가버린다(실측으로 잡은 문제다).
    //   - 무한모드에서 깬 것은 이 값을 아예 안 건드린다. 무한 진행은 best.infiniteStage가
    //     따로 기록한다 — 두 축을 한 숫자에 섞으면 캠페인 진행도를 잃는다.
    if (state.stageIndex < config.stage.finiteCount) {
      const next = Math.min(state.stageIndex + 1, config.stage.finiteCount - 1);
      // Math.max로 덮는다 — 디버그 구간 점프(debug.js)로 낮은 구간을 다시 깨더라도
      // 이미 열어둔 진행이 뒤로 밀리면 안 된다.
      save.stageIndex = Math.max(save.stageIndex, next);
    }
    mergeBest(save);
    newUnlocks = mergeUnlockedPictures(save);
  });
  return { savedToStorage, newUnlocks };
}

/**
 * 게임오버 순간의 기록(같은 자리). ★ stageIndex(이어할 구간)는 일부러 안 건드린다 —
 * 실패는 최고 기록과 해금만 남긴다.
 */
export function recordGameOver() {
  return updateSave((save) => {
    mergeBest(save);
    mergeUnlockedPictures(save);
  });
}

/**
 * 지금 설정값을 세이브에 찍는다(ui/settingsPanel.js가 조작이 확정될 때마다 호출).
 * 슬라이더 셋은 state.settings, 환경 방해 토글은 config.hazard.enabled에 있어서
 * 출처가 둘로 갈린다 — 저장 형태를 아는 건 이 파일 하나뿐이라 모으는 것도 여기서 한다.
 */
export function saveSettings() {
  return updateSave((save) => {
    save.settings = {
      soundMaster: state.settings.soundMaster,
      soundSfx: state.settings.soundSfx,
      soundBgm: state.settings.soundBgm,
      hazardEnabled: config.hazard.enabled,
      rotationEnabled: config.hazard.rotationEnabled,
      tutorialEnabled: config.tutorial.enabled,
    };
  });
}

/** 이 팁을 이미 본 적 있나 — ui/rover.js의 showTip이 큐에 넣기 전에 확인한다. */
export function hasSeenTip(id) {
  return getSave().seenTips.includes(id);
}

/** 이 팁을 "봤다"고 못박는다. 이미 있으면 조용히 아무 일도 안 한다(중복 방지). */
export function markTipSeen(id) {
  return updateSave((save) => {
    if (!save.seenTips.includes(id)) save.seenTips.push(id);
  });
}

/** 설정창의 [튜토리얼 다시 보기] — 본 기록을 전부 지운다(팁은 다시 조건대로 뜬다).
 * ★ 인트로(seenIntro)까지 같이 지운다 — 지금 그 버튼이 가리키는 "튜토리얼"의
 *   본체가 인트로의 강아지 튜토리얼이라, 러버 팁 기록만 지우면 눌러도 아무 일도
 *   안 일어나는 버튼이 된다. 인트로는 다음 실행(새로고침)부터 다시 재생된다 —
 *   지금 화면은 이미 타이틀 이후라 그 자리에서 되감을 데가 없다. */
export function resetSeenTips() {
  return updateSave((save) => {
    save.seenTips = [];
    save.seenIntro = false;
  });
}

/** 인트로를 이미 끝까지 본 적 있나 — main.js가 loading 다음 착지 지점을 고를 때 본다. */
export function hasSeenIntro() {
  return getSave().seenIntro === true;
}

/** 인트로를 "봤다"고 못박는다(ui/intro.js가 타이틀로 넘기는 그 순간에만 부른다). */
export function markIntroSeen() {
  return updateSave((save) => {
    save.seenIntro = true;
  });
}

/**
 * 방해꾼 도감(ui/dexPanel.js) 누적 — "이 종류를 이번에 한 번 처리했다"는 신호가
 * 날 때마다 부른다. 무엇이 그 신호인지는 종류마다 다르다(config.dex 주석 참고):
 * 보통은 클릭 처치, bait는 몸통 클릭, hourglass/fake_btn은 함정 발동, copier는
 * 자폭(triggered) — 부르는 쪽(systems/input.js, core/stageManager.js)이 그
 * 판단을 하고, 여기서는 "누적하고 문턱값 닿으면 해금"만 한다.
 * ★ 문턱값(config.dex.unlockThreshold)에 없는 id는 기본 1 — "처음 한 번"으로
 *   해금되는 게 이 도감의 기본 규칙이고, bait만 5로 올려 잡은 예외다.
 */
export function recordEnemyEncounter(id) {
  return updateSave((save) => {
    save.killCounts[id] = (save.killCounts[id] || 0) + 1;
    const threshold = config.dex.unlockThreshold[id] ?? 1;
    if (save.killCounts[id] >= threshold && !save.unlockedEnemies.includes(id)) {
      save.unlockedEnemies.push(id);
    }
  });
}

/** 저장 데이터 초기화 — 저장소의 키까지 지우고 메모리도 초기값으로 되돌린다. */
export function clearSave() {
  cached = defaultSave();
  const ls = storage();
  if (!ls) return false;
  try {
    ls.removeItem(STORAGE_KEY);
    return true;
  } catch (err) {
    warnOnce('삭제 실패', err);
    return false;
  }
}
