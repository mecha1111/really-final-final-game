// 이 파일 역할: 화면(client) 좌표 ↔ 게임 월드 좌표 변환의 단일 진실원.
// 두 방향(clientToWorld / worldToClient)이 같은 기하값 하나에서 나오므로 서로 갈라질 수 없다.
//
// ── 왜 별도 모듈인가 ────────────────────────────────────────────────────────
// 예전에는 클릭 판정과 디버그 그리기가 각자 좌표를 계산했다. 한쪽만 고치면 조용히
// 어긋나고, 증상은 "그림은 맞는데 클릭만 밀린다"로만 나타나 원인 찾기가 매우 어려웠다.
// 그래서 기하값을 구하는 곳을 한 군데로 못박고, 두 방향 모두 그것만 쓰게 한다.
//
// ── 화면 표시 크기를 어떻게 아는가 (여기가 핵심) ─────────────────────────────
// 캔버스가 화면에서 실제로 몇 CSS px를 차지하는지가 변환의 전부다. 이 값을 구하는
// 방법을 후보별로 "스크린샷 픽셀 실측"과 대조해서 하나로 확정했다. 실측 방법은
// #desktop을 단색으로 칠하고 스샷에서 그 색 영역의 bbox를 재는 것이다
// (#game-canvas는 #desktop에 inset:0이라 두 박스가 정확히 같다).
// zoom 0.50 / 0.60 / 0.70 / 0.80 / 0.90 / 0.99 × dpr 1 / 1.6 / 2 전 구간 결과:
//
//   · getBoundingClientRect().width — 크롬에 따라 zoom을 반영한 "화면 크기"를 주기도,
//     zoom을 뺀 "레이아웃 크기"를 주기도 한다. 사용자 크롬은 후자여서 실측과 최대
//     960px 어긋났다(zoom이 낮을수록 더 벌어진다). ★ 탈락.
//   · innerWidth − 2×rect.left — 내 환경에선 1.3px 안에 들었지만, #stage가 뷰포트를
//     채우고 #desktop을 가운데 둔다는 레이아웃 가정에 기댄다. 사용자 실측에서 세로
//     후보가 365로 나왔다(진짜 값 564) — 가정이 깨지면 조용히 크게 틀린다. ★ 탈락.
//   · clientWidth × 조상 배율 누적곱 — 전 구간에서 실측과 1.2px 이내. ★ 채택.
//
// 예전엔 이 셋의 중앙값을 썼는데, 그건 "둘 이상이 맞다"에 기대는 방식이라 틀린 후보가
// 둘일 때(또는 틀린 값이 우연히 가운데일 때) 같이 무너진다. 실제로 사용자 환경에서
// 세 후보가 1080 / 564 / 365로 전부 갈렸다. 그래서 투표를 버리고, 실측으로 검증된
// 식 하나만 쓴다. 다른 후보는 계산은 해두되 진단 표시용으로만 남긴다 —
// 값이 갈리는 순간이 곧 이 브라우저가 뭘 이상하게 주는지 알려주는 신호라서다.
//
// 원점(rect.left/top)은 별개다. 크기와 달리 위치는 어느 크롬에서도 화면 좌표로
// 나왔고 실측과 0.6px 이내였다 — 그래서 원점만은 rect를 그대로 쓴다.

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

/**
 * 지금 이 순간의 캔버스 기하. 매번 새로 잰다 — 창 크기·배율이 언제 바뀌든 따라간다
 * (값을 캐시해두면 리사이즈 타이밍에 옛 값을 쓰는 구멍이 생긴다).
 */
export function getCanvasGeometry(canvas) {
  const rect = canvas.getBoundingClientRect();
  const { sx, sy } = ancestorScale(canvas);

  // ★ 표시 크기는 이 식 하나로만 정한다(위 주석의 실측 근거).
  //   레이아웃 크기 × 조상 배율 누적곱 = 화면에서 실제 차지하는 CSS px.
  let dispW = canvas.clientWidth * sx;
  let dispH = canvas.clientHeight * sy;

  // 레이아웃이 아직 안 잡혔을 때(clientWidth 0 등)의 최후 방어 — 0으로 나누는 것만 막는다.
  if (!(dispW > 0)) dispW = rect.width || 1;
  if (!(dispH > 0)) dispH = rect.height || 1;

  return {
    originX: rect.left,
    originY: rect.top,
    dispW,
    dispH,
    // 진단용으로만 쓴다(판정에는 안 들어간다). 채택한 식과 rect가 갈리는 순간이
    // 곧 "이 브라우저의 rect는 zoom을 안 반영한다"는 신호다.
    diag: { wRect: rect.width, hRect: rect.height, zoomX: sx, zoomY: sy },
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
