// 이 파일 역할: 실패 화면(BSOD, .layer-bsod) — 수치 채우기(매 프레임, failed일 때만)와
// 버튼 3개(재도전/로비/나가기) 클릭 훅. ui/titleScreen.js와 같은 패턴이다.

import { state } from '../core/state.js';
import { startGame } from '../core/stageManager.js';

const last = {};
function setText(el, value) {
  if (!el) return;
  const s = String(value);
  if (last[el.id] === s) return;
  last[el.id] = s;
  el.textContent = s;
}

/** 최초 1회. 버튼 3개에 핸들러를 붙인다. */
export function initBsodScreen() {
  // 재도전 — "현 실패규칙대로 n=0 리셋". 이 프로젝트엔 판을 넘어 남는 영구강화
  // 시스템이 아직 없다(state 전체가 startGame()에서 매번 새로 만들어진다) — 그래서
  // "영구강화 보존"은 지금은 자명하게 참이다(애초에 지워질 영구 상태가 없다).
  // 나중에 그런 시스템이 생기면 여기서 그 부분만 안 건드리게 손봐야 한다.
  document.getElementById('bsod-retry')?.addEventListener('click', () => {
    startGame(0);
  });

  // 로비 — 타이틀로. startGame()을 거치지 않고 phase만 바로 바꾼다(최초 부팅 때
  // main.js의 applyLoadedData()가 'loading' → 'title'로 착지시키는 것과 같은 방식).
  document.getElementById('bsod-lobby')?.addEventListener('click', () => {
    state.phase = 'title';
  });

  // 나가기 — Verse8 iframe 배포본에서는 window.close()가 무효다(스크립트가 열지
  // 않은 창은 못 닫는다). 종료 프로토콜을 새로 만들지 않고, 타이틀의 "나가기"와
  // 같은 톤으로 로비로 보낸다(배포 맥락에서 "나가기"가 할 수 있는 가장 정직한 동작).
  document.getElementById('bsod-quit')?.addEventListener('click', () => {
    state.phase = 'title';
  });
}

/** 매 프레임 호출. failed가 아니면 건너뛴다(창이 숨겨져 있으므로).
 * ★ 파라미터를 안 받고 위에서 import한 state를 그대로 쓴다 — initBsodScreen()의
 *   버튼 핸들러도 같은 import를 쓰므로, 굳이 매 프레임 파라미터로 다시 넘겨받아
 *   지역에서 같은 이름을 가리는 것보다 이쪽이 더 명확하다. */
export function updateBsodScreen() {
  if (state.phase !== 'failed' || !state.rules) return;

  setText(document.getElementById('bsod-progress'), Math.floor(state.uploaded));
  setText(document.getElementById('bsod-quota'), state.rules.quota);

  const s = state.stats;
  const acc = s.clicks > 0 ? Math.round((s.hits / s.clicks) * 100) : 0;
  setText(document.getElementById('bsod-stats'), `완료 파일 ${s.filesDone} · 제거 ${s.killed} · 정확도 ${acc}%`);
}
