// 이 파일 역할: 밸런스 데이터를 3단 폴백(구글 시트 → 로컬 balance.csv → 하드코딩)으로 불러와 gameData에 채운다.

import { parseCsv, stageRowsToMap, splitSections } from './csv.js';
// ★ state.js는 아무것도 import하지 않는 순환참조의 뿌리(core/state.js 상단 주석)라
//   여기서 가져다 써도 순환이 안 생긴다 — 배경 시트 반영을 판 진행 중엔 건너뛰기
//   위해 phase만 읽는다(대입은 절대 안 한다).
import { state } from '../core/state.js';

// ---------------------------------------------------------------------------
// 구글 시트 밸런스 데이터 (enemies / difficulty / stage)
//
// ★ 2026-09-08: 부팅 경로(loadGameData)와 수동 새로고침(reloadGameData)의
//   우선순위가 서로 달라졌다 — 아래 두 함수의 주석 참고. "폴백 3단계"라는 이름의
//   순서 자체는 reloadGameData가 그대로 물려받는다:
//   1) 구글 시트 웹게시 CSV 3개 병렬 fetch (SHEET_TIMEOUT_MS 안에 다 와야 성공)
//   2) 실패 시 로컬 game/balance.csv (섹션 구분: [enemies] [difficulty] [stage])
//   3) 그것도 실패 시 이 파일 하단의 HARDCODED_DATA
// ---------------------------------------------------------------------------

// 시트 3개를 기다리는 예산(밀리초). 셋을 각각이 아니라 합쳐서 이 안에 다 와야 한다.
// ★ 2026-09-08 신설 — 예전엔 타임아웃이 없어서 구글이 막히거나 아주 느리면
//   fetch가 영영 안 끝날 수 있었다(정확히는 브라우저/OS 기본 타임아웃까지, 보통
//   수십 초~수 분). 심사 당일 그런 일이 나면 안 되므로 명시적으로 끊는다.
const SHEET_TIMEOUT_MS = 5000;

const SHEET_URLS = {
  difficulty:
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vRzShTzljyNeIYLxwULAD1zHkOCir3I2LpyorOUo6XxLO0Ay68y_ZHkG4YOBAJ6AkV8pNXQAs9PHO1I/pub?gid=267742941&single=true&output=csv',
  enemies:
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vRzShTzljyNeIYLxwULAD1zHkOCir3I2LpyorOUo6XxLO0Ay68y_ZHkG4YOBAJ6AkV8pNXQAs9PHO1I/pub?gid=2125704359&single=true&output=csv',
  stage:
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vRzShTzljyNeIYLxwULAD1zHkOCir3I2LpyorOUo6XxLO0Ay68y_ZHkG4YOBAJ6AkV8pNXQAs9PHO1I/pub?gid=802521072&single=true&output=csv',
};

// 시트가 텅 비어있거나 fetch 자체가 완전히 막힌 환경(오프라인 등)에서도
// 게임이 그대로 돌아가게 하는 최후의 안전망.
//
// 중요: id / action / move_pattern은 반드시 시트와 같은 어휘를 써야 한다.
//  - id는 assets/enemies/<id>.png 파일명과 1:1 (그래야 오프라인에서도 그림이 나온다)
//  - action은 click | drag | none 셋 중 하나 (다른 값을 쓰면 클릭으로 못 없앤다)
//  - move_pattern은 enemies.js의 PATTERN_KIND에 있는 문구
// 클릭으로 치울 수 있는 놈을 최소 하나는 넣어야 게임이 성립한다.
const HARDCODED_DATA = {
  difficulty: [
    { difficulty: 'easy', spawn_interval: 3, max_alive: 4, dps_multiplier: 0.5, lifetime_multiplier: 1.25 },
    { difficulty: 'normal', spawn_interval: 2, max_alive: 6, dps_multiplier: 1, lifetime_multiplier: 1 },
    { difficulty: 'hard', spawn_interval: 1.2, max_alive: 9, dps_multiplier: 1.5, lifetime_multiplier: 0.75 },
  ],
  enemies: [
    {
      id: 'basic', name_kr: '기본 잡몹', type: 'B',
      size_w: 90, size_h: 90, hit_w: 100, hit_h: 100,
      speed: 60, move_pattern: '직선+벽반사',
      hp: 1, dps: 2, stops_upload: false, lifetime: 8,
      weight: 30, min_stage: 1, action: 'click', special_effect: '',
    },
    {
      id: 'ransom', name_kr: '랜섬웨어 자물쇠', type: 'B',
      size_w: 110, size_h: 110, hit_w: 120, hit_h: 120,
      speed: 30, move_pattern: '직선+벽반사',
      hp: 3, dps: 3, stops_upload: false, lifetime: 10,
      weight: 15, min_stage: 1, action: 'click', special_effect: '',
    },
    {
      id: 'popup', name_kr: '팝업 광고창', type: 'B',
      size_w: 260, size_h: 180, hit_w: 260, hit_h: 40,
      speed: 20, move_pattern: '살짝 떠다님',
      hp: 0, dps: 0, stops_upload: false, lifetime: 10,
      weight: 10, min_stage: 1, action: 'drag', special_effect: '화면 가림',
    },
    {
      id: 'bomb', name_kr: '크래시 폭탄', type: 'A',
      size_w: 120, size_h: 120, hit_w: 130, hit_h: 130,
      speed: 40, move_pattern: '배회',
      hp: 1, dps: 0, stops_upload: true, lifetime: 4,
      weight: 5, min_stage: 2, action: 'click', special_effect: '수명만료시 -20%',
    },
  ],
  // key는 stage 시트와 같아야 getStageValue가 찾는다
  stage: {
    time_limit: { value: 180, unit: 'sec' },
    quota: { value: 300, unit: 'MB' },
    canvas_w: { value: 1920, unit: 'px' },
    canvas_h: { value: 1080, unit: 'px' },
    min_hitbox: { value: 60, unit: 'px' },
    min_gap: { value: 20, unit: 'px' },
    direction_change_min: { value: 2, unit: 'sec' },
    direction_change_max: { value: 4, unit: 'sec' },
    file_small_size: { value: 30, unit: 'MB' },
    file_small_time: { value: 15, unit: 'sec' },
    file_medium_size: { value: 60, unit: 'MB' },
    file_medium_time: { value: 30, unit: 'sec' },
    file_large_size: { value: 100, unit: 'MB' },
    file_large_time: { value: 50, unit: 'sec' },
  },
};

// 현재 로드된 밸런스 데이터. 값이 배열/객체 내부까지 바뀌므로 참조를 저장해두고
// 쓰면 로드가 끝난 뒤(reload 포함)에도 항상 최신값을 보게 된다.
export const gameData = {
  loading: true,
  error: null,
  // 'sheet' | 'local-csv' | 'hardcoded' 중 어디서 로드됐는지
  source: null,
  enemies: [],
  difficulty: [],
  // key -> { value, unit } (key-value 시트라 key로 조회)
  stage: {},
};

/** gameData.stage에서 값만 꺼낸다. 없으면 fallback을 돌려준다. */
export function getStageValue(key, fallback) {
  return gameData.stage[key]?.value ?? fallback;
}

function withCacheBust(url) {
  // 시트를 수정하고 바로 다시 fetch해도 브라우저/CDN 캐시된 옛날 값을
  // 받지 않도록 매 요청마다 다른 쿼리를 붙인다.
  return `${url}&t=${Date.now()}`;
}

async function fetchCsvText(url, signal) {
  const res = await fetch(withCacheBust(url), { signal });
  if (!res.ok) throw new Error(`CSV fetch 실패 (${res.status}): ${url}`);
  const text = (await res.text()).replace(/^\uFEFF/, ''); // 구글 시트가 BOM을 붙여 보내는 경우 방어
  if (!text.trim()) throw new Error(`CSV 응답이 비어있음: ${url}`);
  return text;
}

/**
 * 구글 시트 3개를 병렬로 fetch한다. 하나라도 실패(또는 timeoutMs 안에 셋 다
 * 못 받으면)하면 전체 실패로 취급.
 * ★ AbortSignal.timeout()을 세 요청이 공유한다 — "각각 timeoutMs"가 아니라
 *   "셋을 합쳐 timeoutMs" 예산이다. 하나만 붙잡고 있어도 나머지까지 함께 끊는다.
 */
async function loadFromSheets(timeoutMs) {
  const signal = AbortSignal.timeout(timeoutMs);
  const [difficultyText, enemiesText, stageText] = await Promise.all([
    fetchCsvText(SHEET_URLS.difficulty, signal),
    fetchCsvText(SHEET_URLS.enemies, signal),
    fetchCsvText(SHEET_URLS.stage, signal),
  ]);

  return {
    difficulty: parseCsv(difficultyText),
    enemies: parseCsv(enemiesText),
    stage: stageRowsToMap(parseCsv(stageText)),
  };
}

/** 로컬 game/balance.csv. 섹션이 하나도 없으면 실패로 취급한다(호출한 쪽이 다음 단계로 넘긴다). */
async function loadFromLocalCsv(url = './balance.csv') {
  const res = await fetch(url);
  if (!res.ok) throw new Error('로컬 balance.csv fetch 실패');
  const text = await res.text();

  const sections = splitSections(text);
  const difficulty = sections.difficulty ? parseCsv(sections.difficulty) : [];
  const enemies = sections.enemies ? parseCsv(sections.enemies) : [];
  const stage = sections.stage ? stageRowsToMap(parseCsv(sections.stage)) : {};

  if (difficulty.length === 0 && enemies.length === 0 && Object.keys(stage).length === 0) {
    throw new Error('로컬 balance.csv에 사용 가능한 데이터가 없음');
  }

  return { difficulty, enemies, stage };
}

function applyGameData(data, source) {
  gameData.enemies = data.enemies;
  gameData.difficulty = data.difficulty;
  gameData.stage = data.stage;
  gameData.source = source;
  gameData.loading = false;
  gameData.error = null;
}

/**
 * 어디서 몇 줄을 받아왔는지만 한 줄로 남긴다.
 * ★ 예전엔 gameData 객체를 통째로 찍었는데(방해꾼 12종 + 난이도 표 전부),
 *   배포본 콘솔을 열면 이 덤프가 화면을 덮었다. 어느 소스로 떨어졌는지는
 *   폴백 진단에 실제로 필요한 정보라 남기고, 내용물 덤프만 걷어냈다
 *   (자세한 값은 디버그 패널이 이미 보여준다).
 *   여기선 config.debug.enabled를 볼 수 없다 — balance/가 config를 import하면
 *   순환참조가 된다(config.js 상단 주석). 그래서 "조용하게" 대신 "짧게"로 정리했다.
 */
function logLoaded(source) {
  console.log(`[balance] 로드 완료 — ${source} (방해꾼 ${gameData.enemies.length}종, 난이도 ${gameData.difficulty.length}행)`);
}

/**
 * 배경에서 시트를 마저 받아 조용히 갈아 끼운다(fire-and-forget — 호출한 쪽은
 * 기다리지 않는다). loadGameData()가 로컬 CSV로 이미 착지시킨 뒤에만 부른다.
 *
 * ★ 2026-09-08: 시트가 도착했을 때 반영 여부를 phase로 가른다:
 *   - 'loading'/'title'/'intro' (판이 아직 시작 안 됨, settlePhase가 허용하는
 *     범위와 정확히 같다) → 조용히 반영하고 onApplied를 불러 재보강시킨다.
 *   - 그 외(playing/cleared/failed/ending) → 반영하지 않는다. 특히 playing 중에
 *     반영하면 core/stageManager.js가 스폰마다 gameData.enemies를 그대로 다시
 *     읽으므로, 이미 나와 있는 방해꾼과 방금 스폰된 방해꾼이 서로 다른 스탯을
 *     쓰게 된다 — 판 중간에 밸런스가 바뀌는 사고. 재시도는 안 한다: 이 판이
 *     끝나도 로컬 CSV 값 그대로 가고, 다음에 받으려면 리로드 버튼을 눌러야
 *     한다(리로드는 이 경로를 안 타고 별도로 즉시 시트를 기다린다, 아래
 *     reloadGameData 주석 참고).
 *
 * @param {() => void} [onApplied] 실제로 반영됐을 때만 호출 — main.js가 이
 *   자리에서 applyLoadedData()를 다시 태워 enrichment(해금 배치·캔버스 해상도·
 *   방해꾼 스프라이트)까지 sheet 값에 맞게 재보강한다.
 */
function catchUpFromSheet(onApplied) {
  loadFromSheets(SHEET_TIMEOUT_MS)
    .then((data) => {
      if (state.phase === 'playing' || state.phase === 'cleared' || state.phase === 'failed' || state.phase === 'ending') {
        console.warn(
          `[balance] 시트가 늦게 도착했지만 지금 phase가 '${state.phase}'라 반영을 건너뜀(로컬 CSV 값 유지, 다음 리로드까지)`,
        );
        return;
      }
      applyGameData(data, 'sheet');
      logLoaded('구글 시트(뒤늦게 반영)');
      onApplied?.();
    })
    .catch((err) => {
      console.warn('[balance] 구글 시트 백그라운드 fetch 실패 — game/balance.csv 값 유지:', err);
    });
}

/**
 * 최초 부팅 전용. ★ 2026-09-08: 구글 시트를 임계 경로에서 뺐다 — 로컬
 * balance.csv로 먼저 착지시키고, 시트는 위 catchUpFromSheet()가 뒤에서 받아
 * 반영한다(await 없음, 부팅을 안 막는다). 실측(빠른 3G): 인트로 시작이
 * 12.1초 → 4.6초로 줄었다(느린 4G 기준. 시트가 이 경로에 있을 때는 시트
 * fetch가 그대로 부팅 시간이었다).
 *
 * 로컬 CSV마저 실패하면(파일 자체가 없는 등 극단적 상황) 대체할 로컬 수단이
 * 없으므로 그때만 시트를 기다린다 — 원래 순서(시트 → 하드코딩)로 돌아간다.
 *
 * 시트를 배경에서 마저 받으려면 이 함수가 끝난 뒤 startBackgroundSheetSync()를
 * 따로 불러야 한다(아래 주석) — 이 함수 자체는 시트를 안 건드리고 반환한다.
 */
export async function loadGameData() {
  gameData.loading = true;
  gameData.error = null;

  try {
    const data = await loadFromLocalCsv();
    applyGameData(data, 'local-csv');
    logLoaded('game/balance.csv (부팅 — 시트는 뒤에서 이어받음)');
    return gameData;
  } catch (localErr) {
    console.warn('[balance] 로컬 balance.csv 부팅 실패, 구글 시트로 시도:', localErr);
  }

  try {
    const data = await loadFromSheets(SHEET_TIMEOUT_MS);
    applyGameData(data, 'sheet');
    logLoaded('구글 시트');
    return gameData;
  } catch (sheetErr) {
    console.warn('[balance] 구글 시트도 실패:', sheetErr);
  }

  applyGameData(HARDCODED_DATA, 'hardcoded');
  gameData.error = '로컬 CSV/구글 시트 모두 실패 — 하드코딩 기본값 사용 중';
  logLoaded('하드코딩 기본값');
  return gameData;
}

/**
 * 부팅이 끝난 뒤(main.js가 loadGameData + applyLoadedData를 한 번 마친 뒤) 한
 * 번만 부른다. loadGameData() 자체에서 바로 안 부르는 이유: main.js가 첫
 * applyLoadedData() 호출을 마치기 전에 시트가 도착하는 레이스를 피하려는
 * 것도 있지만, 더 큰 이유는 onApplied(=applyLoadedData)가 "이미 한 번
 * 보강된 상태 위에 다시 보강"하는 게 아니라 "보강 전 상태 위에 처음 보강"하는
 * 꼴이 되면 안 되기 때문이다 — 항상 최초 applyLoadedData 다음에만 걸린다.
 */
export function startBackgroundSheetSync(onApplied) {
  catchUpFromSheet(onApplied);
}

/**
 * 리로드 버튼(수동, 개발자용) 전용. ★ loadGameData()와 우선순위가 다르다 —
 * 이건 "지금 시트 값을 보고 싶다"는 명시적 요청이므로 원래 순서(시트 → 로컬
 * → 하드코딩)를 그대로 쓰고 결과를 기다린다. 부르는 쪽(main.js)이 끝나자마자
 * setPhase('title')로 판을 강제로 접으므로, loadGameData()가 걱정하는 "판
 * 중간에 반영" 문제가 애초에 없다 — 대신 timeout(SHEET_TIMEOUT_MS)은 여기도
 * 그대로 걸어 구글이 막혀도 무한정 안 붙잡히게 한다.
 */
export async function reloadGameData() {
  gameData.loading = true;
  gameData.error = null;

  try {
    const data = await loadFromSheets(SHEET_TIMEOUT_MS);
    applyGameData(data, 'sheet');
    logLoaded('구글 시트');
    return gameData;
  } catch (sheetErr) {
    console.warn('[balance] 구글 시트 fetch 실패, game/balance.csv로 폴백:', sheetErr);
  }

  try {
    const data = await loadFromLocalCsv();
    applyGameData(data, 'local-csv');
    logLoaded('game/balance.csv');
    return gameData;
  } catch (localErr) {
    console.warn('[balance] game/balance.csv 폴백도 실패, 하드코딩 기본값 사용:', localErr);
  }

  applyGameData(HARDCODED_DATA, 'hardcoded');
  gameData.error = '시트/로컬 CSV 모두 실패 — 하드코딩 기본값 사용 중';
  logLoaded('하드코딩 기본값');
  return gameData;
}
