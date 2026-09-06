// 이 파일 역할: #desktop(1920x1080 고정 좌표계)을 창 크기에 맞춰 통째로 확대/축소한다(비율 유지 + 레터박스).
//
// 캔버스만 늘리지 않고 #desktop 전체를 스케일하는 이유:
// HTML 창·개그요소와 캔버스(방해꾼)가 같은 좌표계 위에 얹혀 있어야 서로 위치가
// 안 어긋난다. #desktop 하나만 스케일하면 그 안의 모든 것이 함께 움직인다.
//
// ★ 배율은 CSS zoom이 아니라 transform: scale로 건다 (2026-08-22 전환).
//
//   원래는 zoom이었다. 이유는 픽셀폰트였다 — transform은 원래 크기로 한 번
//   래스터라이즈한 비트맵을 나중에 다시 샘플링해서 비정수 배율에서 글자에 회색
//   번짐이 남고, zoom은 레이아웃 크기 자체를 바꿔 글리프를 최종 크기로 직접
//   래스터라이즈하므로 획이 단단했다(8배 확대 비교로 확인했던 내용).
//
//   그런데 zoom에는 좌표 쪽 함정이 있었다: 일부 크롬에서 getBoundingClientRect()가
//   조상의 CSS zoom을 크기에 반영하지 않는다. 사용자 실기에서 zoom 0.525인데
//   rect가 1920x1080(레이아웃 크기)으로 나오고 rect.left만 화면 좌표(65)라,
//   크기와 위치가 서로 다른 좌표계로 섞여 나왔다. 그러면 클릭 지점이 화면 위치에
//   비례해서 어긋난다. rect를 안 쓰고 표시 크기를 따로 계산하는 우회를 여러 번
//   시도했지만(ui/canvasGeometry.js) 사용자 실기에서 계속 어긋난다는 보고가 이어졌다.
//
//   transform: scale은 어느 브라우저에서나 getBoundingClientRect()에 정확히
//   반영된다 — rect.width가 곧 실제 표시 폭이다. 그래서 표준 역변환
//   (clientX - rect.left) * 논리폭 / rect.width 가 우회 없이 그대로 맞는다.
//   창 드래그(ui/desktop.js)도 rect.width / 1920 으로 배율을 역산하는데, zoom일
//   때는 이 값이 1로 나와 틀렸고 transform이면 제대로 나온다 — 같이 고쳐진다.
//
//   대가: 픽셀폰트가 비정수 배율에서 예전처럼 다소 뭉개진다. 좌표가 맞는 것이
//   글자가 또렷한 것보다 우선이라 이쪽을 택했다.
//
// transform 사용 시 주의점 둘 (아래 코드와 style.css의 .no-zoom 규칙이 처리한다):
//   · transform-origin을 top left로 고정해야 배율과 위치 계산이 단순해진다.
//   · transform은 레이아웃 공간을 안 먹는다(줄여도 원래 1920x1080 자리를 차지).
//     그래서 flex 가운데 정렬이 안 통하고, 여백을 직접 계산해 translate로 민다.

import { config, getUiReferenceCanvas } from '../config.js';
import { state } from '../core/state.js';

// true로 되돌리면 예전 방식(CSS zoom)으로 복귀한다. 폰트는 또렷해지지만 위 주석의
// rect 문제가 같이 돌아온다.
const USE_CSS_ZOOM = false;

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

  // ★ 캔버스 백킹스토어는 "캔버스의 CSS 박스 크기"(= baseW/baseH)에 맞춘다.
  //   예전엔 시트의 canvas_w(960)로 고정이라, CSS 박스(1920)보다 작아서 브라우저가
  //   한 번 확대한 뒤 zoom이 다시 축소하는 왕복이 생겼다 — 그 확대 단계에서 캔버스에
  //   그린 글씨(대기/결과 화면)가 뭉개졌다. zoom으로는 안 고쳐지는 별개 원인이다
  //   (zoom은 HTML 글자를 고칠 뿐 캔버스 내용물은 못 건드린다).
  //
  //   백킹스토어를 CSS 박스와 같게 맞추면 확대 단계가 사라지고, 남는 건 zoom의
  //   축소 한 번뿐이라 오히려 슈퍼샘플링처럼 동작한다. 실측(1310x760 기준)에서
  //   회색 계조가 4 → 142개로 늘었다(= 안티에일리어싱이 제대로 살아난다).
  //   화면 device px에 맞추는 것(1310)보다도 이쪽이 확실히 낫다(계조 12개).
  //
  //   뷰포트와 무관한 값이라 창 크기를 바꿔도 다시 할당되지 않는다 — 리사이즈 때마다
  //   캔버스가 초기화되는 일이 없다.
  //   논리 좌표는 그대로 config.canvas.width를 쓰고, 그리기만 getRenderScale()
  //   배율로 확대한다(ui/render.js) — 게임 로직·히트박스는 아무것도 안 바뀐다.
  //   dpr은 2에서 자른다(3x/4x 화면에서 백킹스토어가 쓸데없이 커지는 걸 막는다).
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const targetW = Math.max(1, Math.round(baseW * dpr));
  const targetH = Math.max(1, Math.round(baseH * dpr));
  if (canvas.width !== targetW || canvas.height !== targetH) {
    // 주의: width/height를 대입하면 2D 컨텍스트 상태가 전부 초기화된다
    // (imageSmoothingEnabled 포함) — ui/render.js가 매 프레임 다시 걸어준다.
    canvas.width = targetW;
    canvas.height = targetH;
  }

  // ── 화면 회전(환경 방해 "모니터 세로모드")이 화면을 넘치지 않게 하는 추가 배율 ──
  // 16:9를 90° 돌리면 세로가 가로보다 길어져 위아래가 잘린다 — 잘린 자리의 방해꾼은
  // 보이지도 눌리지도 않아(화면 밖) 그냥 불공정해진다. 그래서 회전 상태에서는 이만큼
  // 더 줄여서 통째로 담는다(실제 모니터를 세로로 돌리면 바탕화면이 새 방향에 맞게
  // 다시 맞춰지는 것과 같은 결).
  //
  // ★ 여기서 계산해 CSS 변수로 내려보내는 이유: 회전 CSS(ui/hazards/portrait.js)가
  //   이 값을 직접 계산하면 리사이즈 때 갱신할 사람이 없다. 화면 맞춤 계산은 원래
  //   이 파일 소유고 리사이즈마다 여기가 다시 도니까, 값도 여기서 낸다.
  //   회전 후 크기는 shownH × shownW(가로세로가 뒤바뀐다)이므로 그게 뷰포트에
  //   들어가는 배율을 구한다. 1을 넘지 않게 막는다(굳이 키울 이유가 없다).
  //
  //   ★ ROT_MARGIN: 딱 맞게(=1.0으로) 채우면 실측에서 월드 (0,0)이 화면 y=-0.34px로
  //     아슬아슬하게 걸쳤다 — 부동소수점 반올림이 어느 쪽으로 떨어지느냐에 따라
  //     가장자리 한두 픽셀이 잘릴 수 있다는 뜻이다. 몇 px 여유를 두면 그 경계 자체가
  //     사라지고, 보기에도 화면 끝에 딱 붙지 않아 낫다.
  const ROT_MARGIN = 0.97;
  const rotFit = Math.min(1, viewportW / shownH, viewportH / shownW) * ROT_MARGIN;
  document.documentElement.style.setProperty('--rot-fit', String(rotFit));

  if (USE_CSS_ZOOM) {
    stage?.classList.remove('no-zoom');
    desktop.style.transform = '';
    desktop.style.zoom = String(scale);
  } else {
    // transform으로 줄이고, 남는 여백을 직접 계산해 가운데로 민다.
    // (transform은 레이아웃 공간을 안 먹어서 #stage의 flex 가운데 정렬이 안 통한다)
    stage?.classList.add('no-zoom');
    desktop.style.zoom = '';
    const offsetX = (viewportW - shownW) / 2;
    const offsetY = (viewportH - shownH) / 2;
    desktop.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  }

  if (config.debug.enabled) {
    // rect가 실제 표시 크기를 주는지 여기서 바로 확인할 수 있게 같이 찍는다.
    // transform이면 rect.width ≈ shownW 여야 하고, 어긋나면 그 브라우저가
    // 배율을 rect에 반영 안 한다는 뜻이다(예전 zoom에서 겪은 그 문제).
    const rect = canvas.getBoundingClientRect();
    console.log('[canvasFit]', {
      mode: USE_CSS_ZOOM ? 'zoom' : 'transform: scale',
      canvasInternal: `${canvas.width}x${canvas.height}`, // 시트의 canvas_w/h
      desktopBase: `${baseW}x${baseH}`, // UI 좌표계(uiBaseWidth 기준)
      viewport: `${viewportW}x${viewportH}`,
      scale: scale.toFixed(4),
      shown: `${shownW.toFixed(1)}x${shownH.toFixed(1)}`,
      rect: `${rect.width.toFixed(1)}x${rect.height.toFixed(1)} @${rect.left.toFixed(1)},${rect.top.toFixed(1)}`,
      rectMatchesShown:
        Math.abs(rect.width - shownW) < 1 ? 'OK (rect가 실제 표시폭)' : '★ 어긋남 — rect가 배율 미반영',
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
  window.addEventListener('resize', () => {
    fitCanvasToViewport(canvas);
    // H키 디버그 십자선은 월드 좌표라, 창 크기가 바뀌면 같은 월드 자리가 다른 화면
    // 자리에 다시 그려진다(커지면 오른쪽, 줄이면 왼쪽으로 옮겨간 것처럼 보인다).
    // 리사이즈 전 마커를 지금 커서와 견주면 "판정이 밀린다"로 오해하기 딱 좋아서
    // 여기서 통째로 비운다 — 리사이즈 후엔 항상 새로 찍은 것만 보이게 한다.
    state.debugClicks.length = 0;
  });
}
