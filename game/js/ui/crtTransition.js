// 이 파일 역할: 화면 전환(phase가 바뀌는 순간) CRT 킥 연출 — "언제 재생하나"만 담당한다.
// "재생되면 어떻게 생겼나"는 대부분 style.css의 @keyframes(.layer-crt — 흰 가로선
// 펴짐·플래시·스캔라인·주사선 밀림)에 있지만, 화면 흔들림만은 예외다 — 왜 CSS가
// 아니라 여기 JS(getCrtShakeOffset)에 있는지는 아래 큰 주석 참고.

import { config } from '../config.js';

// ── 화면 흔들림이 CSS @keyframes가 아니라 여기 있는 이유 ─────────────────────
// 원래는 #stage(또는 그 안의 전용 래퍼)에 CSS로 흔들림을 걸었다. 그런데 실측으로
// 크롬의 진짜 렌더링 버그를 잡았다: <canvas>의 조상에게 3단계 이상의 중간 키프레임이
// 있는 transform 애니를 걸면(원인이 CSS @keyframes인지, JS로 매 프레임 style.transform을
// 직접 바꾸는지는 상관없다 — 둘 다 재현됨), 애니가 끝나 computed transform이 다시
// 'none'으로 멀쩡히 돌아온 뒤에도 <canvas>의 getBoundingClientRect()만 영구적으로
// 어긋난 값을 낸다. #desktop·#stage 자기 자신의 rect는 둘 다 정상인데 그 자손인
// canvas만 깨지는 것이라 정상적인 CSS 합성으로는 설명이 안 되고, 리사이즈로도 안
// 풀린다(재현 스크립트로 2단계 키프레임=안전/3단계 이상=깨짐을 확정했다). 클릭이
// canvas.getBoundingClientRect()를 기준으로 좌표를 계산하므로(ui/canvasGeometry.js),
// 이 버그가 터지면 전환 이후 클릭이 전부 안 먹는 상태로 영구히 굳는다 — CRT 연출
// 하나 때문에 게임이 먹통이 되는 건 용납할 수 없는 위험이다.
//
// 그래서 canvas의 조상은 절대 건드리지 않고, 흔들림을 캔버스 "그리기 자체"의 오프셋
// (ctx.translate)으로 옮겼다 — ui/render.js가 매 프레임 이 함수가 계산한 오프셋만큼
// 그리기 원점을 밀었다 되돌린다. DOM transform이 전혀 관여하지 않으므로 canvas의
// rect·클릭 좌표 변환에는 원천적으로 영향을 줄 수 없다.
//
// ★ 단, "그리기만 흔들리고 판정 기준점은 그대로"라는 뜻이다 — 클릭 판정은 흔들리기
// 전 좌표 기준으로 남는다. 그래서 ui/render.js는 이 오프셋을 방해꾼·가짜커서·뜬
// 글씨에만 걸고, 두 곳은 일부러 뺐다:
//   · 대기/결과 화면의 시작·다시하기 버튼 — 그 클릭 판정(systems/input.js의
//     select/cleared/failed 분기)이 이 오프셋을 전혀 모르는 별도 계산이다. 버튼은
//     phase 전환 직후에도 바로 눌리는 진짜 클릭 대상이라 위험을 감수할 이유가 없다.
//   · H키 디버그 십자선 — 그건 "클릭이 실제로 어디로 계산됐는지"를 있는 그대로
//     보여주는 진단 도구라, 흔들면 클릭은 안 흔들렸는데 좌표가 어긋난 것처럼
//     오해하게 만든다.
// 방해꾼은 예외로 남겨뒀다 — CRT는 phase가 막 바뀐 프레임에만 재생되는데, 그 직후엔
// 아직 스폰된 방해꾼이 없거나(title→playing) 이번 phase에서 클릭 대상이 아니므로
// (playing→cleared/failed로 넘어가는 순간), 흔들리는 동안 실제로 방해꾼을 클릭하는
// 경우가 사실상 없다 — 있더라도 감쇠 곡선이라 대부분 구간에서 오프셋이 작다.
const CRT_SHAKE_DECAY_TAU_RATIO = 6; // durationMs의 1/6을 감쇠 시상수로 — 끝나기 전에 충분히 잦아든다
const CRT_SHAKE_FREQ_X = 14; // Hz. 두 축에 다른 진동수를 줘서 대각선이 아니라 불규칙하게 흔들리게 한다
const CRT_SHAKE_FREQ_Y = 11;

// 마지막으로 흔들림을 트리거한 렌더 타임스탬프(rAF now, ms). null이면 아직 없음.
let shakeStartAt = null;

/**
 * 지금 이 프레임(now)에 그리기 원점을 얼마나 밀어야 하는지(월드 단위, config.canvas
 * 좌표계 기준). 흔들림이 진행 중이 아니면 {x:0,y:0} — ui/render.js는 매 프레임
 * 이 값을 그대로 ctx.translate에 넘기면 된다(0,0이면 사실상 아무 효과 없음).
 */
export function getCrtShakeOffset(now) {
  if (shakeStartAt == null) return { x: 0, y: 0 };
  const t = now - shakeStartAt;
  if (t < 0 || t > config.crt.durationMs) return { x: 0, y: 0 };

  const tau = config.crt.durationMs / CRT_SHAKE_DECAY_TAU_RATIO;
  const decay = Math.exp(-t / tau);
  const amp = config.crt.shakeAmpPx * decay;
  return {
    x: amp * Math.sin((2 * Math.PI * CRT_SHAKE_FREQ_X * t) / 1000),
    y: amp * Math.cos((2 * Math.PI * CRT_SHAKE_FREQ_Y * t) / 1000),
  };
}

// 직전 프레임에 봤던 phase. null이면 "아직 한 번도 안 봤다"는 뜻으로 쓴다
// (첫 프레임을 기준값으로만 잡고 재생은 안 하기 위한 표시 — 초기화 참고).
let prevPhase = null;

/**
 * 최초 1회. config.crt.durationMs를 CSS 변수(--crt-duration)로 내려보낸다 — 재생시간을
 * config 한 곳에서만 바꿀 수 있게 하려는 것. style.css의 @keyframes(.layer-crt 쪽)는
 * 전부 이 변수를 참조한다. 흔들림 세기(shakeAmpPx)는 CSS가 아니라 getCrtShakeOffset이
 * 직접 config를 읽으므로 여기서 변수로 내보낼 게 없다.
 */
export function initCrtTransition() {
  document.documentElement.style.setProperty('--crt-duration', `${config.crt.durationMs}ms`);
}

/**
 * 매 프레임 호출. state.phase가 "바뀐 프레임"에만 CRT 킥을 1회 재생한다.
 *
 * ★ 여기가 이 파일의 핵심이다: phase === prevPhase면(안 바뀌었으면) 그냥 return —
 * playing 같은 긴 구간 동안 매 프레임 호출돼도 이 한 줄 비교 말고는 아무 것도
 * 안 하므로, "게임 중 지지직" 같은 건 구조적으로 불가능하다(조건문이 막고 있지,
 * 타이머나 프레임 카운트로 눌러놓은 게 아니다).
 *
 * 첫 호출(prevPhase===null)은 기준값만 잡고 재생하지 않는다 — 그래서 부팅 직후
 * 'loading'으로 시작하는 것 자체는 "전환"으로 안 치지만, 그다음 'loading'→'title'로
 * 실제로 바뀌는 프레임은 정확히 잡아서 재생한다(최초 진입 CRT 요구사항).
 *
 * now(rAF 타임스탬프)를 받아 shakeStartAt에 남긴다 — getCrtShakeOffset이 같은 시계
 * 기준으로 경과시간을 재야 두 값이 어긋나지 않는다(성능 타이머와 rAF 시계를
 * 섞어 쓰면 드물게 미세한 오차가 난다).
 */
export function syncCrtTransition(phase, now) {
  if (prevPhase === null) {
    prevPhase = phase;
    return;
  }
  if (phase === prevPhase) return;
  prevPhase = phase;

  playCrtKick(now);
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
function playCrtKick(now) {
  const layer = document.getElementById('layer-crt');
  if (!layer) return;

  layer.classList.remove('crt-playing');
  void layer.offsetWidth; // 강제 리플로우 — 클래스 제거가 실제로 반영되게 한다
  layer.classList.add('crt-playing');

  // 흔들림은 DOM transform이 아니라 shakeStartAt 타임스탬프만 갱신한다 — 실제 계산은
  // getCrtShakeOffset이 하고 ui/render.js가 매 프레임 그 결과를 그리기에 반영한다
  // (위 파일 상단 큰 주석 — canvas 조상에 transform 애니를 걸면 안 되는 이유).
  shakeStartAt = now;
}
