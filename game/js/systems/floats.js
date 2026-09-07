// 이 파일 역할: "+60MB" / "-10%" 처럼 잠깐 떴다 사라지는 글씨의 상태를 관리한다.

import { config } from '../config.js';
import { state } from '../core/state.js';

/**
 * @param {string} text 표시할 문구
 * @param {boolean} positive true면 좋은 일(초록), false면 나쁜 일(빨강)
 */
export function addFloat(text, x, y, positive) {
  state.floats.push({ text, x, y, age: 0, positive });
  // ★ 상한 — 파티클(config.enemy.kill.maxParticles)·클릭 리플
  //   (config.fx.clickRipple.maxRipples)엔 있는데 여기만 없었다. 뜬 글씨는 한
  //   장당 외곽선 8방향까지 총 9번 fillText를 그리므로(ui/renderEnemies.js의
  //   drawFloats) 개당 그리기 비용이 셋 중 가장 비싸다 — 피해가 연달아 들어오는
  //   순간에 무제한으로 쌓이지 않게 오래된 것부터 버린다.
  const max = config.fx.maxFloats;
  if (state.floats.length > max) state.floats.splice(0, state.floats.length - max);
}

export function updateFloats(dt) {
  const floats = state.floats;
  if (floats.length === 0) return;
  // ★ 예전엔 매 프레임 filter()로 배열을 새로 만들었다 — 이 프로젝트에서 매
  //   프레임 배열을 새로 할당하던 유일한 자리였다. 뒤에서부터 훑으며 제자리에서
  //   빼면 할당이 없어진다(systems/juice.js·clickRipple.js가 이미 쓰는 방식과 통일).
  const maxAge = config.fx.floatSec;
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.age += dt;
    if (f.age >= maxAge) floats.splice(i, 1);
  }
}

export function clearFloats() {
  state.floats = [];
}
