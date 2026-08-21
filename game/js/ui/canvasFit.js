// 이 파일 역할: 캔버스의 CSS 표시 크기를 내부 렌더 해상도의 비율을 지키면서 창에 꽉 차게(레터박스 포함) 맞춘다.
//
// CSS의 width:auto/max-width만으로는 "안 넘치게 줄이기"는 되지만 "창을 꽉 채우게
// 키우기"는 안 된다(replaced element의 auto 크기는 내재 크기 이상 안 커진다).
// object-fit으로 키울 수도 있지만, 그러면 캔버스의 getBoundingClientRect()가
// 실제로 보이는 크기가 아니라 박스 전체 크기를 돌려줘서 systems/input.js의
// 클릭 좌표 변환이 레터박스 구간에서 어긋난다. 그래서 실제 표시 크기를 JS로
// 계산해 style.width/height에 그대로 박아 넣는다 — getBoundingClientRect()가
// 항상 "진짜로 보이는 크기"와 정확히 일치하게 된다.
//
// style.width/height를 px로 명시하는 게 핵심이다 — %나 vw/vh를 쓰면 브라우저가
// 세로/가로 중 한쪽만 맞추고 나머지는 박스에 맞춰 늘려버릴 수 있어(찌그러짐),
// 반드시 아래 계산된 실제 px 값 하나로만 정해야 한다.

import { config } from '../config.js';

/**
 * 지금 창 크기에 맞춰 캔버스의 CSS 표시 크기를 다시 계산한다.
 * 내부 해상도(canvas.width/height, = config.canvas.width/height)는 안 건드린다.
 *
 * scale = min(창 폭 / 내부 폭, 창 높이 / 내부 높이)
 * styleW = 내부 폭 * scale, styleH = 내부 높이 * scale
 * → 두 축 중 "더 좁게 맞춰야 하는" 쪽에 맞추므로 항상 비율이 유지되고,
 *   남는 쪽에 레터박스(빈 여백)가 생긴다. 창보다 커지는 일은 없다(scale이 항상
 *   두 후보 중 작은 쪽이므로).
 */
export function fitCanvasToViewport(canvas) {
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  // 내부 해상도는 canvas.width/height(정수 px)를 그대로 쓴다 — config.canvas가
  // 아직 반영 전이어도(예: 부팅 극초반) canvas 엘리먼트 자체의 값이 항상 최신이다.
  const internalW = canvas.width;
  const internalH = canvas.height;

  const scale = Math.min(viewportW / internalW, viewportH / internalH);
  const styleW = internalW * scale;
  const styleH = internalH * scale;

  canvas.style.width = `${styleW}px`;
  canvas.style.height = `${styleH}px`;

  if (config.debug.enabled) {
    console.log('[canvasFit]', {
      internal: `${internalW}x${internalH}`,
      viewport: `${viewportW}x${viewportH}`,
      scale: scale.toFixed(4),
      style: `${styleW.toFixed(1)}x${styleH.toFixed(1)}`,
      ratioCheck: `내부=${(internalW / internalH).toFixed(4)} 표시=${(styleW / styleH).toFixed(4)}`,
    });
  }
}

/**
 * 최초 1회 맞추고, 창 크기가 바뀔 때마다 자동으로 다시 맞춘다.
 * 내부 해상도가 나중에 바뀌는 경우(리로드로 시트의 canvas_w/h가 바뀔 때)엔
 * 이 리스너가 아니라 main.js가 그 시점에 fitCanvasToViewport를 다시 불러야 한다.
 */
export function initCanvasFit(canvas) {
  fitCanvasToViewport(canvas);
  window.addEventListener('resize', () => fitCanvasToViewport(canvas));
}
