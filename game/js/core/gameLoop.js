// 이 파일 역할: requestAnimationFrame 루프와 dt 계산만 담당한다. 게임 규칙은 전혀 모른다.

import { config } from '../config.js';

/**
 * 매 프레임 update(dt) → render(now)를 부른다. 게임 내용은 콜백으로 받으므로
 * 이 파일은 어떤 시스템도 import하지 않는다(순환참조 없음).
 * @param {(dt:number)=>void} update
 * @param {(now:number)=>void} render now(ms)는 requestAnimationFrame의 timestamp 그대로 —
 *   방해꾼 스프라이트 애니(sprite/animator.js)가 프레임을 고르는 단일 시계로 그대로 쓴다.
 * @param {(fps:number)=>void} [onFrame] 프레임마다 fps를 넘겨준다(디버그용)
 */
export function startLoop({ update, render, onFrame }) {
  let lastTime = 0;

  function frame(timeMs) {
    const rawDt = lastTime ? (timeMs - lastTime) / 1000 : 0;
    lastTime = timeMs;

    // 탭 전환 등으로 dt가 튀는 걸 막는다
    const dt = Math.min(rawDt, config.loop.maxDt);
    const fps = rawDt > 0 ? Math.round(1 / rawDt) : 0;

    update(dt);
    render(timeMs);
    onFrame?.(fps);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
