// 이 파일 역할: copier(homing) 전용 이동 — 진짜 커서 근처에 스폰되고, 커서를 쫓아가 안착하면 터진다.

import { config } from '../config.js';

const rand = (min, max) => min + Math.random() * (max - min);
const clampNum = (v, min, max) => Math.max(min, Math.min(max, v));

/**
 * 스폰 시 1회. 화면 가장자리가 아니라 진짜 커서에서 무작위 각도·거리
 * (config.enemy.homingSpawnDist*)만큼 떨어진 곳에 뿅 나타난다. 놀이 영역을
 * 벗어나면 안 보이니 안쪽으로 클램프한다.
 */
export function placeNearPointer(enemy, pointer, playArea) {
  const angle = rand(0, Math.PI * 2);
  const dist = rand(config.enemy.homingSpawnDistMin, config.enemy.homingSpawnDistMax) * enemy.scaleFactor;

  const halfW = enemy.w / 2;
  const halfH = enemy.h / 2;
  const minX = playArea.x + halfW;
  const maxX = playArea.x + playArea.w - halfW;
  const minY = playArea.y + halfH;
  const maxY = playArea.y + playArea.h - halfH;

  enemy.x = clampNum(pointer.x + Math.cos(angle) * dist, minX, maxX);
  enemy.y = clampNum(pointer.y + Math.sin(angle) * dist, minY, maxY);
}

/**
 * 매 프레임. 진짜 커서를 향해 곧장 다가가고, 안착 판정 거리 안으로 들어오면
 * enemy.kill('triggered')로 자폭을 알린다(실제 흩뿌리기는 enemies/effects.js).
 */
export function updateHoming(enemy, dt, pointer) {
  const dx = pointer.x - enemy.x;
  const dy = pointer.y - enemy.y;
  const dist = Math.hypot(dx, dy);

  // homingArriveDist도 기준 해상도 값이라 스케일한다.
  if (dist <= config.enemy.homingArriveDist * enemy.scaleFactor) {
    enemy.kill('triggered');
    return;
  }

  enemy.vx = (dx / dist) * enemy.speed;
  enemy.vy = (dy / dist) * enemy.speed;
  enemy.x += enemy.vx * dt;
  enemy.y += enemy.vy * dt;
}
