// 이 파일 역할: "+60MB" / "-10%" 처럼 잠깐 떴다 사라지는 글씨의 상태를 관리한다.

import { config } from '../config.js';
import { state } from '../core/state.js';

/**
 * @param {string} text 표시할 문구
 * @param {boolean} positive true면 좋은 일(초록), false면 나쁜 일(빨강)
 */
export function addFloat(text, x, y, positive) {
  state.floats.push({ text, x, y, age: 0, positive });
}

export function updateFloats(dt) {
  if (state.floats.length === 0) return;
  for (const f of state.floats) f.age += dt;
  state.floats = state.floats.filter((f) => f.age < config.fx.floatSec);
}

export function clearFloats() {
  state.floats = [];
}
