// config.js
// 두 종류의 숫자를 관리한다:
//   1) config       — 엔진 자체 상수(캔버스 크기, 루프 FPS 등). 정적 하드코딩.
//   2) gameData      — 구글 시트에서 fetch하는 밸런스 테이블(적/난이도/스테이지).
//                       다른 파일은 여기서 import만 하고 숫자를 직접 들고 있지 않는다.

// 엔진 상수. CSV/시트와 무관하게 항상 고정인 값들이다.
// 여기 숫자를 바꾸면 시트 연결 여부와 상관없이 동작이 바뀐다.
export const config = {
  canvas: {
    // 캔버스 논리 해상도(px). 키우면 더 넓은 화면에 그려지지만 오브젝트가
    // 상대적으로 작아 보인다.
    width: 960,
    height: 540,
  },

  loop: {
    // 시뮬레이션 목표 FPS. 낮추면 게임 로직 업데이트가 뜸해진다(그리기는 별개).
    targetFps: 60,
  },

  player: {
    // 플레이어 이동 속도(px/s). 키우면 더 빠르게 움직인다.
    moveSpeed: 240,
  },

  // spawner.js/enemies.js가 아직 쓰는 placeholder 값. 다음 단계에서 이 자리를
  // gameData.enemies / gameData.difficulty로 대체하고 이 섹션은 제거한다.
  spawner: {
    // 첫 방해꾼이 등장하기까지 대기 시간(초). 키우면 초반이 더 여유로워진다.
    initialDelaySec: 2,
    // 방해꾼 스폰 간격의 시작값(초). 낮추면 처음부터 더 몰아친다.
    baseIntervalSec: 1.5,
    // 시간이 지날수록 스폰 간격이 줄어드는 비율(초/초). 키우면 난이도가
    // 더 가파르게 상승한다.
    intervalRampPerSec: 0.01,
    // 스폰 간격이 아무리 줄어도 이 값 밑으로는 안 내려간다(초). 낮추면
    // 최종 난이도의 상한이 올라간다.
    minIntervalSec: 0.3,
  },

  enemy: {
    // 방해꾼 기본 이동 속도(px/s). 키우면 회피가 더 어려워진다.
    baseSpeed: 120,
    // 방해꾼 크기(px, 정사각형 한 변). 키우면 화면을 더 많이 가린다.
    size: 24,
  },

  debug: {
    // true면 디버그 패널을 그린다. 배포 빌드에서는 반드시 false로 둔다.
    enabled: false,
  },
};

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

// 시트가 텅 비어있거나 fetch 자체가 완전히 막힌 환경에서도 게임이 항상 돌아가게
// 하는 최후의 안전망. 실제 디자인 값이 정해지면 여기 숫자를 그 값으로 교체한다.
const HARDCODED_DATA = {
  difficulty: [
    { difficulty: 'easy', spawn_interval: 1.5, max_alive: 4, dps_multiplier: 0.8, lifetime_multiplier: 1.2 },
    { difficulty: 'normal', spawn_interval: 1.0, max_alive: 6, dps_multiplier: 1.0, lifetime_multiplier: 1.0 },
    { difficulty: 'hard', spawn_interval: 0.6, max_alive: 9, dps_multiplier: 1.4, lifetime_multiplier: 0.8 },
  ],
  enemies: [
    {
      id: 'basic_blocker',
      name_kr: '기본 방해꾼',
      type: 'ground',
      size_w: 24,
      size_h: 24,
      hit_w: 20,
      hit_h: 20,
      speed: 120,
      move_pattern: 'straight_down',
      hp: 1,
      dps: 10,
      stops_upload: true,
      lifetime: 6,
      weight: 1,
      min_stage: 1,
      action: 'block',
      special_effect: 'none',
    },
  ],
  stage: {
    stage_count: { value: 10, unit: 'stages' },
    stage_duration_sec: { value: 30, unit: 'sec' },
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

/**
 * CSV 텍스트를 행(문자열 배열)의 배열로 쪼갠다. 따옴표로 감싼 필드 안의
 * 쉼표/줄바꿈("", 이스케이프 포함)까지 올바르게 처리하는 최소 구현.
 */
function splitCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char === '\r') {
      // \r\n의 \r은 건너뛰고 다음 \n에서 줄을 끊는다
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/** 컬럼값 하나를 규칙에 맞게 변환한다: stops_upload는 불린, 나머지는 숫자면 숫자로. */
function coerceValue(key, rawValue) {
  const trimmed = rawValue.trim();

  if (key === 'stops_upload') {
    return trimmed.toUpperCase() === 'TRUE';
  }

  if (trimmed === '') return trimmed;

  const asNumber = Number(trimmed);
  return Number.isNaN(asNumber) ? trimmed : asNumber;
}

/**
 * 헤더가 있는 CSV 텍스트를 행 객체 배열로 파싱한다.
 * note 컬럼(사람용 주석)은 결과에서 제외한다.
 */
function parseCsv(text) {
  const rows = splitCsvRows(text).filter((r) => r.some((cell) => cell.trim() !== ''));
  if (rows.length < 1) return [];

  const header = rows[0].map((h) => h.trim());

  return rows.slice(1).map((row) => {
    const obj = {};
    header.forEach((key, i) => {
      if (key === 'note' || key === '') return;
      obj[key] = coerceValue(key, row[i] ?? '');
    });
    return obj;
  });
}

/** key,value,unit,note 형태의 행 배열을 key로 조회 가능한 맵으로 바꾼다. */
function stageRowsToMap(rows) {
  const map = {};
  for (const row of rows) {
    if (!row.key) continue;
    map[row.key] = { value: row.value, unit: row.unit ?? '' };
  }
  return map;
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

/** 로컬 balance.csv를 [enemies] [difficulty] [stage] 섹션으로 나눈다. */
function splitSections(text) {
  const sections = {};
  let current = null;
  let buffer = [];

  const flush = () => {
    if (current) sections[current] = buffer.join('\n');
    buffer = [];
  };

  for (const line of text.split(/\r?\n/)) {
    const marker = line.trim().match(/^\[(\w+)\]$/);
    if (marker) {
      flush();
      current = marker[1];
    } else if (current) {
      buffer.push(line);
    }
  }
  flush();

  return sections;
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
 * 밸런스 데이터를 로드한다: 구글 시트 → 로컬 balance.csv → 하드코딩 (3단 폴백).
 * 게임 시작 시 호출하고, 🔄 리로드 버튼을 누르면 다시 호출한다.
 */
export async function loadGameData() {
  gameData.loading = true;
  gameData.error = null;
  console.log('[balance] 밸런스 불러오는 중...');

  try {
    const data = await loadFromSheets();
    applyGameData(data, 'sheet');
    console.log('[balance] 구글 시트에서 로드 완료:', gameData);
    return gameData;
  } catch (sheetErr) {
    console.warn('[balance] 구글 시트 fetch 실패, game/balance.csv로 폴백:', sheetErr);
  }

  try {
    const data = await loadFromLocalCsv();
    applyGameData(data, 'local-csv');
    console.log('[balance] game/balance.csv에서 로드 완료:', gameData);
    return gameData;
  } catch (localErr) {
    console.warn('[balance] game/balance.csv 폴백도 실패, 하드코딩 기본값 사용:', localErr);
  }

  applyGameData(HARDCODED_DATA, 'hardcoded');
  gameData.error = '시트/로컬 CSV 모두 실패 — 하드코딩 기본값 사용 중';
  console.log('[balance] 하드코딩 기본값 사용:', gameData);
  return gameData;
}

/** 🔄 리로드 버튼에서 호출. loadGameData()의 별칭이며 매번 새로 fetch한다. */
export function reloadGameData() {
  return loadGameData();
}
