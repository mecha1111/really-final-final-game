// 이 파일 역할: 방해꾼의 이동 패턴. move_pattern 문구 → 실제 움직임으로 옮기는 로직만 모았다.
// copier(homing)와 bait 전용 로직은 각각 homing.js / bait.js로 분리돼 있고, 여기서는 그쪽으로 위임만 한다.

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
      // 매 프레임 커서 쪽으로 방향을 다시 잡으므로 초기 속도는 의미 없다
      enemy.vx = 0;
      enemy.vy = 0;
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
    const dx = pointer.x - enemy.x;
    const dy = pointer.y - enemy.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1) {
      enemy.vx = (dx / dist) * enemy.speed;
      enemy.vy = (dy / dist) * enemy.speed;
    } else {
      enemy.vx = 0;
      enemy.vy = 0;
    }
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
