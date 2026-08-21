// 이 파일 역할: 타이틀 화면(HTML 오버레이, .layer-title) 버튼 3개를 게임 전환에 연결한다.
// 배경·로고 애니(floaty, hover 확대)는 순수 CSS(style.css)라 여기선 클릭 훅만 담당한다.

import { goToSelect } from '../core/stageManager.js';

/** 최초 1회. 타이틀 화면 버튼에 핸들러를 붙인다. */
export function initTitleScreen() {
  document.getElementById('title-btn-start')?.addEventListener('click', () => {
    // startGame(0)으로 바로 안 들어가고 대기화면(select)을 거친다 — 대기화면이
    // "이번 구간에 실제로 적용될 숫자"를 미리 보여주는 역할이고(core/stageManager.js의
    // advanceStage 주석 참고), 첫 구간(n=0)도 그 흐름을 그대로 타는 게 일관된다.
    // goToSelect()는 예전엔 아무도 안 부르던 죽은 export였다 — 여기서 되살린다.
    goToSelect();
  });

  // 설정창은 아직 없다. 훅만 비워둔다 — 나중에 설정 모듈이 생기면 여기서 연결.
  document.getElementById('title-btn-settings')?.addEventListener('click', () => {});

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
