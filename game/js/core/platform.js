// 이 파일 역할: 지금 이 게임이 어떤 실행 환경에 있는지 판별한다 — 웹 브라우저
// (지금 유일한 배포 형태)와, 나중에 Electron으로 감싸 exe로 낼 데스크톱 앱.
//
// ★ 지금은 Electron을 아예 붙이지 않았다. 이 파일은 지금 당장 뭔가를 바꾸려는
//   게 아니라, 나중에 Electron을 붙일 때 걸어 넣을 자리(훅)를 미리 파두는
//   것이 목적이다 — isDesktopApp()의 진짜 감지 로직은 이미 넣어뒀지만, 강제
//   오버라이드 없이는 실전에서 true가 나올 길이 없다(아래 참고). 순수 웹
//   배포에서 이 값이 항상 false인 게 정상이고 의도한 그대로다.

import { config } from '../config.js';

/**
 * 지금 Electron(또는 그에 준하는 데스크톱 셸) 안에서 돌고 있는가.
 * ui/titleScreen.js의 [나가기] 개그가 이 값 하나로 웹/exe 분기를 정한다.
 *
 * ★ 검증(강제 전환) 수단 두 가지 — 실제 Electron 없이도 데스크톱 분기를 켤 수 있다:
 *   1) URL 쿼리 ?desktop=1 — 매번 코드를 고쳤다 되돌릴 필요 없이 주소창에서
 *      바로 켜고 끌 수 있어 이쪽을 기본 검증 경로로 쓴다.
 *   2) config.quit.forceDesktopApp을 true로 — 코드에서 고정해두고 싶을 때.
 * 이 둘이 전부 꺼져 있으면 아래 진짜 Electron 감지로 떨어지는데, Electron을
 * 아직 안 붙였으니 두 검사 다 항상 falsy다.
 */
export function isDesktopApp() {
  if (config.quit.forceDesktopApp) return true;

  try {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('desktop') === '1') {
      return true;
    }
  } catch {
    /* URL을 못 읽는 극단적인 환경(예: 일부 file:// 조합) — 무시하고 아래로 넘어간다 */
  }

  // ★ 진짜 Electron 감지. Electron의 렌더러 프로세스는 Node 통합이 켜져 있으면
  //   window.process.versions.electron을 노출하고, 꺼져 있어도 기본 User-Agent에
  //   "Electron/버전"이 붙는다 — 둘 중 하나만 있어도 데스크톱으로 본다.
  //   지금은 Electron이 없어 이 둘 다 항상 falsy다.
  if (typeof window !== 'undefined' && window.process?.versions?.electron) return true;
  if (typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent || '')) return true;

  return false;
}

/**
 * 실제 종료를 시도한다. ui/titleScreen.js가 [나가기] 개그를 다 보여준 뒤
 * (config.quit.desktopQuitAt번째 클릭) exe에서만 이 함수를 부른다.
 *
 * ★ 지금은 빈 함수(호출됐다는 로그만 남긴다) — Electron을 붙일 때 아래 TODO
 *   자리를 실제 종료 로직으로 바꾼다. 지금 당장 호출돼도 아무 일도 안 나므로
 *   (웹에서 실수로 이 경로를 타도) 안전하다.
 */
export function quitApp() {
  // TODO(Electron 연동 시): 렌더러에서 직접 닫을 수 있으면 window.close(),
  //   보안상 Node 통합을 끄고 preload로 IPC를 노출해뒀다면
  //   window.electronAPI?.quit?.() 같은 식으로 메인 프로세스에 종료를 요청한다.
  console.log('[platform] quitApp() 호출됨 — 아직 Electron 미연동이라 실제로는 아무 일도 안 일어난다.');
}
