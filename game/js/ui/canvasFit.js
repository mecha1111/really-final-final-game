// 이 파일 역할: #desktop(1920x1080 고정 좌표계)을 창 크기에 맞춰 통째로 확대/축소한다(비율 유지 + 레터박스).
//
// 캔버스만 늘리지 않고 #desktop 전체를 스케일하는 이유:
// HTML 창·개그요소와 캔버스(방해꾼)가 같은 좌표계 위에 얹혀 있어야 서로 위치가
// 안 어긋난다. #desktop 하나만 스케일하면 그 안의 모든 것이 함께 움직인다.
//
// ★ 배율은 transform:scale이 아니라 zoom으로 건다 — 픽셀폰트가 뭉개지는 걸 막으려는 것.
//   transform은 원래 크기로 래스터라이즈한 비트맵을 나중에 다시 샘플링하므로 비정수
//   배율에서 글자에 회색 번짐이 남는다. zoom은 레이아웃 크기 자체를 바꿔서 글리프를
//   최종 크기로 직접 래스터라이즈한다 → 같은 배율에서도 획이 단단하다.
//   (style.css의 #stage/#desktop 주석에 근거와 실측 내용을 같이 적어뒀다.)
//
// 클릭 좌표는 손댈 필요가 없다 — zoom도 transform과 똑같이 getBoundingClientRect()에
// 반영되므로 systems/input.js의 역변환((clientX-rect.left) * 논리폭/rect.width)이
// 그대로 맞는다(왕복 오차 0.000000px 실측). 가운데 정렬은 #stage의 flex가 하므로
// 예전처럼 여백을 계산해 translate로 밀어줄 필요도 없다.

import { config, getUiReferenceCanvas } from '../config.js';

// zoom을 못 쓰는 브라우저(구형 파이어폭스 등)에서는 예전 방식(transform)으로 돌아간다.
// 폰트는 다시 뭉개지지만 게임 자체는 똑같이 동작한다.
const SUPPORTS_ZOOM = typeof CSS !== 'undefined' && CSS.supports?.('zoom', '1');

/** 지금 창 크기에 맞춰 #desktop의 배율(과 폴백일 때의 위치)을 다시 계산한다. */
export function fitCanvasToViewport(canvas) {
  const desktop = document.getElementById('desktop');
  const stage = document.getElementById('stage');
  if (!desktop) return;

  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  // ★ #desktop의 좌표계는 "UI 기준 해상도"(uiBaseWidth=1920)다. 캔버스 내부
  //   해상도(시트의 canvas_w, 지금 960)와는 다를 수 있다 — index.html/style.css의
  //   HTML 좌표(아이콘 left:24, 창 left:150 …)가 전부 1920을 놓고 짠 값이라
  //   여기를 캔버스 내부 해상도로 잡으면 HTML만 2배로 커져 다 어긋난다.
  //
  //   캔버스는 CSS 크기를 이 좌표계에 맞춰 늘려서(내부 960 → 표시 1920) 겹쳐 놓는다.
  //   클릭 역변환은 논리폭 / rect.width 를 쓰므로(systems/input.js)
  //   이 확대까지 자동으로 흡수된다 — 좌표는 여전히 정확하다.
  //   방해꾼이 화면에서 보이는 크기도 결과적으로 시트 크기 × (1920/baseWidth)로
  //   고정되어, 시트의 canvas_w를 바꿔도 체감 크기가 안 변한다.
  const ref = getUiReferenceCanvas();
  const baseW = ref.width;
  const baseH = ref.height;
  desktop.style.width = `${baseW}px`;
  desktop.style.height = `${baseH}px`;
  canvas.style.width = `${baseW}px`;
  canvas.style.height = `${baseH}px`;

  // 두 축 중 더 좁게 맞춰야 하는 쪽에 맞춘다 → 비율 유지 + 반대쪽에 레터박스
  const scale = Math.min(viewportW / baseW, viewportH / baseH);
  const shownW = baseW * scale;
  const shownH = baseH * scale;

  if (SUPPORTS_ZOOM) {
    desktop.style.zoom = String(scale);
  } else {
    // 폴백: 예전처럼 transform으로 줄이고 여백을 직접 계산해 가운데로 민다.
    stage?.classList.add('no-zoom');
    desktop.style.zoom = '';
    const offsetX = (viewportW - shownW) / 2;
    const offsetY = (viewportH - shownH) / 2;
    desktop.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  }

  if (config.debug.enabled) {
    console.log('[canvasFit]', {
      mode: SUPPORTS_ZOOM ? 'zoom' : 'transform(폴백)',
      canvasInternal: `${canvas.width}x${canvas.height}`, // 시트의 canvas_w/h
      desktopBase: `${baseW}x${baseH}`, // UI 좌표계(uiBaseWidth 기준)
      viewport: `${viewportW}x${viewportH}`,
      scale: scale.toFixed(4),
      shown: `${shownW.toFixed(1)}x${shownH.toFixed(1)}`,
      ratioCheck: `내부=${(canvas.width / canvas.height).toFixed(4)} 표시=${(shownW / shownH).toFixed(4)}`,
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
