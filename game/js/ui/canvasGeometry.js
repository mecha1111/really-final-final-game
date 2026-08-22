// 이 파일 역할: 화면(client) 좌표 ↔ 게임 월드 좌표 변환의 단일 진실원.
// 두 방향(clientToWorld / worldToClient)이 같은 기하값 하나에서 나오므로 서로 갈라질 수 없다.
//
// ── 왜 별도 모듈인가 ────────────────────────────────────────────────────────
// 예전에는 클릭 판정과 디버그 그리기가 각자 좌표를 계산했다. 한쪽만 고치면 조용히
// 어긋나고, 증상은 "그림은 맞는데 클릭만 밀린다"로만 나타나 원인 찾기가 매우 어려웠다.
// 그래서 기하값을 구하는 곳을 한 군데로 못박고, 두 방향 모두 그것만 쓰게 한다.
//
// ── 화면 표시 크기를 어떻게 아는가 (여기가 핵심) ─────────────────────────────
// 캔버스가 화면에서 실제로 몇 CSS px를 차지하는지가 변환의 전부인데, 이 값을 구하는
// 방법 하나하나가 브라우저에 따라 틀릴 수 있다는 걸 실측으로 겪었다:
//   · getBoundingClientRect().width — 어떤 크롬은 조상의 CSS zoom을 반영한 "화면 크기"를
//     주고, 다른 크롬은 zoom을 뺀 "레이아웃 크기"를 준다. 사용자 실측에서는 zoom 0.897인데
//     rect가 1920x1080 @89,0으로 나왔다 — width는 레이아웃(1920)인데 left는 화면(89)이라
//     좌표계가 뒤섞인 상태였다. 이러면 클릭이 위치에 비례해 어긋난다.
//   · clientWidth × 조상 zoom 곱 — zoom을 어떻게 상속해서 보고하는지가 버전마다 달라서
//     같은 zoom을 두 번 곱해버릴 여지가 있다.
//   · innerWidth − 2×rect.left — 우리 레이아웃(#stage가 뷰포트를 채우고 #desktop을 가운데
//     둠)에 기대는 값이라, CSS를 바꾸면 조용히 틀어진다.
// 어느 하나도 단독으로는 못 믿는다. 그래서 셋을 다 구해 **중앙값**을 쓴다 — 정상
// 브라우저에서는 셋이 같은 값이라 아무 영향이 없고, 하나가 틀어져도 나머지 둘이
// 이겨서 옳은 값이 남는다. 어떤 후보가 튀었는지는 H키 진단에 그대로 보여준다.

/** 조상 체인의 zoom·transform 배율을 모두 곱한다(레이아웃 크기 → 화면 크기). */
function ancestorScale(el) {
  let sx = 1;
  let sy = 1;
  for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
    const cs = getComputedStyle(node);
    const z = parseFloat(cs.zoom);
    if (Number.isFinite(z) && z > 0 && z !== 1) {
      sx *= z;
      sy *= z;
    }
    if (cs.transform && cs.transform !== 'none') {
      try {
        const m = new DOMMatrix(cs.transform);
        if (m.a) sx *= Math.abs(m.a);
        if (m.d) sy *= Math.abs(m.d);
      } catch {
        /* 파싱 실패는 배율 1로 둔다 — 중앙값이 받아준다 */
      }
    }
  }
  return { sx, sy };
}

const median3 = (a, b, c) => Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));

/**
 * 지금 이 순간의 캔버스 기하. 매번 새로 잰다 — 창 크기·배율이 언제 바뀌든 따라간다
 * (값을 캐시해두면 리사이즈 타이밍에 옛 값을 쓰는 구멍이 생긴다).
 */
export function getCanvasGeometry(canvas) {
  const rect = canvas.getBoundingClientRect();
  const { sx, sy } = ancestorScale(canvas);

  // 화면 표시 크기 후보 셋 (위 주석 참고). 정상이면 셋이 같다.
  const wRect = rect.width;
  const wZoom = canvas.clientWidth * sx;
  const wCenter = window.innerWidth - 2 * rect.left;
  const hRect = rect.height;
  const hZoom = canvas.clientHeight * sy;
  const hCenter = window.innerHeight - 2 * rect.top;

  let dispW = median3(wRect, wZoom, wCenter);
  let dispH = median3(hRect, hZoom, hCenter);
  // 셋 다 이상한 극단적인 경우의 최후 방어 — 0으로 나누는 것만은 막는다.
  if (!(dispW > 0)) dispW = rect.width || canvas.clientWidth || 1;
  if (!(dispH > 0)) dispH = rect.height || canvas.clientHeight || 1;

  return {
    originX: rect.left,
    originY: rect.top,
    dispW,
    dispH,
    // 진단용: 어떤 후보가 튀었는지 H키 표시에서 바로 보인다.
    candidates: { wRect, wZoom, wCenter, hRect, hZoom, hCenter },
  };
}

/**
 * 화면(client) → 월드. 판정에 쓰는 값.
 * worldToBacking은 ui/render.js가 이번 프레임에 컨텍스트에 실제로 건 배율이다
 * (캔버스 엘리먼트에 적어둔다 — 모듈이 몇 벌 로드되든 같은 값이 보장된다).
 */
export function clientToWorld(canvas, clientX, clientY, worldToBacking) {
  const g = getCanvasGeometry(canvas);
  return {
    x: ((clientX - g.originX) * (canvas.width / g.dispW)) / worldToBacking,
    y: ((clientY - g.originY) * (canvas.height / g.dispH)) / worldToBacking,
  };
}

/**
 * 월드 → 화면(client). clientToWorld의 정확한 역함수 — 같은 기하값에서 나오므로
 * 둘이 갈라질 수 없다. 그리기 자체는 브라우저가 백킹스토어를 화면에 얹어서 하지만,
 * "게임이 생각하는 화면 위치"를 확인해야 할 때(자기검사·디버그) 이걸 쓴다.
 */
export function worldToClient(canvas, worldX, worldY, worldToBacking) {
  const g = getCanvasGeometry(canvas);
  return {
    x: g.originX + ((worldX * worldToBacking) / canvas.width) * g.dispW,
    y: g.originY + ((worldY * worldToBacking) / canvas.height) * g.dispH,
  };
}
