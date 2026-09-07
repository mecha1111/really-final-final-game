// 이 파일 역할: 타이틀 화면(HTML 오버레이, .layer-title) 버튼들을 게임 전환에 연결한다.
// [이어하기]는 세이브(core/save.js)에 진행이 있을 때만 보이고, [새 게임]은 지울 진행이
// 있으면 공용 확인 대화상자(ui/confirmDialog.js)를 한 번 거친다.
// 배경·로고 애니(floaty, hover 확대)는 순수 CSS(style.css)라 여기선 클릭 훅만 담당한다.

import { startGame } from '../core/stageManager.js';
import { config } from '../config.js';
import { hasProgress, savedStageIndex, hasCompletedRun } from '../core/save.js';
import { playSfx, SFX } from '../systems/sound.js';
import { openSettings } from './settingsPanel.js';
import { openConfirm } from './confirmDialog.js';
import { openGallery } from './galleryPanel.js';
import { startGameOpening } from './gameOpening.js';
import { state } from '../core/state.js';
import { isDesktopApp, quitApp } from '../core/platform.js';

// "나가기" 개그 — 문구·수치는 전부 config.quit에 있다(하드코딩 금지 요구사항).
// 이 카운트만 여기 남는다(세션 상태라 config 값이 아니다).
let quitClickCount = 0;

// exe(Electron)에서 "작별 문구"를 실제로 보여준 뒤 quitApp()을 부르기까지의
// 유예 마감 시각(performance.now() 기준, 0이면 대기 중 아님). setTimeout이
// 아니라 시각 비교로만 판정한다 — ui/canvasGeometry.js의 화면 회전 "정착
// 유예"(settleUntilMs)와 완전히 같은 패턴이다.
let quitFarewellUntilMs = 0;

let quitLayerEl = null;
let quitTitleEl = null;
let quitSubEl = null;

/**
 * "나가기" 대화상자를 연다 — 누를 때마다 문구가 한 단계씩 진행된다.
 * ★ 웹/exe 분기는 이 함수 한 곳에서만 한다(요구사항) — 개그 문구는 두 실행
 *   환경이 완전히 같은 config.quit.messages를 그대로 우려먹고, exe만 마지막에
 *   desktopQuitAt번째 클릭에서 desktopFarewell로 갈아 끼운 뒤 실제로 종료한다.
 *   1로 잡으면 개그가 통째로 사라지므로 그 값은 config.quit 쪽에서 5 이상을
 *   기본으로 둔다.
 */
function openQuitModal() {
  if (!quitLayerEl) return;
  const c = config.quit;
  quitClickCount += 1;

  const isFarewell = isDesktopApp() && quitClickCount >= c.desktopQuitAt;
  const msg = isFarewell ? c.desktopFarewell : c.messages[Math.min(quitClickCount - 1, c.messages.length - 1)];

  if (quitTitleEl) quitTitleEl.textContent = msg.title;
  if (quitSubEl) quitSubEl.textContent = msg.sub;
  // 설정창과 같은 "시스템 대화상자 여닫는 소리"를 그대로 재사용(요구사항: 기존
  // XP 에러음/클릭음 재사용) — 새 사운드를 또 안 만든다.
  playSfx(SFX.UI_OPEN, { ui: true });
  quitLayerEl.classList.add('open');

  if (isFarewell) {
    // 작별 문구를 실제로 보여준 뒤(요구사항: 놀린 다음에 꺼진다) quitApp()을
    // 부른다 — updateTitleScreen()이 매 프레임 이 마감 시각을 확인한다.
    quitFarewellUntilMs = performance.now() + c.farewellHoldMs;
  }
}

function closeQuitModal() {
  if (!quitLayerEl || !quitLayerEl.classList.contains('open')) return;
  playSfx(SFX.UI_CLOSE, { ui: true });
  quitLayerEl.classList.remove('open');
}

let continueBtnEl = null;
let infiniteBtnEl = null;

// 지난 프레임에 title이었는지 — "이번에 새로 타이틀로 들어왔다"를 판별해 그때만
// [이어하기] 노출을 갱신한다(ui/bsodScreen.js의 wasFailed, ui/clearScreen.js의
// wasCleared와 같은 idiom). 매 프레임 세이브를 들여다볼 이유가 없다.
let wasTitle = false;

/** 세이브 상태에 따라 조건부 버튼들의 노출을 맞춘다.
 * display를 직접 만지지 않고 hidden 속성만 토글한다 — #title-menu는 flex-column
 * 이라 항목이 빠지면 나머지가 자연스럽게 자리를 메운다(레이아웃 손 안 댐).
 * ★ .btn에는 display를 못박은 CSS 규칙이 없어서 hidden이 정상적으로 먹는다
 *   (갤러리 뷰어/클리어 화면의 새 줄처럼 display가 박힌 곳은 클래스로 토글해야
 *   한다 — 같은 함정을 두 번 겪었다, style.css 주석 참고). */
function syncConditionalButtons() {
  if (continueBtnEl) continueBtnEl.hidden = !hasProgress();
  // [무한 모드]는 유한 구간을 전부 깬 뒤에만 — 그 전엔 존재 자체를 안 알린다.
  if (infiniteBtnEl) infiniteBtnEl.hidden = !hasCompletedRun();
}

/**
 * ★타이틀에서 판을 시작하는 유일한 통로(2026-09-08 신설).
 * 곧장 startGame()을 부르지 않고 오프닝(ui/gameOpening.js)을 한 번 거친다 —
 * 렉·로딩 연출과 첫 실행 튜토리얼이 거기 있고, 그게 끝나야 실제 판이 돈다.
 * 오프닝이 보여줄 게 없으면(두 번째 실행 등) 그 자리에서 곧바로 콜백을 부르므로
 * 여기서 조건을 또 따질 게 없다.
 *
 * ★"어느 구간으로 시작하는가"는 버튼마다 다르다(새 게임 0 / 이어하기 저장구간 /
 *   무한 모드 finiteCount) — 그 판단은 각 버튼이 하고, 이 함수는 그걸 콜백으로
 *   실어 보내기만 한다.
 */
function beginRun(stageIndex) {
  startGameOpening(() => startGame(stageIndex));
}

/** 첫 구간(n=0)으로 새 판을 시작한다. [새 게임]과 그 덮어쓰기 확인이 함께 쓴다. */
function startNewGame() {
  // 대기화면(select)을 건너뛰고 첫 구간(n=0)으로 바로 들어간다.
  // 타이틀에서 "새 게임"을 이미 눌렀는데 또 "엔터/클릭" 대기 화면이 나오면
  // 확인을 두 번 받는 꼴이라 흐름이 끊긴다.
  // ★ 대기화면 자체를 없애는 건 아니다 — 결과→다음구간(cleared/failed → select)은
  //   그대로 select를 거친다(core/stageManager.js의 advanceStage). 거기선 "구간이
  //   올라 빡세졌다"를 숫자로 보여주는 역할이 있어서 한 박자 쉬는 게 맞다.
  //
  // ★ 여기서 세이브를 미리 지우지 않는다 — 새 판을 끝까지 가서 clear/게임오버가
  //   나면 core/save.js가 그때 stageIndex를 새로 쓴다(클리어는 Math.max라 낮은
  //   구간을 다시 깨도 뒤로 밀리지 않는다). 지금 지워버리면 "새 게임을 눌러만
  //   보고 나간" 경우에 해금까지 통째로 날아간다. 초기화를 진짜로 원하면
  //   설정창의 [저장 데이터 초기화]가 따로 있다.
  beginRun(0);
}

/** 최초 1회. 타이틀 화면 버튼에 핸들러를 붙인다. */
export function initTitleScreen() {
  continueBtnEl = document.getElementById('title-btn-continue');
  infiniteBtnEl = document.getElementById('title-btn-infinite');
  syncConditionalButtons(); // 첫 프레임 전에 한 번 맞춰둔다(로딩 중엔 어차피 안 보인다)

  continueBtnEl?.addEventListener('click', () => {
    playSfx(SFX.UI_CLICK, { ui: true });
    // ★ 저장된 구간의 "처음부터" 시작한다 — 중간 저장이 아니다(core/save.js).
    //   startGame()의 기존 리셋이 그대로 다 돌아간다.
    //   phase 레이스는 core/state.js의 정착 가드(settlePhase)가 이미 막고 있어서
    //   여기서 추가로 방어할 게 없다 — 이미지 프리로드가 늦게 끝나 뒤늦게 도착하는
    //   'title' 대입은 playing을 못 덮는다.
    beginRun(savedStageIndex());
  });

  infiniteBtnEl?.addEventListener('click', () => {
    playSfx(SFX.UI_CLICK, { ui: true });
    // 무한모드의 첫 구간 = 유한 구간 바로 다음(config.stage.finiteCount).
    // 여기서부터는 상한이 없어 공식이 계속 오른다(core/stageManager.js의
    // nextStageIndex가 무한 구간만 클램프를 안 건다).
    // ★ 세이브를 안 건드린다 — 무한모드 진행은 이어할 구간(유한 캠페인 진행도)과
    //   별개로 best.infiniteStage에만 남는다(core/save.js).
    beginRun(config.stage.finiteCount);
  });

  document.getElementById('title-btn-start')?.addEventListener('click', () => {
    playSfx(SFX.UI_CLICK, { ui: true });
    // 지울 진행이 없으면 그냥 시작한다 — 아무것도 안 지우는 확인창은 소음이다.
    if (!hasProgress()) {
      startNewGame();
      return;
    }
    openConfirm({
      title: '새로 시작할까요?',
      sub: `저장된 진행(${savedStageIndex() + 1}구간부터 이어하기)이 사라집니다. 완성한 그림은 그대로 남습니다.`,
      okLabel: '새로 시작',
      onConfirm: startNewGame,
    });
  });

  document.getElementById('title-btn-gallery')?.addEventListener('click', () => {
    playSfx(SFX.UI_CLICK, { ui: true });
    openGallery();
  });

  document.getElementById('title-btn-settings')?.addEventListener('click', () => {
    openSettings();
  });

  quitLayerEl = document.getElementById('layer-quit');
  quitTitleEl = document.getElementById('quit-dlg-title');
  quitSubEl = document.getElementById('quit-dlg-sub');

  // Verse8 iframe 배포본에서는 window.close()가 무효다(스크립트가 열지 않은 창은
  // 못 닫는다) — 종료 프로토콜을 새로 만들지 않고, 게임 전체의 "안 닫히는 창" 개그
  // 톤(ui/desktop.js의 메인 창 X 비활성 전례)에 맞춰 XP 시스템 오류창 패러디로
  // "못나가요 ㅋㅋ"를 띄운다. 버튼이 살짝 흔들리는 기존 연출도 그대로 같이 낸다
  // (놀란 반응 + 설명 대화상자, 둘 다 있어도 안 겹친다).
  const quitBtn = document.getElementById('title-btn-quit');
  quitBtn?.addEventListener('click', () => {
    playSfx(SFX.UI_CLICK, { ui: true });
    quitBtn.classList.remove('shake');
    void quitBtn.offsetWidth; // 리플로우 강제 — 연타해도 애니가 처음부터 다시 재생되게
    quitBtn.classList.add('shake');
    openQuitModal();
  });

  document.getElementById('quit-dlg-ok')?.addEventListener('click', closeQuitModal);
  document.getElementById('quit-dlg-close')?.addEventListener('click', closeQuitModal);

  // ESC로도 닫힌다(설정창과 같은 관례) — 열려 있을 때만 반응하므로 다른 ESC
  // 동작(설정창 자체 등)과 안 겹친다.
  window.addEventListener('keydown', (evt) => {
    if (evt.code === 'Escape') closeQuitModal();
  });
}

/** 매 프레임 호출(main.js). 타이틀로 "새로 들어온" 프레임에만 [이어하기]를 갱신한다. */
export function updateTitleScreen() {
  // exe 작별 유예 — phase 가드보다 먼저 본다. 이 모달은 타이틀에서만 열리지만,
  // 혹시라도 그 사이 화면이 바뀌어도 예고한 종료는 그대로 지켜야 한다("놀린
  // 뒤엔 반드시 꺼진다"는 요구사항의 결정성이 화면 전환에 좌우되면 안 된다).
  if (quitFarewellUntilMs && performance.now() >= quitFarewellUntilMs) {
    quitFarewellUntilMs = 0;
    quitApp();
  }

  if (state.phase !== 'title') {
    wasTitle = false;
    return;
  }
  if (wasTitle) return;
  wasTitle = true;
  syncConditionalButtons();
}
