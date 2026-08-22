// 이 파일 역할: 방해꾼의 이동 패턴. move_pattern 문구 → 실제 움직임으로 옮기는 로직만 모았다.
// copier(homing)와 bait 전용 로직은 각각 homing.js / bait.js로 분리돼 있고, 여기서는 그쪽으로 위임만 한다.

import { config } from '../config.js';
import { initBait, updateBait } from './bait.js';
import { placeNearPointer, updateHoming } from './homing.js';

// move_pattern 칸의 한국어 문구를 실제 이동 방식으로 연결한다.
// 시트에 새 문구가 생기면 여기 한 줄만 추가하면 된다(모르는 문구는 bounce).
export const PATTERN_KIND = {
  '직선+벽반사': 'bounce',
  '떠다님': 'wander',
  '살짝 떠다님': 'wander',
  '배회': 'wander',
  '커서쪽 접근': 'chase',
  '좌우 왕복': 'pingpong',
  '화면밖→안 진입후 정지': 'enterStop',
  '빠르게 설침': 'dash',
  '아주 느림': 'wander',
};

// dash(빠르게 설침)는 같은 wander라도 훨씬 자주 방향을 바꿔야 "설치는" 느낌이 난다.
// 키우면 덜 산만해진다.
const DASH_RETARGET_SCALE = 0.35;

const rand = (min, max) => min + Math.random() * (max - min);

export function pickRetargetDelay(enemy, rules) {
  const base = rand(rules.dirChangeMin, rules.dirChangeMax);
  return enemy.kind === 'dash' ? base * DASH_RETARGET_SCALE : base;
}

/** 놀이 영역 밖 네 가장자리 중 하나로 옮긴다(enterStop이 화면 밖에서 시작할 때). */
export function placeOnRandomEdge(enemy, playArea) {
  const edge = Math.floor(rand(0, 4));
  if (edge === 0) {
    enemy.x = playArea.x - enemy.w;
  } else if (edge === 1) {
    enemy.x = playArea.x + playArea.w + enemy.w;
  } else if (edge === 2) {
    enemy.y = playArea.y - enemy.h;
  } else {
    enemy.y = playArea.y + playArea.h + enemy.h;
  }
}

/** 스폰 직후 한 번. 패턴에 맞는 초기 속도/위치를 잡는다. */
export function initMovement(enemy, rules, playArea) {
  const angle = rand(0, Math.PI * 2);

  switch (enemy.kind) {
    case 'pingpong':
      enemy.vx = Math.random() < 0.5 ? -enemy.speed : enemy.speed;
      enemy.vy = 0;
      break;

    case 'enterStop':
      // 스포너가 정해준 (x, y)가 "멈출 자리"가 되고, 시작은 화면 밖이다.
      enemy.targetX = enemy.x;
      enemy.targetY = enemy.y;
      placeOnRandomEdge(enemy, playArea);
      enemy.entering = true;
      break;

    case 'homing':
      // copier: 진짜 커서 근처에 뿅 나타나 짧게 다가가다 터진다.
      placeNearPointer(enemy, enemy.spawnPointer, playArea);
      break;

    case 'bait':
      // bait: 물리 이동이 아니라 전용 상태기계(enemies/bait.js)로 움직인다.
      // rules를 넘기는 이유: bait의 실제 수명은 시트 값이 아니라 효과 재생시간으로
      // 다시 정하는데(effects.js가 아니라 bait.js가 직접), 그래도 난이도의 수명
      // 배율(rules.lifetimeMultiplier)은 그대로 존중해야 디버그 슬라이더가 먹는다.
      initBait(enemy, rules, playArea);
      break;

    case 'chase':
      // 매 프레임 커서 쪽으로 방향을 다시 잡으므로 초기 속도는 의미 없다.
      enemy.vx = 0;
      enemy.vy = 0;
      // 지연 추격이 쫓아갈 "뒤처진 목표점". 자기 자리에서 시작해야 스폰 순간
      // 목표가 커서로 확 튀지 않는다(그러면 지연을 준 의미가 없다).
      enemy.chaseGoalX = enemy.x;
      enemy.chaseGoalY = enemy.y;
      break;

    default:
      enemy.vx = Math.cos(angle) * enemy.speed;
      enemy.vy = Math.sin(angle) * enemy.speed;
      break;
  }

  enemy.retargetTimer = pickRetargetDelay(enemy, rules);
}

/** 놀이 영역 안에 가두고, 벽에 닿으면 튕긴다. */
export function bounceInside(enemy, playArea) {
  const halfW = enemy.w / 2;
  const halfH = enemy.h / 2;
  const left = playArea.x + halfW;
  const right = playArea.x + playArea.w - halfW;
  const top = playArea.y + halfH;
  const bottom = playArea.y + playArea.h - halfH;

  if (enemy.x < left) {
    enemy.x = left;
    enemy.vx = Math.abs(enemy.vx);
  } else if (enemy.x > right) {
    enemy.x = right;
    enemy.vx = -Math.abs(enemy.vx);
  }

  if (enemy.y < top) {
    enemy.y = top;
    enemy.vy = Math.abs(enemy.vy);
  } else if (enemy.y > bottom) {
    enemy.y = bottom;
    enemy.vy = -Math.abs(enemy.vy);
  }
}

/**
 * '커서쪽 접근'(chase) 한 프레임. 지금은 fake_btn(함정 확인창)만 이 경로를 탄다.
 *
 * ★ 핵심은 "무엇을 커서에 맞추느냐"다. 예전엔 몸통 중심을 커서로 보냈는데,
 *   fake_btn의 확인 버튼은 스프라이트 아래쪽(중심보다 아래, config.enemy.artHitbox의
 *   fake_btn = y 281~366/512)에 그려져 있다. 그래서 몸통이 커서에 도착해도 버튼은 항상
 *   커서보다 아래로 빗나가서, "실수로 확인을 밟는" 함정이 사실상 작동하지 않았다.
 *   이제 몸통 중심이 아니라 **판정 사각형(hitRect)의 중심**이 커서에 오도록 목표를
 *   그 오프셋만큼 당겨서 조준한다. 판정이 이미 한가운데인 종류는 오프셋이 0이라
 *   아무 영향이 없다 — 그래서 chase 전체에 일반화해도 안전하다.
 *
 * ★ 판정 사각형은 hitRect()에서 그대로 가져온다(별도 계산 금지). 그리기와 판정이
 *   갈라져서 "보이는 곳과 눌리는 곳이 다른" 사고가 이 프로젝트에서 반복됐는데,
 *   조준까지 제3의 좌표로 따로 계산하면 같은 함정이 하나 더 생긴다.
 */
function updateChase(enemy, dt, pointer) {
  const c = config.enemy.chase;

  // 1) 커서를 곧바로 쫓지 않고 뒤처진 목표점을 쫓는다(지수 감쇠) — 계속 움직이면
  //    영영 못 잡고, 멈추면 서서히 따라붙는 "피할 수는 있는" 여지가 여기서 나온다.
  const k = c.pointerLagSec > 0 ? 1 - Math.exp(-dt / c.pointerLagSec) : 1;
  enemy.chaseGoalX += (pointer.x - enemy.chaseGoalX) * k;
  enemy.chaseGoalY += (pointer.y - enemy.chaseGoalY) * k;

  // 2) 판정 중심이 목표점에 오도록 몸통 목표를 역으로 계산한다(위 주석 참고).
  const r = enemy.hitRect();
  const aimOffX = r ? r.x + r.w / 2 - enemy.x : 0;
  const aimOffY = r ? r.y + r.h / 2 - enemy.y : 0;

  const dx = enemy.chaseGoalX - aimOffX - enemy.x;
  const dy = enemy.chaseGoalY - aimOffY - enemy.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.5) {
    enemy.vx = 0;
    enemy.vy = 0;
    return;
  }

  // 3) 가까워질수록 감속 — 마지막 몇 px를 아주 천천히 좁혀서 약올린다.
  const arriveR = c.arriveRadius * enemy.scaleFactor;
  const arrive = arriveR > 0 ? Math.min(1, dist / arriveR) : 1;
  const speed = enemy.speed * c.speedMult * Math.max(c.minSpeedRatio, arrive);
  enemy.vx = (dx / dist) * speed;
  enemy.vy = (dy / dist) * speed;
}

/**
 * 한 프레임 이동. world = { rules, playArea, pointer }
 * homing/bait는 이 함수의 일반 규칙을 안 타고 각자 전용 로직(homing.js/bait.js)으로 넘어간다.
 */
export function moveEnemy(enemy, dt, world) {
  const { rules, playArea, pointer } = world;

  if (enemy.kind === 'bait') {
    updateBait(enemy); // 전용 상태기계 — 벽 튕김 등 일반 이동 규칙과 무관
    return;
  }

  if (enemy.kind === 'homing') {
    updateHoming(enemy, dt, pointer); // 화면 밖에서 접근해올 수 있어 벽 튕김을 안 쓴다
    return;
  }

  if (enemy.kind === 'enterStop') {
    if (!enemy.entering) return; // 다 들어왔으면 그 자리에 정지
    const dx = enemy.targetX - enemy.x;
    const dy = enemy.targetY - enemy.y;
    const dist = Math.hypot(dx, dy);
    const step = enemy.speed * dt;

    if (dist <= step || dist === 0) {
      enemy.x = enemy.targetX;
      enemy.y = enemy.targetY;
      enemy.entering = false;
    } else {
      enemy.x += (dx / dist) * step;
      enemy.y += (dy / dist) * step;
    }
    return; // 진입 중에는 벽 튕김을 적용하지 않는다(화면 밖에서 오므로)
  }

  if (enemy.kind === 'chase') {
    updateChase(enemy, dt, pointer);
  } else if (enemy.kind === 'wander' || enemy.kind === 'dash') {
    enemy.retargetTimer -= dt;
    if (enemy.retargetTimer <= 0) {
      const angle = rand(0, Math.PI * 2);
      enemy.vx = Math.cos(angle) * enemy.speed;
      enemy.vy = Math.sin(angle) * enemy.speed;
      enemy.retargetTimer = pickRetargetDelay(enemy, rules);
    }
  }

  enemy.x += enemy.vx * dt;
  enemy.y += enemy.vy * dt;

  bounceInside(enemy, playArea);
}
