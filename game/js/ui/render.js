// 이 파일 역할: 캔버스 한 프레임을 조립한다(방해꾼 → 커서 → 뜬 글씨 → 대기/결과 오버레이).
// HUD·창·개그요소는 이제 캔버스가 아니라 HTML이 그린다(ui/statusWindow.js, ui/desktop.js).

import { config, getUiScaleFactor, getUiReferenceCanvas, getRenderScale, createRules } from '../config.js';
import { debugState } from '../debug.js';
import { drawEnemy, drawCursorGlyph, drawFloats, drawClickMarkers } from './renderEnemies.js';
import { drawSelectScreen, drawResultScreen, drawLoadingOverlay } from './screens.js';

/**
 * 캔버스를 비운다. 배경(Bliss·언덕·구름)은 이제 캔버스가 아니라 그 아래 깔린
 * HTML(.layer-bg)이 그리므로, 여기서는 투명하게 지우기만 한다 —
 * 색을 칠하면 뒤 배경을 덮어버린다.
 */
export function drawBackground(ctx) {
  // 논리 좌표계 기준으로 지운다 — 백킹스토어는 이보다 클 수 있지만(getRenderScale)
  // 이 시점엔 ctx에 그 배율이 걸려 있어서 논리 크기만 지우면 화면 전체가 지워진다.
  ctx.clearRect(0, 0, config.canvas.width, config.canvas.height);
}

/**
 * 한 프레임 전체를 그린다.
 * @param {object} deps { ctx, canvas, state, gameData, now }
 *   now: 이번 프레임의 렌더루프 시계(ms, requestAnimationFrame timestamp) —
 *   방해꾼 스프라이트 애니(sprite/animator.js)가 프레임 전환을 계산하는 유일한 시간 기준이다.
 */
export function render({ ctx, canvas, state, gameData, now }) {
  // 백킹스토어는 device px, 게임 좌표는 논리 px — 이 변환 하나가 둘을 잇는다.
  // 매 프레임 다시 거는 이유: 창 크기가 바뀌면 canvas.width가 다시 대입되고,
  // 그 순간 컨텍스트 상태(변환·imageSmoothingEnabled)가 전부 초기화되기 때문이다.
  const renderScale = getRenderScale(canvas);
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  ctx.imageSmoothingEnabled = false; // 방해꾼 스프라이트가 확대돼도 뭉개지지 않게

  drawBackground(ctx);

  // 방해꾼/가짜커서/뜬 글씨는 물리(실제) 캔버스 좌표 그대로 그린다 — 이미
  // getScaleFactor()(baseWidth=1280)로 스케일된 값들이라 여기서 또 손대면 안 된다.
  // title도 여기서 제외한다 — 타이틀은 HTML 오버레이(.layer-title, z-index 6)가
  // 캔버스보다 위에서 전담하므로 캔버스는 아무것도 안 그린다. state.enemies가
  // (디버그 콘솔 등으로) 비어있지 않더라도 그릴 필요가 없다.
  if (state.phase !== 'select' && state.phase !== 'loading' && state.phase !== 'title') {
    for (const enemy of state.enemies) drawEnemy(ctx, enemy, debugState.showHitbox, now);

    for (const c of state.fakeCursors) drawCursorGlyph(ctx, c.x, c.y);
    // 위장 중이면 진짜 커서도 가짜와 똑같이 그린다
    if (state.cursorDisguise > 0) drawCursorGlyph(ctx, state.pointer.x, state.pointer.y);

    // H키를 켰을 때만: 최근 클릭이 "월드 좌표 어디로 계산됐는지"를 십자선으로 찍는다.
    // 화면에서 실제로 누른 자리와 십자선이 어긋나면 그 어긋난 방향·거리가 곧
    // 클릭→월드 변환의 오차다. 히트박스 사각형과 같이 보면 "왜 안 맞는지"가 한눈에 보인다.
    if (debugState.showHitbox) drawClickMarkers(ctx, state.debugClicks);

    drawFloats(ctx, state.floats);
  }

  // 대기/결과 화면은 1920 기준(uiBaseWidth)으로 그려져 있다. 실제 캔버스가
  // 그보다 작거나 크면 이 변환 하나로 그 안의 모든 그리기가 비례를 유지한 채
  // 줄어들거나 커진다. 클릭 판정(systems/input.js)도 같은 기준 공간
  // (getUiReferenceCanvas)을 써야 그리기와 어긋나지 않는다.
  const uiScale = getUiScaleFactor();
  const refCanvas = getUiReferenceCanvas();
  const refPointer = { x: state.pointer.x / uiScale, y: state.pointer.y / uiScale };

  ctx.save();
  ctx.scale(uiScale, uiScale);

  if (state.phase === 'select') {
    // 대기 화면은 "앞으로 시작할 구간"의 숫자를 미리 보여준다 — 게임 로직과
    // 같은 createRules를 써야 표시와 실제가 갈라지지 않는다(공식 이중구현 금지).
    drawSelectScreen(ctx, refCanvas, state.stageIndex, createRules(state.stageIndex), refPointer);
  }
  if (state.phase === 'cleared' || state.phase === 'failed') {
    drawResultScreen(ctx, refCanvas, state, refPointer);
  }
  if (gameData.loading) drawLoadingOverlay(ctx, refCanvas);

  ctx.restore();

  // 위장 중엔 브라우저 기본 커서를 숨겨야 캔버스가 그린 커서만 보인다
  canvas.style.cursor = state.cursorDisguise > 0 ? 'none' : '';
}
