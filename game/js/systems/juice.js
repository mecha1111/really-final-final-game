// 이 파일 역할: 처치 순간의 타격감 — 히트스톱, 터지는 조각(파티클), 처치 흔들림.
// "언제 터뜨릴지"는 enemies/Enemy.js의 kill()이 부르고, "얼마나 세게"는 전부
// config.enemy.kill에 있다. 이 파일은 숫자를 직접 들고 있지 않는다.
//
// ★ 화면 흔들림은 systems/screenShake.js에 위임한다 — DOM transform이 아니라
//   그리기 원점만 미는 방식이어야 하는 이유가 거기 적혀 있다(canvas 조상에
//   transform 애니를 걸면 크롬이 canvas의 rect를 영구히 망가뜨리는 실측 버그).

import { config } from '../config.js';
import { state } from '../core/state.js';
import { getScaleFactor } from '../config.js';
import { addShake } from './screenShake.js';

const rand = (min, max) => min + Math.random() * (max - min);

// 남은 히트스톱(ms). 0보다 크면 월드 갱신이 멈춘다(main.js가 확인한다).
let hitStopMs = 0;

/**
 * 처치 순간 1회. 히트스톱 + 조각 + 흔들림을 한꺼번에 건다.
 * @param {number} x,y 터질 자리(월드 좌표) — 보통 죽은 놈의 그림 중심
 */
export function burstOnKill(x, y) {
  const c = config.enemy.kill;
  const s = getScaleFactor();

  // 여러 마리가 같은 프레임에 죽어도 정지 시간이 합산되지 않게 최대값만 취한다
  // (합산하면 연쇄 처치 때 화면이 눈에 띄게 얼어붙는다).
  hitStopMs = Math.max(hitStopMs, c.hitStopMs);

  addShake(c.shakePx * s, c.shakeMs);

  for (let i = 0; i < c.particleCount; i++) {
    // 사방으로 고르게 퍼지되, 각도를 조금씩 흩뜨려서 규칙적으로 안 보이게 한다
    const angle = (Math.PI * 2 * i) / c.particleCount + rand(-0.35, 0.35);
    const speed = c.particleSpeed * s * rand(1 - c.particleSpeedJitter, 1 + c.particleSpeedJitter);
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: c.particleLifeSec * rand(0.7, 1.15),
      maxLife: c.particleLifeSec,
      size: c.particleSize * s * rand(0.65, 1.25),
      spin: rand(-12, 12), // 조각이 돌면서 날아가면 훨씬 부서진 느낌이 난다
      rot: rand(0, Math.PI * 2),
    });
  }
}

/**
 * main.js가 매 프레임 가장 먼저 부른다. 정지 중이면 true를 돌려주고, 그만큼 시간을 깎는다.
 * true면 이번 프레임은 월드를 갱신하지 않는다(그리기는 계속한다 — 그래야 멈춘 화면이 보인다).
 */
export function consumeHitStop(dt) {
  if (hitStopMs <= 0) return false;
  hitStopMs -= dt * 1000;
  if (hitStopMs < 0) hitStopMs = 0;
  return true;
}

/** 판이 새로 시작될 때처럼 잔여 연출이 남으면 안 되는 순간에 전부 지운다. */
export function clearJuice() {
  hitStopMs = 0;
  state.particles.length = 0;
}

/** 매 프레임. 조각을 움직이고 수명이 다한 건 치운다. */
export function updateParticles(dt) {
  const c = config.enemy.kill;
  const list = state.particles;

  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.life -= dt;
    if (p.life <= 0) {
      list.splice(i, 1);
      continue;
    }
    // 공기저항으로 서서히 느려지고, 중력으로 아래로 처진다 — 둘 다 있어야
    // "튀었다가 떨어지는" 궤적이 나온다(어느 하나만 있으면 밋밋하다).
    const drag = Math.max(0, 1 - c.particleDrag * dt);
    p.vx *= drag;
    p.vy = p.vy * drag + c.particleGravity * getScaleFactor() * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.spin * dt;
  }
}
