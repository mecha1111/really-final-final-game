// debug.js
// 밸런스 확인용 디버그 패널. config.debug.enabled 하나로 완전히 켜고 끌 수 있다
// (false면 이 파일의 모든 함수가 즉시 return하여 아무것도 그리거나 등록하지 않는다).

import { config } from './config.js';
import { cssColor } from './ui.js';

const DEBUG = config.debug.enabled;

export function initDebugPanel() {
  if (!DEBUG) return;
  // TODO: 다음 단계에서 실제 밸런스 슬라이더/입력 UI 구현
}

export function drawDebugPanel(ctx, canvas, state, gameData) {
  if (!DEBUG) return;

  const panelHeight = gameData ? 96 : 60;

  ctx.save();
  ctx.fillStyle = cssColor('--color-debug-bg');
  ctx.fillRect(8, 8, 220, panelHeight);
  ctx.strokeStyle = cssColor('--color-debug-border');
  ctx.strokeRect(8, 8, 220, panelHeight);

  ctx.fillStyle = cssColor('--color-debug-text');
  ctx.font = '12px monospace';
  ctx.fillText('DEBUG', 16, 26);
  ctx.fillText(`fps: ${state.fps ?? '-'}`, 16, 44);

  if (gameData) {
    ctx.fillText(`balance: ${gameData.loading ? 'loading...' : gameData.source}`, 16, 62);
    ctx.fillText(`enemies:${gameData.enemies.length} diff:${gameData.difficulty.length}`, 16, 80);
  }
  ctx.restore();
}
