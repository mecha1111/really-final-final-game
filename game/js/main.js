// 이 파일 역할: 진입점. 밸런스를 불러오고 각 모듈을 연결한 뒤 루프를 돌린다. 게임 규칙은 여기 없다.

import { config, gameData, loadGameData, reloadGameData, applyStageToConfig, createRules } from './config.js';
import { loadEnemyImages } from './assets.js';
import { state } from './core/state.js';
import { startLoop } from './core/gameLoop.js';
import { update, getPlayArea, startGame } from './core/stageManager.js';
import { initInput } from './systems/input.js';
import { render } from './ui/render.js';
import { initReloadButton } from './ui/screens.js';
import { initCanvasFit, fitCanvasToViewport } from './ui/canvasFit.js';
import { initDesktop, syncDesktopPhase } from './ui/desktop.js';
import { updateStatusWindows } from './ui/statusWindow.js';
import { initDebugPanel, bindRules, updateDebugStats } from './debug.js';
import { Enemy } from './enemies/Enemy.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

/** 시트를 읽고 나서 해상도와 이미지를 맞춘다. 리로드 후에도 다시 호출된다. */
async function applyLoadedData() {
  applyStageToConfig();
  canvas.width = config.canvas.width;
  canvas.height = config.canvas.height;
  // 내부 해상도(비율)가 바뀌었을 수 있으니(시트의 canvas_w/h가 다시 로드됨)
  // 표시 크기도 다시 맞춘다 — 리로드 때도 창을 꽉 채운 채로 유지된다.
  fitCanvasToViewport(canvas);

  await loadEnemyImages(gameData.enemies.map((e) => e.id));

  // 새 숫자로 깨끗하게 다시 고르도록 난이도 선택으로 돌아간다
  state.phase = 'select';

  // 대기 화면에서도 디버그 슬라이더가 그럴듯한 숫자를 보여주도록 미리 채워둔다.
  // 지금 대기 중인 구간(state.stageIndex)의 값을 쓴다.
  // (실제 조절은 판이 시작된 뒤 그 판의 rules에 대해 이루어진다)
  bindRules(createRules(state.stageIndex));
}

/**
 * 밸런스 테스트용 손잡이. config.debug.enabled일 때만 window에 붙는다.
 * 콘솔에서 __game.spawn('copier') 처럼 특정 방해꾼을 바로 불러 확인할 수 있다.
 */
function exposeDebugHandle() {
  if (!config.debug.enabled) return;

  window.__game = {
    state,
    gameData,
    config,
    startGame,
    getPlayArea,
    /** 특정 id의 방해꾼을 지금 화면에 하나 띄운다 */
    spawn(id, at) {
      const spec = gameData.enemies.find((e) => e.id === id);
      if (!spec || !state.rules) return null;

      const playArea = getPlayArea();
      const enemy = new Enemy(spec, {
        x: at?.x ?? playArea.x + playArea.w / 2,
        y: at?.y ?? playArea.y + playArea.h / 2,
        rules: state.rules,
        playArea,
        pointer: state.pointer,
      });
      state.enemies.push(enemy);
      return enemy;
    },
  };
}

async function main() {
  canvas.width = config.canvas.width;
  canvas.height = config.canvas.height;
  initCanvasFit(canvas); // 최초 1회 맞추고, 이후 창 크기 변경에 자동으로 반응한다

  initInput(canvas);
  initDesktop(); // HTML 바탕화면(창 드래그·개그 팝업·시계)
  initDebugPanel();
  exposeDebugHandle();
  initReloadButton(async () => {
    await reloadGameData();
    await applyLoadedData();
  });

  startLoop({
    update,
    render: () => {
      render({ ctx, canvas, state, gameData });
      // HUD는 이제 HTML 창이다 — 캔버스를 그린 뒤 같은 프레임에 값만 흘려 넣는다.
      syncDesktopPhase(state.phase);
      updateStatusWindows(state);
    },
    onFrame: (fps) => updateDebugStats(state, gameData, fps),
  });

  await loadGameData();
  await applyLoadedData();
}

main();
