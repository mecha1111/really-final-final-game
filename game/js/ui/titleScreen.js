// 이 파일 역할: 타이틀 화면(HTML 오버레이, .layer-title) 버튼 3개를 게임 전환에 연결한다.
// 배경·로고 애니(floaty, hover 확대)는 순수 CSS(style.css)라 여기선 클릭 훅만 담당한다.

import { startGame } from '../core/stageManager.js';
import { openSettings } from './settingsPanel.js';

/** 최초 1회. 타이틀 화면 버튼에 핸들러를 붙인다. */
export function initTitleScreen() {
  document.getElementById('title-btn-start')?.addEventListener('click', () => {
    // 대기화면(select)을 건너뛰고 첫 구간(n=0)으로 바로 들어간다.
    // 타이틀에서 "게임 시작"을 이미 눌렀는데 또 "엔터/클릭" 대기 화면이 나오면
    // 확인을 두 번 받는 꼴이라 흐름이 끊긴다.
    // ★ 대기화면 자체를 없애는 건 아니다 — 결과→다음구간(cleared/failed → select)은
    //   그대로 select를 거친다(core/stageManager.js의 advanceStage). 거기선 "구간이
    //   올라 빡세졌다"를 숫자로 보여주는 역할이 있어서 한 박자 쉬는 게 맞다.
    startGame(0);
  });

  document.getElementById('title-btn-settings')?.addEventListener('click', () => {
    openSettings();
  });

  // Verse8 iframe 배포본에서는 window.close()가 무효다(스크립트가 열지 않은 창은
  // 못 닫는다) — 종료 프로토콜을 새로 만들지 않고, 게임 전체의 "안 닫히는 창" 개그
  // 톤(ui/desktop.js의 메인 창 X 비활성 전례)에 맞춰 살짝 흔들리기만 한다.
  const quitBtn = document.getElementById('title-btn-quit');
  quitBtn?.addEventListener('click', () => {
    quitBtn.classList.remove('shake');
    void quitBtn.offsetWidth; // 리플로우 강제 — 연타해도 애니가 처음부터 다시 재생되게
    quitBtn.classList.add('shake');
  });
}
