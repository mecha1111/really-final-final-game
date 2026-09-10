// 이 파일 역할: 지금 이 게임이 어떤 실행 환경에 있는지 판별한다 — 웹 브라우저와
// Electron으로 감싼 데스크톱 exe(electron/main.cjs+preload.cjs).
//
// ★ 2026-09-10: Electron을 실제로 붙였다. preload.cjs가 window.electronAPI를
//   노출하므로 그 존재 여부가 가장 확실한 신호다 — 아래 isDesktopApp()이 그걸
//   1순위로 본다. 강제 오버라이드 두 가지(URL 쿼리·config 플래그)는 Electron
//   없이도 데스크톱 분기를 검증하던 예전 수단인데, 지금도 그대로 쓸모가
//   있어서(웹 브라우저에서 데스크톱 UI 분기만 빠르게 확인할 때) 남겨둔다.

import { config } from '../config.js';

/**
 * 지금 Electron(또는 그에 준하는 데스크톱 셸) 안에서 돌고 있는가.
 * ui/titleScreen.js의 [나가기] 개그, ui/settingsPanel.js의 전체화면 체크박스
 * IPC 분기, js/main.js의 리로드 버튼 노출 여부가 전부 이 값 하나로 갈린다.
 *
 * ★ 검증(강제 전환) 수단 두 가지 — 실제 Electron 없이도 데스크톱 분기를 켤 수 있다:
 *   1) URL 쿼리 ?desktop=1 — 매번 코드를 고쳤다 되돌릴 필요 없이 주소창에서
 *      바로 켜고 끌 수 있어 이쪽을 기본 검증 경로로 쓴다.
 *   2) config.quit.forceDesktopApp을 true로 — 코드에서 고정해두고 싶을 때.
 * 이 둘이 전부 꺼져 있으면 아래 진짜 Electron 감지로 떨어진다.
 */
export function isDesktopApp() {
  // ★ 진짜 Electron 감지 — 1순위. preload.cjs가 contextBridge로 노출한
  //   값이라 nodeIntegration:false/contextIsolation:true 조합에서도 확실하다
  //   (아래 window.process 검사는 nodeIntegration이 켜져 있을 때만 보이는데
  //   이 프로젝트는 보안상 꺼둔다 — 있으면 좋은 보너스 신호 정도로 남겨둔다).
  if (typeof window !== 'undefined' && window.electronAPI?.isElectron) return true;

  if (config.quit.forceDesktopApp) return true;

  try {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('desktop') === '1') {
      return true;
    }
  } catch {
    /* URL을 못 읽는 극단적인 환경 — 무시하고 아래로 넘어간다 */
  }

  if (typeof window !== 'undefined' && window.process?.versions?.electron) return true;
  if (typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent || '')) return true;

  return false;
}

/**
 * 실제 종료를 시도한다. ui/titleScreen.js가 [나가기] 개그를 다 보여준 뒤
 * (config.quit.desktopQuitAt번째 클릭) exe에서만 이 함수를 부른다.
 *
 * electronAPI가 있으면(=exe) IPC로 메인 프로세스에 종료를 요청한다. 없으면(=웹)
 * 예전처럼 로그만 남기고 아무 일도 안 한다 — 웹에서 이 경로를 실수로 타도 안전하다.
 */
export function quitApp() {
  if (typeof window !== 'undefined' && window.electronAPI?.quit) {
    window.electronAPI.quit();
    return;
  }
  console.log('[platform] quitApp() 호출됨 — 웹 배포라 실제로는 아무 일도 안 일어난다.');
}
