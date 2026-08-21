// 이 파일 역할: 한 프레임을 화면에 조립한다(배경 → 방해꾼 → 커서 → 뜬 글씨 → HUD → 화면 오버레이). 세부 그리기는 renderEnemies.js/hud.js/screens.js가 맡는다.

import { getUiScaleFactor, getUiReferenceCanvas, createRules } from '../config.js';
import { debugState } from '../debug.js';
import { cssColor } from './draw.js';
import { drawEnemy, drawCursorGlyph, drawFloats } from './renderEnemies.js';
import { drawHud, drawBlockedBanner } from './hud.js';
import { drawSelectScreen, drawResultScreen, drawLoadingOverlay } from './screens.js';

export function drawBackground(ctx, canvas, playArea) {
  ctx.fillStyle = cssColor('--color-canvas-bg');
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = cssColor('--color-play-bg');
  ctx.fillRect(playArea.x, playArea.y, playArea.w, playArea.h);

  // 옅은 격자 — 방해꾼이 움직이는 걸 눈으로 따라가기 쉬워진다
  ctx.strokeStyle = cssColor('--color-play-grid');
  ctx.lineWidth = 1;
  ctx.beginPath();
  const step = 64;
  for (let gx = playArea.x + step; gx < playArea.x + playArea.w; gx += step) {
    ctx.moveTo(gx + 0.5, playArea.y);
    ctx.lineTo(gx + 0.5, playArea.y + playArea.h);
  }
  for (let gy = playArea.y + step; gy < playArea.y + playArea.h; gy += step) {
    ctx.moveTo(playArea.x, gy + 0.5);
    ctx.lineTo(playArea.x + playArea.w, gy + 0.5);
  }
  ctx.stroke();
}

/**
 * 한 프레임 전체를 그린다.
 * @param {object} deps { ctx, canvas, state, gameData, playArea }
 */
export function render({ ctx, canvas, state, gameData, playArea }) {
  drawBackground(ctx, canvas, playArea);

  // 방해꾼/가짜커서/뜬 글씨는 물리(실제) 캔버스 좌표 그대로 그린다 — 이미
  // getScaleFactor()(baseWidth=1280)로 스케일된 값들이라 여기서 또 손대면 안 된다.
  if (state.phase !== 'select' && state.phase !== 'loading') {
    for (const enemy of state.enemies) drawEnemy(ctx, enemy, debugState.showHitbox);

    for (const c of state.fakeCursors) drawCursorGlyph(ctx, c.x, c.y);
    // 위장 중이면 진짜 커서도 가짜와 똑같이 그린다
    if (state.cursorDisguise > 0) drawCursorGlyph(ctx, state.pointer.x, state.pointer.y);

    drawFloats(ctx, state.floats);
  }

  // HUD/타이틀/난이도 카드/결과 화면은 전부 1920 기준(uiBaseWidth)으로 그려져
  // 있다. 실제 캔버스가 그보다 작거나 크면(지금 시트는 960) 이 변환 하나로
  // 그 안의 모든 그리기가 한 번에 비례를 유지한 채 줄어들거나 커진다 —
  // 개별 픽셀 숫자를 일일이 손볼 필요가 없다. 클릭 판정(systems/input.js)도
  // 같은 기준 공간(getUiReferenceCanvas)을 써야 그리기와 어긋나지 않는다.
  const uiScale = getUiScaleFactor();
  const refCanvas = getUiReferenceCanvas();
  const refPointer = { x: state.pointer.x / uiScale, y: state.pointer.y / uiScale };

  ctx.save();
  ctx.scale(uiScale, uiScale);

  if (state.phase !== 'select' && state.phase !== 'loading') {
    drawHud(ctx, refCanvas, state);

    if (state.blocked && state.phase === 'playing') {
      const refPlayArea = {
        x: playArea.x / uiScale,
        y: playArea.y / uiScale,
        w: playArea.w / uiScale,
        h: playArea.h / uiScale,
      };
      drawBlockedBanner(ctx, refCanvas, refPlayArea, state.blockedBy, state.rules.timeLimit - state.timeLeft);
    }
  }

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
