// 이 파일 역할: 방해꾼이 너무 많아졌을 때 화면 전체가 지지직거리는 과부하 연출.
// "지금 감당이 안 된다"를 숫자가 아니라 화면으로 알린다.
//
// 두 갈래로 나눠 건다:
//   · 색수차 + 주사선 — DOM 오버레이(.layer-overload)에 CSS 변수로 강도만 흘려보낸다.
//     매 프레임 CSS 변수 두어 개만 갱신하므로 싸다.
//   · 미세 떨림 — 캔버스 그리기 원점을 미는 방식(ui/render.js가 더한다).
//
// ★ 떨림을 DOM transform으로 안 거는 이유: <canvas>의 조상에 transform 애니를 걸면
//   크롬이 canvas의 getBoundingClientRect()를 영구히 망가뜨리는 실측 버그가 있다
//   (ui/crtTransition.js 상단의 긴 주석). 오버레이 자체는 canvas의 형제라 거기
//   transform을 걸어도 안전하지만, 화면 "내용"을 떨려면 결국 canvas나 그 조상을
//   건드려야 하므로 그쪽은 그리기 원점으로만 처리한다.
//
// ★ 임계 밑으로 내려가면 정확히 0이 되어 완전히 사라진다 — 잔상이 남으면
//   "왜 아직도 지지직거리지?"가 된다.

import { config } from '../config.js';
import { playSfx, SFX } from './sound.js';

let level = 0; // 0~1. 0이면 완전히 꺼진 상태.
// 과부하 "진입/해제" 엣지 추적 — 강도는 매 프레임 재계산되므로 그 값만으로는
// "지금 막 켜졌다"와 "아까부터 켜져 있다"가 구분이 안 돼서, 직전 프레임 상태를 들고 있다.
let wasOverloaded = false;

/** 새 판이 시작될 때(core/stageManager.js의 startGame). 지난 판의 엣지 기억을 끊는다. */
export function resetOverloadEdges() {
  wasOverloaded = false;
  // CSS 변수 메모도 같이 비운다 — 판이 바뀌는 사이 누가 오버레이를 손댔더라도
  // 다음 갱신 때 "값이 같다"고 잘못 건너뛰지 않게(아래 writeVar 참고).
  for (const k of Object.keys(lastVar)) delete lastVar[k];
}

/**
 * 지금 살아있는 방해꾼 수로 강도를 정한다. 판마다 다른 rules.maxAlive와 무관하게
 * "몇 마리"라는 고정 기준(config.overload.startCount/fullCount)만 본다 —
 * 판이 바뀌어도 "몇 마리부터 지지직거리나"가 항상 같아야 예측 가능하다.
 * @param {number} aliveCount 살아있는(시체 제외) 방해꾼 수
 */
export function updateOverload(aliveCount) {
  const c = config.overload;
  // ★ startCount("8마리 이상")는 그 마릿수 자체에서 이미 강도>0이어야 한다.
  //   그냥 (aliveCount-startCount)/span으로 재면 딱 8마리일 때 분자가 0이라
  //   강도가 정확히 0으로 나온다 — "8마리부터"가 아니라 "9마리부터"가 돼버린다
  //   (실측: 8마리→0.000, 9마리→0.25로 확인됐다). +1을 넣어 8마리째부터 이미
  //   램프가 시작되게 한다.
  const span = c.fullCount - c.startCount + 1;
  level = span > 0
    ? Math.max(0, Math.min(1, (aliveCount - c.startCount + 1) / span))
    : aliveCount >= c.startCount ? 1 : 0;

  // 진입/해제 순간(1회) — 지지직이 켜지는 순간 글리치 버즈, 꺼지는 순간 복구음.
  // 반복 소리가 아니므로(엣지 1회) 과밀 상태가 길어져도 한 번만 난다.
  const active = level > 0;
  if (active && !wasOverloaded) playSfx(SFX.OVERLOAD_START);
  if (!active && wasOverloaded) playSfx(SFX.OVERLOAD_END);
  wasOverloaded = active;

  // ★ CSS 변수는 값이 실제로 바뀔 때만 쓴다 — 과밀이 아닌 대부분의 프레임은
  //   계속 "0"이라, 예전엔 같은 문자열을 매 프레임 다시 대입하고 있었다(그
  //   자체가 스타일 재계산 후보가 된다). ui/hazards/powersave.js가 --hz-dim에
  //   쓰는 메모 패턴과 같다.
  if (!layerEl) layerEl = document.getElementById('layer-overload');
  if (!layerEl) return;

  if (level <= 0) {
    // 0일 때는 변수를 0으로 확실히 되돌린다(잔상 방지).
    writeVar('--ovl-level', '0');
    return;
  }
  writeVar('--ovl-level', String(level * c.maxOpacity));
  writeVar('--ovl-split', `${(c.maxSplitPx * level).toFixed(2)}px`);
}

// 오버레이 엘리먼트와 직전에 쓴 CSS 변수 값(바뀔 때만 쓰기 위한 메모).
let layerEl = null;
const lastVar = {};
function writeVar(name, value) {
  if (lastVar[name] === value) return;
  lastVar[name] = value;
  layerEl.style.setProperty(name, value);
}

/** 지금 강도(0~1). 디버그 표시나 테스트가 읽는다. */
export function getOverloadLevel() {
  return level;
}

/**
 * 이번 프레임에 그리기 원점을 얼마나 떨어야 하는지(논리 좌표계 px).
 * 강도가 0이면 {0,0} — 평소엔 완전히 무해하다.
 * 두 축에 다른 진동수를 줘서 규칙적인 원운동으로 안 보이게 한다.
 */
export function getOverloadJitter() {
  if (level <= 0) return { x: 0, y: 0 };
  const c = config.overload;
  const t = performance.now() / 1000;
  const amp = c.maxJitterPx * level;
  return {
    x: amp * Math.sin(2 * Math.PI * c.jitterHz * t),
    y: amp * Math.cos(2 * Math.PI * c.jitterHz * 0.77 * t),
  };
}
