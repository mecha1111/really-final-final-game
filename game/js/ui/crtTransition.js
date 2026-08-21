// 이 파일 역할: 화면 전환(phase가 바뀌는 순간) CRT 킥 연출 — "언제 재생하나"만 담당한다.
// "재생되면 어떻게 생겼나"(흰 가로선 펴짐 + 플래시 + 스캔라인)는 전부 style.css의
// .layer-crt에 @keyframes로 있다. 여기는 매 프레임 phase를 보다가 "바뀐 그 프레임"에만
// CSS 애니를 재시작시키는 트리거 역할뿐이라, 애니 내용을 하나도 몰라도 된다.

import { config } from '../config.js';

// 직전 프레임에 봤던 phase. null이면 "아직 한 번도 안 봤다"는 뜻으로 쓴다
// (첫 프레임을 기준값으로만 잡고 재생은 안 하기 위한 표시 — 초기화 참고).
let prevPhase = null;

/**
 * 최초 1회. config.crt.durationMs를 CSS 변수(--crt-duration)로 내려보낸다 — 재생시간을
 * config 한 곳에서만 바꿀 수 있게 하려는 것. style.css의 @keyframes는 전부 이 변수를
 * 참조하고, 숫자를 직접 들고 있지 않는다.
 */
export function initCrtTransition() {
  document.documentElement.style.setProperty('--crt-duration', `${config.crt.durationMs}ms`);
}

/**
 * 매 프레임 호출. state.phase가 "바뀐 프레임"에만 CRT 킥을 1회 재생한다.
 *
 * ★ 여기가 이 파일의 전부다: phase === prevPhase면(안 바뀌었으면) 그냥 return —
 * playing 같은 긴 구간 동안 매 프레임 호출돼도 이 한 줄 비교 말고는 아무 것도
 * 안 하므로, "게임 중 지지직" 같은 건 구조적으로 불가능하다(조건문이 막고 있지,
 * 타이머나 프레임 카운트로 눌러놓은 게 아니다).
 *
 * 첫 호출(prevPhase===null)은 기준값만 잡고 재생하지 않는다 — 그래서 부팅 직후
 * 'loading'으로 시작하는 것 자체는 "전환"으로 안 치지만, 그다음 'loading'→'title'로
 * 실제로 바뀌는 프레임은 정확히 잡아서 재생한다(최초 진입 CRT 요구사항).
 */
export function syncCrtTransition(phase) {
  if (prevPhase === null) {
    prevPhase = phase;
    return;
  }
  if (phase === prevPhase) return;
  prevPhase = phase;

  playCrtKick();
}

/**
 * CSS 애니 재시작 트릭: .crt-playing 클래스를 지웠다가 강제 리플로우한 뒤 다시 붙여서
 * 처음부터 재생시킨다. 대기↔플레이를 몇 번을 왕복해도 매번 이 트릭으로 새로 킥되므로,
 * 이미 재생 중일 때 또 전환이 와도 잔류 없이 항상 최신 트리거로 덮어써진다.
 *
 * ★ 처음엔 "style.css의 base 셀렉터에 animation을 조건 없이 걸어두고, 여기서 인라인
 * animation:none↔''으로 껐다 켰다 하면 되겠지" 하고 짰었다(정확히 사양에 적힌 그
 * 방식). 그런데 실측(animationstart 이벤트 타임스탬프)으로 진짜 버그를 잡았다 —
 * 페이지가 뜨자마자 브라우저가 스타일을 커밋하는 시점에 애니가 자기 맘대로 1차
 * 자동재생을 시작해버리고, 그 다음에야 이 모듈의 init 코드가 실행돼서 이미 한 발
 * 늦게 animation:none을 걸었다(loading→title 전환에서 트리거는 1개인데 실제
 * animationstart는 2개 관측됨 — 자동재생 1 + 우리 트리거 1). init 실행 순서를
 * 앞당겨서 그 경주에서 이기는 것도 가능하지만 타이밍에 기대는 수선이라 불안정하다.
 * 그래서 style.css 쪽을 "클래스가 없으면 animation 선언 자체가 없다"(.crt-playing
 * 스코프 안에서만 animation을 건다)로 바꿨다 — 경주 자체가 성립하지 않게 원인을
 * 없앤 것이다. 여기 JS는 그 클래스 하나만 remove→리플로우→add 하면 된다.
 */
function playCrtKick() {
  const layer = document.getElementById('layer-crt');
  if (!layer) return;

  layer.classList.remove('crt-playing');
  void layer.offsetWidth; // 강제 리플로우 — 클래스 제거가 실제로 반영되게 한다
  layer.classList.add('crt-playing');
}
