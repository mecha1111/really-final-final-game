// 이 파일 역할: 진입점. 밸런스를 불러오고 각 모듈을 연결한 뒤 루프를 돌린다. 게임 규칙은 여기 없다.

import { config, gameData, loadGameData, reloadGameData, applyStageToConfig, applyEnemyFallbacks, createRules } from './config.js';
import { loadEnemyImages } from './assets.js';
import { buildAssetKeys } from './sprite/animator.js';
import { state } from './core/state.js';
import { startLoop } from './core/gameLoop.js';
import { update, getPlayArea, startGame } from './core/stageManager.js';
import { consumeHitStop, updateParticles, clearJuice } from './systems/juice.js';
import { updateRipples } from './systems/clickRipple.js';
import { initInput } from './systems/input.js';
import { initSound } from './systems/sound.js';
import { initBgm, updateBgm } from './systems/bgm.js';
import { render } from './ui/render.js';
import { initReloadButton } from './ui/screens.js';
import { initCanvasFit, fitCanvasToViewport } from './ui/canvasFit.js';
import { initDesktop, syncDesktopPhase } from './ui/desktop.js';
import { initTitleScreen } from './ui/titleScreen.js';
import { initBsodScreen, updateBsodScreen } from './ui/bsodScreen.js';
import { initClearScreen, updateClearScreen } from './ui/clearScreen.js';
import { initCrtTransition, syncCrtTransition } from './ui/crtTransition.js';
import { initSettingsPanel } from './ui/settingsPanel.js';
import { initCursor, updateCursor } from './ui/cursor.js';
import { updateStatusWindows } from './ui/statusWindow.js';
import { initUploadPicture, updateUploadPicture } from './ui/uploadPicture.js';
import { initDebugPanel, bindRules, updateDebugStats } from './debug.js';
import { Enemy } from './enemies/Enemy.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
// 캔버스 백킹스토어 크기와 컨텍스트 변환은 ui/canvasFit.js와 ui/render.js가 맡는다
// (백킹스토어는 화면 해상도에 맞춰 커지고, 그때마다 컨텍스트 상태가 초기화되므로
//  imageSmoothingEnabled도 render가 매 프레임 다시 건다) — 여기서 건드리지 않는다.

/** DGM(둥근모) 픽셀폰트가 실제로 로드됐는지 콘솔에 한 번 찍는다 — false면 폴백
 * 폰트(Galmuri11/monospace)로 그려지는 중이라 "폰트가 뿌옇다"의 원인이 열화가
 * 아니라 로드 실패일 수 있다(document.fonts.check는 로드 완료 후에만 정확하다). */
function logFontLoadStatus() {
  document.fonts.ready
    .then(() => {
      const loaded = document.fonts.check("16px 'DGM'");
      console.log(`[font] DGM 로드 ${loaded ? '성공' : '실패(폴백 폰트로 표시 중)'}`);
    })
    .catch(() => {});
}

/** 시트를 읽고 나서 해상도와 이미지를 맞춘다. 리로드 후에도 다시 호출된다. */
async function applyLoadedData() {
  // 구글 시트에 아직 없는 신규 방해꾼(hourglass/zombie)을 config 폴백으로 채운다
  // (config.js의 ENEMY_SHEET_FALLBACK 주석 참고) — 시트에 실제 행이 생기면 자동으로
  // 그쪽이 우선된다. 최초 로드·리로드 버튼 둘 다 이 함수를 거치므로 여기 한 곳이면 된다.
  applyEnemyFallbacks();
  applyStageToConfig();
  // 논리 해상도(시트의 canvas_w/h)가 바뀌었을 수 있으니 표시 크기와 백킹스토어를
  // 다시 맞춘다 — 리로드 때도 창을 꽉 채운 채로 유지된다.
  // (canvas.width 대입은 canvasFit이 화면 해상도 기준으로 직접 한다)
  fitCanvasToViewport(canvas);

  await loadEnemyImages(buildAssetKeys(gameData.enemies));

  // 최초 로드가 끝나면 타이틀로 착지한다(loading → title). 리로드 버튼으로 다시
  // 불러올 때도 이 함수가 다시 불리는데, 그때도 title로 보내는 게 자연스럽다 —
  // 이미 게임이 진행 중이면(playing) 리로드는 debug 전용 기능이라 잦지 않다.
  state.phase = 'title';

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
  // 백킹스토어 크기까지 여기서 함께 정해진다 — 최초 1회 맞추고, 이후 창 크기 변경에 자동으로 반응한다
  initCanvasFit(canvas);
  initCursor(); // 게임 영역 커서(config.cursor) — hotspot이 클릭 좌표와 어긋나면 안 되므로 최대한 일찍

  initInput(canvas);
  initSound(); // 효과음 — AudioContext를 세우고 mp3 프리로드를 시작한다(await 안 함)
  initBgm(); // 배경음악 — sound.js가 만든 AudioContext를 재사용(반드시 initSound() 다음)
  initDesktop(); // HTML 바탕화면(창 드래그·개그 팝업·시계)
  initTitleScreen(); // 타이틀 화면 버튼(시작/설정/나가기)
  initBsodScreen(); // 실패 화면(BSOD) 버튼(재도전/로비/나가기)
  initClearScreen(); // 구간 클리어 화면(폴더 정리 연출) 버튼/스킵
  initUploadPicture(); // 완료 연출(반짝+팝+라벨) CSS 변수 세팅
  initCrtTransition(); // 화면 전환 CRT 킥 — config.crt.durationMs를 CSS 변수로 내려보낸다
  initSettingsPanel(); // ESC 설정 팝업(사운드값 저장/CRT 실시간 토글/전체화면)
  initDebugPanel();
  exposeDebugHandle();
  initReloadButton(async () => {
    await reloadGameData();
    await applyLoadedData();
  });

  startLoop({
    update: (dt) => {
      // ★ 설정 팝업이 열려 있으면 완전히 멈춘다(일시정지) — 히트스톱과 같은 자리에
      //   같은 방식으로 걸었다: 그리기(render)는 계속 돌아서 멈춘 화면이 그대로
      //   보이고, 갱신만 건너뛴다. floats/juice까지 전부 여기서 같이 멈춘다.
      if (state.settingsOpen) return;

      // ★ 히트스톱 — 처치 순간 아주 잠깐 월드를 통째로 멈춘다(타격감의 핵심).
      //   멈추는 건 "갱신"뿐이고 그리기는 계속 돌아간다. 그래야 멈춘 그 화면이
      //   실제로 눈에 보인다(안 그리면 그냥 프레임이 끊긴 것과 구분이 안 된다).
      if (consumeHitStop(dt)) return;
      update(dt);
      // 터진 조각·클릭 리플은 게임 규칙과 무관한 순수 연출이라 stageManager 밖에서 돈다.
      updateParticles(dt);
      updateRipples(dt);
    },
    render: (now) => {
      render({ ctx, canvas, state, gameData, now });
      // HUD는 이제 HTML 창이다 — 캔버스를 그린 뒤 같은 프레임에 값만 흘려 넣는다.
      syncDesktopPhase(state.phase);
      syncCrtTransition(state.phase, now); // phase가 이번 프레임에 바뀌었을 때만 내부에서 1회 재생
      updateBgm(state.phase, now); // 화면(phase)에 맞는 곡으로 자동 크로스페이드
      updateStatusWindows(state);
      updateUploadPicture(state);
      updateBsodScreen();
      updateClearScreen(now);
      updateCursor(state.inputFreezeSec > 0); // hourglass 함정 발동 중엔 대기 커서로
    },
    onFrame: (fps) => updateDebugStats(state, gameData, fps),
  });

  logFontLoadStatus();
  await loadGameData();
  await applyLoadedData();
}

main();
