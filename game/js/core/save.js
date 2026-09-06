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

// 키 이름의 v1과 아래 schemaVersion은 층위가 다른 두 버전이라 일부러 같이 둔다.
// 키의 v1 = "이 키가 담는 큰 형태"의 세대(형태를 통째로 갈아엎어야 하면 새 키로
// 옮기고 옛 키는 그냥 버린다). schemaVersion = 그 형태 안에서의 세부 변경(필드
// 추가·의미 변경)으로, 아래 sanitize()가 마이그레이션을 태우는 기준이다.
const STORAGE_KEY = 'rff-save-v1';
const SCHEMA_VERSION = 1;

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

    // 최고 기록. stage는 "끝까지 가 본 가장 높은 구간"(0-based, 클리어/실패 무관),
    // score는 그 판에서 번 크레딧(state.reward)의 최고값이다.
    // ★ 이 게임엔 아직 "점수" 개념이 없어서 무엇을 score로 삼을지는 판단이었다.
    //   uploaded는 할당량에 수렴해 사실상 구간 번호를 따라가고, reward는 피해로
    //   깎이지 않는 "그 판에 실제로 해낸 양"이라 판끼리 비교가 된다. 아래 coins가
    //   붙을 때 그게 곧 크레딧이라 자연스럽게 이어지기도 한다.
    best: { stage: 0, score: 0 },

    // 지금까지 메모리에만 있던 설정값(core/state.js의 state.settings + 환경 방해
    // 토글 config.hazard.enabled). 슬라이더 셋은 state.settings와 같은 이름을 쓴다.
    settings: { soundMaster: 100, soundSfx: 100, soundBgm: 100, hazardEnabled: true },

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

  // 모르는 세대의 세이브는 억지로 읽지 않고 통째로 초기값으로 되돌린다. 지금은 v1
  // 하나뿐이라 마이그레이션 표가 없다 — v2가 생기면 여기서 v1→v2 변환을 태운다.
  if (raw.schemaVersion !== SCHEMA_VERSION) return d;

  const best = raw.best && typeof raw.best === 'object' ? raw.best : {};
  const st = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};

  return {
    schemaVersion: SCHEMA_VERSION,
    stageIndex: Math.max(0, Math.floor(num(raw.stageIndex, d.stageIndex))),
    unlockedPictures: Array.isArray(raw.unlockedPictures)
      ? [...new Set(raw.unlockedPictures.filter((s) => typeof s === 'string'))]
      : d.unlockedPictures,
    best: {
      stage: Math.max(0, Math.floor(num(best.stage, d.best.stage))),
      score: Math.max(0, Math.round(num(best.score, d.best.score))),
    },
    settings: {
      soundMaster: vol(st.soundMaster, d.settings.soundMaster),
      soundSfx: vol(st.soundSfx, d.settings.soundSfx),
      soundBgm: vol(st.soundBgm, d.settings.soundBgm),
      hazardEnabled: bool(st.hazardEnabled, d.settings.hazardEnabled),
    },
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

/** 이번 판에 완성한 그림들을 해금 목록에 합친다(중복 없이). */
function mergeUnlockedPictures(save) {
  if (!state.completedPictures.length) return;
  const seen = new Set(save.unlockedPictures);
  for (const pic of state.completedPictures) {
    if (typeof pic?.src === 'string') seen.add(pic.src);
  }
  save.unlockedPictures = [...seen];
}

/** 최고 기록 갱신 — 클리어/게임오버 양쪽이 같은 규칙을 쓴다. */
function mergeBest(save) {
  save.best.stage = Math.max(save.best.stage, state.stageIndex);
  save.best.score = Math.max(save.best.score, Math.round(state.reward));
}

/**
 * 구간 클리어 순간의 기록(core/stageManager.js의 checkWinLose에서 호출).
 * 이어할 구간을 방금 깬 구간의 다음으로 올린다.
 */
export function recordStageCleared() {
  return updateSave((save) => {
    // Math.max로 덮는다 — 디버그 구간 점프(debug.js)로 낮은 구간을 다시 깨더라도
    // 이미 열어둔 진행이 뒤로 밀리면 안 된다.
    save.stageIndex = Math.max(save.stageIndex, state.stageIndex + 1);
    mergeBest(save);
    mergeUnlockedPictures(save);
  });
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
