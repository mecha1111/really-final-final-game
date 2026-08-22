// 이 파일 역할: bait(시선 강탈) 전용 상태기계 — 종류·연출 선택, 모서리 등장 위치,
// 각 연출의 생애주기(등장/체류/소멸) 구간 계산. 그리기는 ui/baitRender.js가 맡는다.
// 다른 방해꾼의 이동 로직(behaviors.js)과 완전히 분리되어 있다.

import { config } from '../config.js';
import { FRAME_SETS } from '../sprite/animator.js';

const rand = (min, max) => min + Math.random() * (max - min);
const easeOut = (t) => 1 - (1 - t) ** 3;

// 연출 5종. 순서는 의미 없다 — pickBaitEffect()가 weights 비율로 하나를 뽑는다.
const EFFECT_KEYS = ['noise', 'slideHuge', 'pixelDissolve', 'glitchPop', 'flicker'];

/** config.bait.effects.weights 비율로 연출 하나를 고른다. */
function pickBaitEffect() {
  const weights = config.bait.effects.weights;
  const total = EFFECT_KEYS.reduce((sum, k) => sum + (weights[k] ?? 0), 0);
  let r = rand(0, total || 1);
  for (const k of EFFECT_KEYS) {
    r -= weights[k] ?? 0;
    if (r <= 0) return k;
  }
  return EFFECT_KEYS[0]; // 부동소수 오차로 못 고른 극단적인 경우의 방어
}

/**
 * 연출별 생애주기 구간(초)을 계산한다. 전부 config.bait.effects[key]의 값만 쓴다
 * (하드코딩 금지 — 시간 조절은 config 한 곳에서).
 * 반환값의 total이 곧 이 bait의 실제 수명이 된다(initBait에서 enemy.lifetime에 대입).
 */
function computePhases(effectKey) {
  const c = config.bait.effects[effectKey];

  if (effectKey === 'noise' || effectKey === 'pixelDissolve') {
    const enterEnd = c.enterSec;
    const dissolveStart = enterEnd + c.holdSec;
    const total = dissolveStart + c.dissolveSec;
    return { kind: effectKey, enterEnd, dissolveStart, total };
  }
  if (effectKey === 'slideHuge') {
    const enterEnd = c.slideSec;
    const exitStart = enterEnd + c.holdSec;
    const total = exitStart + c.slideSec;
    return { kind: effectKey, enterEnd, exitStart, total };
  }
  // glitchPop, flicker — 구조가 같다(등장/체류/퇴장 세 구간)
  const enterEnd = c.enterSec;
  const exitStart = enterEnd + c.holdSec;
  const total = exitStart + c.exitSec;
  return { kind: effectKey, enterEnd, exitStart, total };
}

/**
 * 노이즈/픽셀 디졸브용 셀 임계값 격자를 만든다. 셀 하나 = "전체 진행도가 이 값을
 * 넘으면 그 셀이 지워진다"(0~1). 스폰 시 1회만 만들어 enemy에 들고 있어야 한다 —
 * 매 프레임 다시 굴리면 "디졸브"가 아니라 그냥 반짝이는 노이즈로 보인다.
 * verticalBias=0이면 완전 무작위(모래알, pixelDissolve), 1이면 완전 위→아래
 * 순서(noise는 0.65를 써서 "위→아래로 향하되 경계가 들쭉날쭉"하게 만든다).
 */
function buildDissolveMap(cellPx, verticalBias) {
  const cols = Math.max(1, Math.ceil(512 / cellPx));
  const rows = Math.max(1, Math.ceil(512 / cellPx));
  const map = new Float32Array(cols * rows);
  for (let ry = 0; ry < rows; ry++) {
    const vertical = rows > 1 ? ry / (rows - 1) : 0; // 0(위)~1(아래)
    for (let rx = 0; rx < cols; rx++) {
      const noise = Math.random();
      map[ry * cols + rx] = verticalBias * vertical + (1 - verticalBias) * noise;
    }
  }
  return { cols, rows, map };
}

/**
 * 스폰 시 1회. 종류(그림)·연출을 고르고, 등장 위치(모서리)와 생애주기를 정한다.
 * rules는 난이도의 수명 배율(lifetimeMultiplier)만 쓴다 — bait의 수명 자체는
 * 시트 값이 아니라 골라잡은 연출의 총 재생시간이다(아래 주석 참고).
 */
export function initBait(enemy, rules, playArea) {
  const kinds = FRAME_SETS.bait.kinds;
  const kind = kinds[Math.floor(rand(0, kinds.length))];
  enemy.baitKind = kind;
  const isBubble = kind === 'bubble';

  // ★ 크기는 시트의 size_w(80 — 옛 2프레임 자산 기준의 낡은 값)를 무시하고
  //   config.bait.sizePx(1920 기준 화면 CSS px)로 다시 정한다. Enemy 생성자가
  //   이미 scaleFactor를 계산해뒀는데 그건 baseWidth(1280) 기준이라, 1920 기준
  //   px를 먼저 1280 기준 단위로 환산한 뒤 곱한다 — 그래야 해상도가 바뀌어도
  //   화면에서 차지하는 비율이 똑같이 유지된다(다른 방해꾼과 같은 원리,
  //   enemies/Enemy.js의 this.w 계산 주석 참고).
  const px1280 = config.bait.sizePx * (config.canvas.baseWidth / config.canvas.uiBaseWidth);
  enemy.w = px1280 * enemy.scaleFactor;
  enemy.h = enemy.w; // 원본이 512x512 정사각형이라 가로세로 비율 1:1

  enemy.baitEffect = pickBaitEffect();
  const phases = computePhases(enemy.baitEffect);
  enemy.baitPhases = phases;

  // ★ bait는 시트의 lifetime(5초 — 옛 값, 지금 연출엔 턱없이 짧다)을 무시하고
  //   고른 연출의 총 재생시간을 실제 수명으로 삼는다. 노이즈 디졸브 하나만도
  //   8초라, 5초 수명 그대로 두면 core/stageManager.js의 만료 처리가 연출이
  //   끝나기도 전에 강제로 끊어버린다. 난이도의 수명 배율은 그대로 존중한다 —
  //   디버그 패널로 배율을 낮추면 bait 연출도 같이 빨리 넘어가야 테스트가 되므로.
  enemy.lifetime = phases.total * rules.lifetimeMultiplier;

  // slideHuge는 "초대형"이라 크기를 키운 뒤에 위치를 잡아야 insetX/Y가 커진
  // 몸집 기준으로 맞는다(먼저 위치를 잡고 나중에 키우면 모서리에서 삐져나온다).
  if (enemy.baitEffect === 'slideHuge') {
    const mult = config.bait.effects.slideHuge.sizeMult;
    enemy.w *= mult;
    enemy.h *= mult;
  }

  // 0=좌상 1=우상 2=좌하 3=우하. 말풍선 있는 그림은 우하단 고정("어.시.오"가
  // 시스템 알림처럼 보이려면 항상 같은 자리에 떠야 자연스럽다), 나머지 셋은 랜덤.
  const corner = isBubble ? 3 : Math.floor(rand(0, 4));
  enemy.baitCorner = corner;

  const s = enemy.scaleFactor;
  const insetX = config.bait.insetX * s;
  const insetY = config.bait.insetY * s;
  const halfW = enemy.w / 2;
  const halfH = enemy.h / 2;
  const left = corner === 0 || corner === 2;
  const top = corner === 0 || corner === 1;

  enemy.baitRestX = left ? playArea.x + insetX : playArea.x + playArea.w - insetX;
  enemy.baitRestY = top ? playArea.y + insetY : playArea.y + playArea.h - insetY;
  enemy.baitOffX = left ? playArea.x - halfW : playArea.x + playArea.w + halfW;
  enemy.baitOffY = top ? playArea.y - halfH : playArea.y + playArea.h + halfH;

  // slideHuge만 화면 밖에서 물리적으로 밀려 들어온다 — 나머지 넷은 "모서리 고정
  // 출현" 규칙대로 처음부터 쉴 자리에 있고, 등장/소멸은 투명도·노이즈로만 표현한다.
  if (enemy.baitEffect === 'slideHuge') {
    enemy.x = enemy.baitOffX;
    enemy.y = enemy.baitOffY;
  } else {
    enemy.x = enemy.baitRestX;
    enemy.y = enemy.baitRestY;
  }

  // 노이즈/픽셀 디졸브의 셀 임계값 맵은 스폰 시 1회만 만든다(위 buildDissolveMap
  // 주석 참고 — 매 프레임 다시 만들면 안 된다).
  if (enemy.baitEffect === 'noise') {
    const c = config.bait.effects.noise;
    enemy.baitDissolveMap = buildDissolveMap(c.cellPx, c.verticalBias);
  } else if (enemy.baitEffect === 'pixelDissolve') {
    const c = config.bait.effects.pixelDissolve;
    enemy.baitDissolveMap = buildDissolveMap(c.grainPx, 0); // 모래알 = 완전 무작위
  }

  // 글리치 연출이 "이번 틱의 흔들림 값"을 결정적으로 뽑을 때 쓰는 씨앗.
  // 완전한 진짜 난수 대신 이걸 쓰는 이유는 ui/baitRender.js 상단 주석 참고.
  enemy.baitGlitchSeed = Math.floor(rand(0, 1e6));
}

/**
 * 매 프레임. bait는 물리 이동이 아니라 이 상태기계로만 위치를 정한다 — slideHuge만
 * 실제로 움직이고, 나머지 넷은 스폰 때 잡아둔 자리에 그대로 고정돼 있다(연출은
 * 그리기 쪽에서 투명도/노이즈로 표현하므로 위치를 건드릴 필요가 없다).
 */
export function updateBait(enemy) {
  if (enemy.baitEffect !== 'slideHuge') return; // 나머지는 위치 고정 — 매 프레임 할 일 없음

  const p = enemy.baitPhases;
  const age = enemy.age;

  if (age < p.enterEnd) {
    const t = p.enterEnd > 0 ? easeOut(age / p.enterEnd) : 1;
    enemy.x = enemy.baitOffX + (enemy.baitRestX - enemy.baitOffX) * t;
    enemy.y = enemy.baitOffY + (enemy.baitRestY - enemy.baitOffY) * t;
  } else if (age < p.exitStart) {
    enemy.x = enemy.baitRestX;
    enemy.y = enemy.baitRestY;
  } else {
    const span = enemy.lifetime - p.exitStart;
    const t = span > 0 ? easeOut((age - p.exitStart) / span) : 1;
    enemy.x = enemy.baitRestX + (enemy.baitOffX - enemy.baitRestX) * t;
    enemy.y = enemy.baitRestY + (enemy.baitOffY - enemy.baitRestY) * t;
  }
}
