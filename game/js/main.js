// 이 파일 역할: 진입점. 밸런스를 불러오고 각 모듈을 연결한 뒤 루프를 돌린다. 게임 규칙은 여기 없다.

import {
  config,
  gameData,
  loadGameData,
  reloadGameData,
  startBackgroundSheetSync,
  applyStageToConfig,
  applyEnemyFallbacks,
  applyEnemyUnlockPlan,
  createRules,
} from './config.js';
import { loadEnemyImages } from './assets.js';
import { buildAssetKeys } from './sprite/animator.js';
import { state, setPhase, settlePhase } from './core/state.js';
import { startLoop } from './core/gameLoop.js';
import { update, getPlayArea, startGame } from './core/stageManager.js';
import { consumeHitStop, updateParticles, clearJuice } from './systems/juice.js';
import { updateRipples } from './systems/clickRipple.js';
import { initInput } from './systems/input.js';
import { initHazards, triggerHazard, hazardIds } from './systems/hazard.js';
// 환경 방해 정의 등록(부수효과 import) — 이 한 줄이 ui/hazards/index.js에 나열된
// 방해들을 전부 등록표에 올린다. 새 방해가 늘어도 여기는 안 바뀐다.
import './ui/hazards/index.js';
import { initSound } from './systems/sound.js';
import { initBgm, updateBgm, loadMainTrack } from './systems/bgm.js';
import { render } from './ui/render.js';
import { initReloadButton } from './ui/screens.js';
import { initCanvasFit, fitCanvasToViewport } from './ui/canvasFit.js';
import { initDesktop, syncDesktopPhase } from './ui/desktop.js';
import { initTitleScreen, updateTitleScreen } from './ui/titleScreen.js';
import { initBsodScreen, updateBsodScreen } from './ui/bsodScreen.js';
import { initClearScreen, updateClearScreen } from './ui/clearScreen.js';
import { initEndingScreen, updateEndingScreen } from './ui/endingScreen.js';
import { initCrtTransition, syncCrtTransition } from './ui/crtTransition.js';
import { initSettingsPanel, applySavedSettings } from './ui/settingsPanel.js';
import { initConfirmDialog } from './ui/confirmDialog.js';
import { initGallery } from './ui/galleryPanel.js';
import { initRover, updateRover, showTip } from './ui/rover.js';
import { initIntro, startIntro, updateIntro } from './ui/intro.js';
import { initCursor, updateCursor } from './ui/cursor.js';
import { updateStatusWindows } from './ui/statusWindow.js';
import { initUploadPicture, updateUploadPicture } from './ui/uploadPicture.js';
import { initDebugPanel, bindRules, updateDebugStats } from './debug.js';
import { applyIcons } from './ui/icons.js';
// ★파일 아이콘은 별도 카탈로그다(48×48 다색 아이소메트릭) — UI 크롬용 icons.js와
//   계약이 달라 파일부터 갈라놨다(ui/fileIcons.js 상단 주석).
import { applyFileIcons, fileIcon } from './ui/fileIcons.js';
import { hasSeenIntro } from './core/save.js';
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
      // ★ 성공은 조용히 넘어간다 — 배포본 콘솔에 매번 남길 이유가 없다.
      //   실패했을 때만(폴백 폰트로 보이는 상태라 화면이 실제로 달라 보인다) 알린다.
      if (!loaded) console.warn('[font] DGM 로드 실패 — 폴백 폰트로 표시 중');
    })
    .catch(() => {});
}

/** 시트를 읽고 나서 해상도와 이미지를 맞춘다. 리로드 후에도 다시 호출된다. */
async function applyLoadedData() {
  // 구글 시트에 아직 없는 신규 방해꾼(hourglass/zombie)을 config 폴백으로 채운다
  // (config.js의 ENEMY_SHEET_FALLBACK 주석 참고) — 시트에 실제 행이 생기면 자동으로
  // 그쪽이 우선된다. 최초 로드·리로드 버튼 둘 다 이 함수를 거치므로 여기 한 곳이면 된다.
  applyEnemyFallbacks();
  // 해금 배치의 정본(config.stage.enemyUnlockPlan)을 입힌다. ★ 폴백으로 채워 넣은
  // 행까지 함께 맞춰야 하므로 반드시 applyEnemyFallbacks() 다음이다.
  applyEnemyUnlockPlan();
  applyStageToConfig();
  // 논리 해상도(시트의 canvas_w/h)가 바뀌었을 수 있으니 표시 크기와 백킹스토어를
  // 다시 맞춘다 — 리로드 때도 창을 꽉 채운 채로 유지된다.
  // (canvas.width 대입은 canvasFit이 화면 해상도 기준으로 직접 한다)
  fitCanvasToViewport(canvas);

  // ★ await하지 않는다 — 타이틀/인트로 화면은 방해꾼을 안 그린다(ui/render.js의
  //   phase 가드: loading/title/intro에선 drawEnemy 자체가 안 불린다). 그러니
  //   타이틀 착지가 이 프리로드를 기다릴 이유가 없다 — 시트 fetch(1~2초) 뒤에
  //   바로 착지시키고, 스프라이트는 뒤에서 계속 받는다.
  //   플레이 진입 시점에 아직 못 받은 키가 있어도 안전하다 — enemyImages[key]가
  //   없으면 ui/renderEnemies.js·ui/baitRender.js가 색 사각형+id 텍스트로 대신
  //   그리고, 클릭 판정(enemies/hitbox.js)은 이미지가 아니라 drawW/drawH와
  //   artHitbox 비율표에서 나오므로 그대로 유효하다 — 이미지가 도착하면 같은
  //   객체(enemyImages)에 그대로 꽂혀 다음 프레임부터 자동으로 정상 그림으로
  //   바뀐다(다시 그리라고 요청할 필요가 없다, 매 프레임 이 객체를 다시 읽으므로).
  loadEnemyImages(buildAssetKeys(gameData.enemies));

  // 최초 로드가 끝나면 타이틀로 착지한다 — 단 ★첫 실행이면 그 앞에 인트로가 하나
  // 더 있다(loading → intro → title). 인트로가 [시작]/[닫기]로 끝나는 자리에서
  // ui/intro.js가 setPhase('title')을 불러 기존 타이틀 화면으로 넘긴다.
  // ★ 타임라인 시작(startIntro)을 여기 — settlePhase가 실제로 먹은 그 자리 — 에
  //   묶는 게 중요하다. 부팅 화면 자체는 initIntro()가 로딩 중에 이미 띄워두지만,
  //   그건 커튼일 뿐이고 시계는 여기서만 돈다. 그래야 "로딩이 늦게 끝나 뒤늦게
  //   도착한 착지"가 이미 끝난 인트로를 되감는 사고가 구조적으로 안 생긴다
  //   (아래 settlePhase 주석이 경고하는 것과 같은 부류의 레이스다).
  // ★ settlePhase는 "아직 판이 시작 안 됐을 때만" 적용된다(core/state.js의 정착
  //   가드) — 이 함수는 fetch와 이미지 프리로드를 await한 뒤에야 여기 도달하므로,
  //   그 사이에 판이 시작됐다면(지금은 그런 경로가 없지만 세이브 [이어하기]가
  //   붙으면 생긴다) 뒤늦은 이 대입이 'playing'을 덮어써선 안 된다.
  //   리로드 버튼처럼 "일부러 타이틀로 돌아가는" 경로는 자기 자리에서 setPhase를
  //   따로 부른다(아래 initReloadButton) — 그래야 의도한 복귀는 그대로 살아있다.
  const firstRun = !hasSeenIntro();
  if (settlePhase(firstRun ? 'intro' : 'title') && firstRun) startIntro();

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
    /** 환경 방해를 지금 당장 하나 발동시킨다 — __game.hazard('reboot') 식으로. */
    hazard(id) {
      const inst = triggerHazard(id);
      if (!inst) console.warn(`[hazard] 그런 id가 없다: ${id} (가능: ${hazardIds().join(', ') || '없음'})`);
      return inst;
    },
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
    /** 러버 팁을 지금 당장 큐에 넣는다 — __game.showTip('test', '아무 문구') 식으로.
     * showTip() 자체(ui/rover.js)와 완전히 같은 함수라 seenTips 규칙도 그대로 탄다 —
     * 테스트용으로 반복 확인하려면 매번 다른 id를 쓰거나 [튜토리얼 다시 보기]로 지운다. */
    showTip,
  };
}

// ★ 2026-09-08 기록(고치지 않음): 부팅 시 이 함수 실행 자체가 롱태스크
//   1건(약 200ms 안팎, 실측 73ms+211ms 두 조각으로 잡힐 때도 있다)으로
//   찍힌다 — main() 안의 initXxx() 동기 호출들이 한 프레임에 몰려 있어서다.
//   손 안 댄 이유: 이 시점은 인트로/타이틀보다도 앞(플레이 중이 아니다)이라
//   플레이 프레임 히치와는 다른 범주고, 실제 프레임 히치는 별도로 재현
//   시도했으나(환경 방해 6종 직접 발동, 3구간 60초 관찰+클릭, 화면 전환 반복)
//   전부 재현 안 됐다(최대 41.7ms, 50ms 초과 0건) — 이 롱태스크가 플레이
//   중 문제를 일으킨다는 증거가 없다. 굳이 쪼개서 얻는 이득보다 건드리다
//   실수할 위험이 커서 그대로 둔다.
async function main() {
  // 정적 마크업의 아이콘 자리표시자([data-icon], index.html)를 채운다 — 모듈
  // 스크립트라 DOM은 이미 파싱이 끝나 있다. 다른 init보다 먼저 할 이유는 없지만
  // 미룰 이유도 없어서 맨 앞에 둔다(어차피 전부 정적 엘리먼트라 순서 무관).
  applyIcons();
  // [data-file-icon] 자리표시자도 같은 자리에서 채운다 — 속성 이름이 달라 서로 안 겹친다.
  applyFileIcons();

  // 백킹스토어 크기까지 여기서 함께 정해진다 — 최초 1회 맞추고, 이후 창 크기 변경에 자동으로 반응한다
  initCanvasFit(canvas);
  initCursor(); // 게임 영역 커서(config.cursor) — hotspot이 클릭 좌표와 어긋나면 안 되므로 최대한 일찍

  initInput(canvas);
  initHazards(); // 환경 방해가 DOM을 얹을 레이어(.layer-hazard)를 잡아둔다
  initSound(); // 효과음 — AudioContext를 세우고 mp3 프리로드를 시작한다(await 안 함)
  initBgm(); // 배경음악 — sound.js가 만든 AudioContext를 재사용(반드시 initSound() 다음)
  initDesktop(); // HTML 바탕화면(창 드래그·개그 팝업·시계)
  initTitleScreen(); // 타이틀 화면 버튼(이어하기/새 게임/설정/나가기)
  initBsodScreen(); // 실패 화면(BSOD) 버튼(재도전/로비/나가기)
  initClearScreen(); // 구간 클리어 화면(폴더 정리 연출) 버튼/스킵
  initEndingScreen(); // 완주 엔딩(완주 메시지→슬라이드쇼→크레딧) 버튼/스킵
  initUploadPicture(); // 완료 연출(반짝+팝+라벨) CSS 변수 세팅
  initCrtTransition(); // 화면 전환 CRT 킥 — config.crt.durationMs를 CSS 변수로 내려보낸다
  initSettingsPanel(); // ESC 설정 팝업(사운드값 저장/CRT 실시간 토글/전체화면)
  initConfirmDialog(); // 공용 확인 대화상자(새 게임 덮어쓰기 등) — 설정창보다 뒤여도 무관
  initGallery(); // 그림 갤러리(타이틀 전용) — 버튼/그리드/뷰어 핸들러
  initRover(); // 튜토리얼 도우미(러버) — 슬라이드 패널 DOM/클릭 배선
  // 인트로(첫 실행 전용, 타이틀보다 앞) — DOM/버튼 배선 + 가짜 파일 아이콘 생성.
  // ★ 첫 실행이면 이 시점에 부팅 화면이 곧바로 뜬다(밸런스를 받아오는 동안 보이는
  //   로딩 오버레이를 덮는다). 타임라인 자체는 로딩이 끝난 뒤 applyLoadedData()가
  //   startIntro()로 돌린다.
  initIntro(fileIcon);
  // 저장된 설정(사운드 셋·환경 방해)을 입힌다. ★ 반드시 initSound()/initBgm() 뒤여야
  // 한다 — 볼륨 노드가 그때 만들어지고, 여기서 그 노드에 값을 흘려보낸다.
  applySavedSettings();
  initDebugPanel();
  exposeDebugHandle();
  initReloadButton(async () => {
    await reloadGameData();
    await applyLoadedData();
    // 리로드는 "지금 판을 접고 새 숫자로 다시 본다"는 뜻이라 진행 중이었어도
    // 타이틀로 되돌린다(기존 동작 그대로) — 위 settlePhase는 이 의도까지는
    // 모르므로 여기서 명시적으로 한 번 더 찍는다.
    setPhase('title');
  });

  startLoop({
    update: (dt) => {
      // ★ 인트로(첫 실행 연출)는 게임 밖이다 — 게임 갱신을 통째로 건너뛰고 자기
      //   타임라인만 돌린다. update()의 playing 가드(core/stageManager.js)만으로도
      //   방해꾼은 안 돌지만, 그 아래 updateParticles/updateRipples/updateRover는
      //   가드 밖이라 그냥 두면 인트로 중에도 돈다. "인트로 중엔 게임 update가 돌지
      //   않는다"를 여기 한 줄로 못박는다.
      if (state.phase === 'intro') {
        updateIntro(dt);
        return;
      }

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
      // 튜토리얼 도우미도 같은 자리 — 설정 일시정지·히트스톱 동안은 같이 멈추고
      // (위 두 early return을 그대로 통과해 여기 왔다는 뜻이므로), 그 외엔
      // 게임 진행과 완전히 독립적으로 자기 큐만 진행한다(진행바는 안 건드린다).
      updateRover(dt);
    },
    render: (now) => {
      render({ ctx, canvas, state, gameData, now });
      // HUD는 이제 HTML 창이다 — 캔버스를 그린 뒤 같은 프레임에 값만 흘려 넣는다.
      syncDesktopPhase(state.phase);
      syncCrtTransition(state.phase, now); // phase가 이번 프레임에 바뀌었을 때만 내부에서 1회 재생
      updateBgm(state.phase, now); // 화면(phase)에 맞는 곡으로 자동 크로스페이드
      updateStatusWindows(state);
      updateUploadPicture(state);
      updateTitleScreen(); // 타이틀에 새로 들어온 프레임에만 [이어하기] 노출을 갱신
      updateBsodScreen();
      updateClearScreen(now);
      updateEndingScreen(now);
      updateCursor(state.inputFreezeSec > 0); // hourglass 함정 발동 중엔 대기 커서로
    },
    onFrame: (fps) => updateDebugStats(state, gameData, fps),
  });

  logFontLoadStatus();
  await loadGameData();
  await applyLoadedData();

  // ★ 구글 시트를 임계 경로에서 뺐다 — 위 loadGameData()는 이제 로컬
  //   balance.csv로 먼저 착지시킨다(js/balance/loader.js 주석 참고). 시트는
  //   여기서 뒤이어 백그라운드로 받는다 — 도착 시점에 아직 판을 안 시작했으면
  //   applyLoadedData()를 한 번 더 태워 조용히 갈아 끼우고, 이미 시작했으면
  //   (또는 클리어/실패/엔딩 화면이면) 이번 판엔 반영하지 않는다(같은 파일의
  //   catchUpFromSheet 주석 — 판 중간에 밸런스가 바뀌면 안 된다).
  //   여기 한 번만 건다 — 리로드 버튼(initReloadButton 아래)은 reloadGameData()로
  //   별도 경로를 타므로 이 백그라운드 동기화와 안 겹친다.
  startBackgroundSheetSync(() => applyLoadedData());

  // ★ bgm_main(1.24MB, 플레이 화면 전용 곡)도 같은 이유로 여기로 미뤘다 —
  //   타이틀엔 안 쓰는데 initBgm()에서 곧장 받으면 그 fetch가 폰트·JS·
  //   balance.csv 같은 자원과 대역폭을 다툰다(js/systems/bgm.js의 initBgm
  //   주석 참고). await 없음 — 이 시점에도 게임 시작을 안 기다리게 한다.
  //   늦게 도착해도 무해하다: updateBgm이 매 프레임 재시도하므로 'playing'에
  //   막 진입했는데 아직 못 받았으면 그냥 무음으로 시작했다가 도착하는
  //   프레임부터 자동으로 페이드인한다(끊기거나 예외가 나지 않는다).
  loadMainTrack();
}

main();
