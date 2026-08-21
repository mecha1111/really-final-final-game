// main.js
// 게임 루프와 최상위 상태만 다룬다. 숫자는 config.js, 그리기는 ui.js/debug.js,
// 스폰/적 로직은 spawner.js/enemies.js에 위임한다.

import { config, gameData, loadGameData, reloadGameData } from './config.js';
import { initInput, initReloadButton, draw, drawLoadingOverlay } from './ui.js';
import { initDebugPanel, drawDebugPanel } from './debug.js';
import { Spawner } from './spawner.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const state = {
  running: true,
  elapsed: 0,
  fps: 0,
  enemies: [],
};

let spawner;
let lastTime = 0;

function resizeCanvas() {
  canvas.width = config.canvas.width;
  canvas.height = config.canvas.height;
}

function update(dt) {
  state.elapsed += dt;

  const spawned = spawner.update(dt, canvas.width);
  state.enemies.push(...spawned);

  for (const enemy of state.enemies) {
    enemy.update(dt);
  }
  state.enemies = state.enemies.filter((e) => e.alive);
}

function frame(timeMs) {
  if (!state.running) return;

  const dt = lastTime ? (timeMs - lastTime) / 1000 : 0;
  lastTime = timeMs;
  state.fps = dt > 0 ? Math.round(1 / dt) : 0;

  update(dt);
  draw(ctx, canvas, state);
  if (gameData.loading) drawLoadingOverlay(ctx, canvas);
  drawDebugPanel(ctx, canvas, state, gameData);

  requestAnimationFrame(frame);
}

function main() {
  resizeCanvas();
  initInput();
  initDebugPanel();
  initReloadButton(() => reloadGameData());
  spawner = new Spawner();

  // 게임 루프는 밸런스 로드를 기다리지 않고 바로 시작한다(로딩 중엔
  // drawLoadingOverlay가 안내 문구를 그린다). 로드가 끝나면 콘솔에서 확인.
  loadGameData();

  requestAnimationFrame(frame);
}

main();
