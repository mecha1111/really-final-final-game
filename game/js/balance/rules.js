// 이 파일 역할: 시트 값을 게임이 바로 쓸 형태로 가공한다(판 규칙 묶음, 파일 3종, special_effect 문구 해석).

import { gameData, getStageValue } from './loader.js';
import {
  PROGRESSION,
  INFINITE,
  FINITE_COUNT,
  FINITE_MAX_ALIVE,
  FINITE_QUOTA_OVERRIDE,
  FINITE_TYPE_CAP,
} from './progression.js';

/** 업로드할 파일 3종(소/중/대)을 stage 시트에서 뽑아온다. */
export function getFileTiers() {
  return [
    { key: 'small', label: '소형', sizeMb: getStageValue('file_small_size', 30), timeSec: getStageValue('file_small_time', 15) },
    { key: 'medium', label: '중형', sizeMb: getStageValue('file_medium_size', 60), timeSec: getStageValue('file_medium_time', 30) },
    { key: 'large', label: '대형', sizeMb: getStageValue('file_large_size', 100), timeSec: getStageValue('file_large_time', 50) },
  ];
}

/**
 * 구간 n에서 "이번 판에 실제로 쓸 숫자 묶음"을 만든다. 공식의 유일한 구현부다.
 *
 * ★ n은 0부터다(첫 구간 = 0). config.progression 주석과 같은 규칙.
 * base 값은 시트(normal 행 / stage 시트)를 먼저 보고, 없을 때만 config 폴백을 쓴다
 * — "normal이 곧 n=0의 base"를 코드가 그대로 지키게 하려는 것.
 * difficulty 시트의 easy/hard 행은 참조하지 않지만 지우지 않는다(도전모드 재활용).
 *
 * 디버그 패널은 이 객체를 직접 수정해서 실시간으로 밸런스를 바꾼다
 * (게임 로직은 매 프레임 이 객체를 다시 읽으므로 즉시 반영된다).
 */
export function createRules(stageIndex = 0) {
  const n = Math.max(0, Math.floor(stageIndex));
  const p = PROGRESSION;
  // 무한모드인가(FINITE_COUNT 이상). quota가 이 값으로 갈린다 — 그 아래
  // (spawnInterval/maxAlive 등)는 유한·무한이 여전히 같은 공식을 공유한다
  // (progression.js의 INFINITE 주석 — 애초에 그 공식이 n=6/n=3에서 이미 상한에
  // 닿아버려서 quota 곡선을 분리할 수밖에 없었다는 게 무한 전용 곡선의 존재 이유다).
  const isInfinite = n >= FINITE_COUNT;
  // 무한 1층부터 1,2,3…(INFINITE 곡선의 지수 자리). 유한일 때는 안 쓴다.
  const layer = n - FINITE_COUNT + 1;

  // normal 행만 base로 쓴다(easy/hard는 의도적으로 무시).
  const base = gameData.difficulty.find((d) => d.difficulty === 'normal') ?? {};

  const baseQuota = getStageValue('quota', p.baseQuota);
  const baseSpawn = base.spawn_interval ?? p.baseSpawn;
  const baseMax = base.max_alive ?? p.baseMax;

  return {
    // 지금 몇 번째 구간인지(0부터). UI 표시·로그가 이 값을 그대로 읽는다.
    stageIndex: n,

    // 할당량: 유한/무한이 서로 다른 독립 곡선을 쓴다. 무한 쪽(INFINITE)은 유한
    // 쪽 base/mult를 단 하나도 참조하지 않는다 — 유한을 튜닝해도 무한이 조용히
    // 따라가지 않는다(progression.js의 INFINITE 주석 참고, 요구사항이기도 하다).
    // 유한 쪽은 FINITE_QUOTA_OVERRIDE에 n이 있으면(4·5구간) 그 값이 공식을
    // 대체한다 — 나머지 구간(1~3)은 공식 그대로다(progression.js의 그 표 주석).
    quota: isInfinite
      ? Math.round(INFINITE.baseQuota * Math.pow(INFINITE.quotaMult, layer - 1))
      : (FINITE_QUOTA_OVERRIDE[n] ?? Math.round(baseQuota * Math.pow(p.quotaMult, n))),
    // 스폰 간격: **나눗셈**이라 n이 클수록 짧아진다(= 더 자주 나온다). 하한 클램프.
    spawnInterval: Math.max(baseSpawn / Math.pow(p.spawnMult, n), p.minSpawn),
    // 동시 최대: 2026-09-10부터 유한/무한이 서로 다른 손잡이를 쓴다(quota와 같은
    // 분리 원칙 — progression.js의 FINITE_MAX_ALIVE 주석 참고).
    //   유한(n<FINITE_COUNT) — FINITE_MAX_ALIVE[n] 표를 그대로 쓴다.
    //   무한(n>=FINITE_COUNT) — 옛 공식 그대로(n을 그대로 물린다, layer가 아니다).
    //     ★이 분기는 무한모드의 동시최대 값을 단 하나도 바꾸지 않는다는 뜻이다 —
    //     n=5부터는 원래도 min(baseMax+maxAdd×n, maxCap)=14로 이미 상한에 닿아
    //     있었고(baseMax=difficulty 시트 normal 행=11), 그 계산식을 문자 그대로
    //     보존했다. 무한모드 재측정은 이번 재설계 범위 밖이다.
    maxAlive: isInfinite ? Math.min(Math.floor(baseMax + p.maxAdd * n), p.maxCap) : FINITE_MAX_ALIVE[n],
    // 동시 화면 "종류 수" 상한(마릿수와 별개 축) — enemies/spawner.js가 읽는다.
    // 무한모드는 상한이 없다(요구사항) — Infinity를 주면 스폰러의 비교
    // (aliveTypes.size >= typeCap)가 항상 거짓이라 필터가 사실상 무동작이 된다.
    typeCap: isInfinite ? Infinity : FINITE_TYPE_CAP[n],

    // 아래 둘은 구간으로 안 건드린다 — normal 값 고정
    dpsMultiplier: base.dps_multiplier ?? 1,
    lifetimeMultiplier: base.lifetime_multiplier ?? 1,

    // 제한시간도 quota와 같은 이유로 분리한다 — 무한모드만 INFINITE.timeLimit
    // (240초), 유한은 그대로 stage 시트(180초). 유한 쪽은 절대 안 건드린다.
    timeLimit: isInfinite ? INFINITE.timeLimit : getStageValue('time_limit', 180),

    // 아래 넷은 stage 시트에서 오는 판 전체 규칙(구간·무한모드 여부와 무관)
    minGap: getStageValue('min_gap', 20),
    minHitbox: getStageValue('min_hitbox', 60),
    dirChangeMin: getStageValue('direction_change_min', 2),
    dirChangeMax: getStageValue('direction_change_max', 4),

    // 방해꾼 해금: enemies 시트의 min_stage가 이 값 이하인 놈만 등장한다.
    // 시트 min_stage는 1부터라 n(0부터)과 한 칸 어긋난다 → n+1 로 맞춘다.
    // (공식이 아니라 시트 표로 순차 해금 — 요구사항대로)
    stage: n + 1,
  };
}

// special_effect 문자열을 못 읽었을 때 쓰는 기본값.
// 시트의 문구를 바꾸면 아래 정규식이 안 맞을 수 있는데, 그때 게임이 죽지 않고
// 이 숫자로 굴러가게 하는 안전망이다.
const EFFECT_FALLBACK = {
  splitTiers: [100, 70, 50], // clone 분열 단계별 크기(px)
  splitCount: 2, // 한 번 터질 때 갈라지는 개수
  expirePct: 20, // bomb 수명만료 시 깎이는 업로드 %
  expireNextFileMb: 15, // hidden 수명만료 시 다음 파일에서 빠지는 MB
  wrongClickPct: 10, // fake_btn 오클릭 시 깎이는 업로드 %
  fakeCursorCount: 8, // copier 가짜 커서 개수
  fakeCursorSec: 5, // copier 가짜 커서 지속 시간(초)
};

/**
 * enemies 시트의 special_effect 칸(사람이 쓴 한국어 문구)에서 숫자를 뽑아낸다.
 * 예) "분열 대100→중70x2→소50x4"  → split
 *     "수명만료시 -20%"            → expirePct
 *     "수명만료시 다음파일 -15MB"   → expireNextFileMb
 *     "잘못클릭시 -10%"            → wrongClickPct
 *     "가짜커서 8개 5초간"          → fakeCursor
 * 이렇게 해두면 기획자가 시트 문구의 숫자만 고쳐도 게임에 바로 반영된다.
 */
export function parseSpecialEffect(spec) {
  const text = String(spec.special_effect ?? '');
  const effect = {
    split: null,
    expirePct: 0,
    expireNextFileMb: 0,
    wrongClickPct: 0,
    fakeCursor: null,
    // 시트에 뭐라도 적혀 있으면 UI에서 경고 표시를 하기 위해 원문도 남겨둔다
    text,
  };

  const split = text.match(/대\s*(\d+)\s*→\s*중\s*(\d+)\s*x\s*(\d+)\s*→\s*소\s*(\d+)\s*x\s*(\d+)/);
  if (split) {
    const [, big, mid, midCount, small] = split.map(Number);
    effect.split = { tiers: [big, mid, small], count: midCount || EFFECT_FALLBACK.splitCount };
  } else if (text.includes('분열')) {
    effect.split = { tiers: EFFECT_FALLBACK.splitTiers, count: EFFECT_FALLBACK.splitCount };
  }

  // "다음파일 -15MB"가 "-20%"보다 먼저 검사되어야 서로 안 겹친다(MB vs %).
  const nextFile = text.match(/수명만료시\s*다음파일\s*-?\s*(\d+)\s*MB/);
  if (nextFile) {
    effect.expireNextFileMb = Number(nextFile[1]);
  } else if (text.includes('수명만료시') && text.includes('MB')) {
    effect.expireNextFileMb = EFFECT_FALLBACK.expireNextFileMb;
  }

  const expirePct = text.match(/수명만료시\s*-?\s*(\d+)\s*%/);
  if (expirePct) {
    effect.expirePct = Number(expirePct[1]);
  } else if (text.includes('수명만료시') && text.includes('%')) {
    effect.expirePct = EFFECT_FALLBACK.expirePct;
  }

  const wrongClick = text.match(/잘못클릭시\s*-?\s*(\d+)\s*%/);
  if (wrongClick) {
    effect.wrongClickPct = Number(wrongClick[1]);
  } else if (text.includes('잘못클릭시')) {
    effect.wrongClickPct = EFFECT_FALLBACK.wrongClickPct;
  }

  const fakeCursor = text.match(/가짜커서\s*(\d+)\s*개\s*(\d+)\s*초/);
  if (fakeCursor) {
    effect.fakeCursor = { count: Number(fakeCursor[1]), durationSec: Number(fakeCursor[2]) };
  } else if (text.includes('가짜커서')) {
    effect.fakeCursor = {
      count: EFFECT_FALLBACK.fakeCursorCount,
      durationSec: EFFECT_FALLBACK.fakeCursorSec,
    };
  }

  return effect;
}
