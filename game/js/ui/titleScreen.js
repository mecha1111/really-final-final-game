// 이 파일 역할: 타이틀 화면(HTML 오버레이, .layer-title) 버튼들을 게임 전환에 연결한다.
// [이어하기]는 세이브(core/save.js)에 진행이 있을 때만 보이고, [새 게임]은 지울 진행이
// 있으면 공용 확인 대화상자(ui/confirmDialog.js)를 한 번 거친다.
// 배경·로고 애니(floaty, hover 확대)는 순수 CSS(style.css)라 여기선 클릭 훅만 담당한다.

import { startGame } from '../core/stageManager.js';
import { hasProgress, savedStageIndex } from '../core/save.js';
import { playSfx, SFX } from '../systems/sound.js';
import { openSettings } from './settingsPanel.js';
import { openConfirm } from './confirmDialog.js';
import { state } from '../core/state.js';

// "나가기" 개그 대화상자 문구 — 누를수록 점점 짜증나는 톤으로. 마지막 문구에서
// 더 안 늘어나고 계속 반복된다(quitClickCount를 배열 길이로 클램프).
const QUIT_MESSAGES = [
  { title: '못나가요 ㅋㅋ', sub: '이 프로그램은 종료할 수 없습니다.' },
  { title: '진짜 못나가요', sub: '정말입니다. 종료 버튼이 원래 없어요.' },
  { title: '그만 누르세요', sub: '몇 번을 눌러도 똑같습니다...' },
];
let quitClickCount = 0;

let quitLayerEl = null;
let quitTitleEl = null;
let quitSubEl = null;

/** "나가기" 대화상자를 연다 — 누를 때마다 문구가 한 단계씩 진행된다. */
function openQuitModal() {
  if (!quitLayerEl) return;
  const msg = QUIT_MESSAGES[Math.min(quitClickCount, QUIT_MESSAGES.length - 1)];
  quitClickCount += 1;
  if (quitTitleEl) quitTitleEl.textContent = msg.title;
  if (quitSubEl) quitSubEl.textContent = msg.sub;
  // 설정창과 같은 "시스템 대화상자 여닫는 소리"를 그대로 재사용(요구사항: 기존
  // XP 에러음/클릭음 재사용) — 새 사운드를 또 안 만든다.
  playSfx(SFX.UI_OPEN, { ui: true });
  quitLayerEl.classList.add('open');
}

function closeQuitModal() {
  if (!quitLayerEl || !quitLayerEl.classList.contains('open')) return;
  playSfx(SFX.UI_CLOSE, { ui: true });
  quitLayerEl.classList.remove('open');
}

let continueBtnEl = null;

// 지난 프레임에 title이었는지 — "이번에 새로 타이틀로 들어왔다"를 판별해 그때만
// [이어하기] 노출을 갱신한다(ui/bsodScreen.js의 wasFailed, ui/clearScreen.js의
// wasCleared와 같은 idiom). 매 프레임 세이브를 들여다볼 이유가 없다.
let wasTitle = false;

/** 세이브에 진행이 있을 때만 [이어하기]를 보여준다. */
function syncContinueButton() {
  if (!continueBtnEl) return;
  // display를 직접 만지지 않고 hidden 속성만 토글한다 — #title-menu는 flex-column
  // 이라 항목 하나가 빠지면 나머지가 자연스럽게 자리를 메운다(레이아웃 손 안 댐).
  continueBtnEl.hidden = !hasProgress();
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
  startGame(0);
}

/** 최초 1회. 타이틀 화면 버튼에 핸들러를 붙인다. */
export function initTitleScreen() {
  continueBtnEl = document.getElementById('title-btn-continue');
  syncContinueButton(); // 첫 프레임 전에 한 번 맞춰둔다(로딩 중엔 어차피 안 보인다)

  continueBtnEl?.addEventListener('click', () => {
    playSfx(SFX.UI_CLICK, { ui: true });
    // ★ 저장된 구간의 "처음부터" 시작한다 — 중간 저장이 아니다(core/save.js).
    //   startGame()의 기존 리셋이 그대로 다 돌아간다.
    //   phase 레이스는 core/state.js의 정착 가드(settlePhase)가 이미 막고 있어서
    //   여기서 추가로 방어할 게 없다 — 이미지 프리로드가 늦게 끝나 뒤늦게 도착하는
    //   'title' 대입은 playing을 못 덮는다.
    startGame(savedStageIndex());
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
  if (state.phase !== 'title') {
    wasTitle = false;
    return;
  }
  if (wasTitle) return;
  wasTitle = true;
  syncContinueButton();
}
