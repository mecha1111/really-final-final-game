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

let level = 0; // 0~1. 0이면 완전히 꺼진 상태.

/**
 * 지금 살아있는 방해꾼 수와 이번 판의 동시 최대로 강도를 정한다.
 * @param {number} aliveCount 살아있는(시체 제외) 방해꾼 수
 * @param {number} maxAlive   이번 판의 동시 최대(rules.maxAlive)
 */
export function updateOverload(aliveCount, maxAlive) {
  const c = config.overload;
  // maxAlive가 0이면(디버그로 스폰을 꺼둔 상태 등) 비율을 낼 수 없다 — 꺼둔다.
  if (!(maxAlive > 0)) {
    level = 0;
  } else {
    const ratio = aliveCount / maxAlive;
    const span = c.fullRatio - c.startRatio;
    level = span > 0 ? Math.max(0, Math.min(1, (ratio - c.startRatio) / span)) : ratio >= c.startRatio ? 1 : 0;
  }

  const layer = document.getElementById('layer-overload');
  if (!layer) return;

  if (level <= 0) {
    // 0일 때는 변수를 0으로 확실히 되돌린다(잔상 방지).
    layer.style.setProperty('--ovl-level', '0');
    return;
  }
  layer.style.setProperty('--ovl-level', String(level * c.maxOpacity));
  layer.style.setProperty('--ovl-split', `${(c.maxSplitPx * level).toFixed(2)}px`);
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
