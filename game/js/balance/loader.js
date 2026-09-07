// 이 파일 역할: 밸런스 데이터를 3단 폴백(구글 시트 → 로컬 balance.csv → 하드코딩)으로 불러와 gameData에 채운다.

import { parseCsv, stageRowsToMap, splitSections } from './csv.js';

// ---------------------------------------------------------------------------
// 구글 시트 밸런스 데이터 (enemies / difficulty / stage)
//
// 폴백 3단계:
//   1) 구글 시트 웹게시 CSV 3개 병렬 fetch
//   2) 실패 시 로컬 game/balance.csv (섹션 구분: [enemies] [difficulty] [stage])
//   3) 그것도 실패 시 이 파일 하단의 HARDCODED_DATA
// ---------------------------------------------------------------------------

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

async function fetchCsvText(url) {
  const res = await fetch(withCacheBust(url));
  if (!res.ok) throw new Error(`CSV fetch 실패 (${res.status}): ${url}`);
  const text = (await res.text()).replace(/^\uFEFF/, ''); // 구글 시트가 BOM을 붙여 보내는 경우 방어
  if (!text.trim()) throw new Error(`CSV 응답이 비어있음: ${url}`);
  return text;
}

/** 1단계: 구글 시트 3개를 병렬로 fetch한다. 하나라도 실패하면 전체 실패로 취급. */
async function loadFromSheets() {
  const [difficultyText, enemiesText, stageText] = await Promise.all([
    fetchCsvText(SHEET_URLS.difficulty),
    fetchCsvText(SHEET_URLS.enemies),
    fetchCsvText(SHEET_URLS.stage),
  ]);

  return {
    difficulty: parseCsv(difficultyText),
    enemies: parseCsv(enemiesText),
    stage: stageRowsToMap(parseCsv(stageText)),
  };
}

/** 2단계: 로컬 game/balance.csv 폴백. 섹션이 하나도 없으면 실패로 취급해 3단계로 넘긴다. */
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
 * 밸런스 데이터를 로드한다: 구글 시트 → 로컬 balance.csv → 하드코딩 (3단 폴백).
 * 게임 시작 시 호출하고, 리로드 버튼을 누르면 다시 호출한다.
 */
export async function loadGameData() {
  gameData.loading = true;
  gameData.error = null;

  try {
    const data = await loadFromSheets();
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

/** 리로드 버튼에서 호출. loadGameData()의 별칭이며 매번 새로 fetch한다. */
export function reloadGameData() {
  return loadGameData();
}
