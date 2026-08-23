// 이 파일 역할: 클릭할 때마다 커서 자리에 퍼지는 잔물결(반응성 피드백).
// systems/juice.js의 처치 파편과는 다른 목적이다 — 저건 "잡았다"는 확실한
// 타격감이고, 이건 처치/허공 무관하게 "눌렸다"는 손맛이라 은은하게 겹친다.
// 전부 rAF now 기반 dt로만 움직인다(setInterval 없음, 이 프로젝트 전역 원칙).
// 위치가 안 바뀌고 반지름만 시간에 따라 커지므로(그리는 쪽, ui/renderEnemies.js의
// drawClickRipples가 age→반지름을 계산) 여기 update는 수명 감소뿐이다.

import { config } from '../config.js';
import { state } from '../core/state.js';

/**
 * 클릭 좌표에 리플 하나. color를 안 주면 config 기본색(허공 클릭용).
 * @param {number} x,y 월드 좌표
 * @param {string} [color] 처치 성공 시 콤보 tier 색 등으로 덮어쓸 때만 넘긴다.
 */
export function spawnClickRipple(x, y, color) {
  const c = config.fx.clickRipple;
  if (!c.enabled) return;

  state.ripples.push({
    x,
    y,
    life: c.lifeSec,
    maxLife: c.lifeSec,
    color: color || c.color,
  });

  // ★ 성능 상한 — 연타가 몰려도(성능 검증 요구사항) 동시 리플 수를 고정한다.
  // 오래된 것부터 잘라낸다(FIFO) — 새 클릭의 반응이 더 중요하다.
  if (state.ripples.length > c.maxRipples) {
    state.ripples.splice(0, state.ripples.length - c.maxRipples);
  }
}

/** 매 프레임. 수명이 다한 리플을 치운다. */
export function updateRipples(dt) {
  const list = state.ripples;
  for (let i = list.length - 1; i >= 0; i--) {
    list[i].life -= dt;
    if (list[i].life <= 0) list.splice(i, 1);
  }
}

/** 판이 새로 시작될 때처럼 잔여 연출이 남으면 안 되는 순간에 전부 지운다
 * (systems/juice.js의 clearJuice()와 같은 자리에서 같이 부른다). */
export function clearRipples() {
  state.ripples.length = 0;
}
