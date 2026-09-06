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

/**
 * 조상 체인의 zoom·transform 배율을 모두 곱한다(레이아웃 크기 → 화면 크기).
 *
 * ★ 배율을 행렬에서 뽑을 때 |a|/|d|가 아니라 열 노름(hypot)을 쓴다. 회전이 섞이면
 *   a/d에는 cos이, b/c에는 sin이 들어가므로 |a|만 보면 배율이 아니라 "배율 × cos"을
 *   보게 된다 — 45°면 0.707배, 89°면 0.017배로 좌표가 통째로 무너진다(실측 확인).
 *   열 노름 hypot(a,b) / hypot(c,d)는 회전각과 무관하게 순수 배율만 준다.
 *   ★ 회전이 없을 때는 b=c=0이라 hypot(a,0)=|a|로 예전 식과 완전히 같다 —
 *     평소(회전 없는 100%의 시간) 동작이 한 톨도 안 바뀐다는 뜻이다(실측 대조 완료).
 *   덤으로 예전 `if (m.a)` 가드의 지뢰도 사라진다: 정확히 90°면 크롬이 a를 0으로
 *   직렬화해 우연히 건너뛰어졌지만, 그 사이 각도에서는 truthy라 그대로 곱해졌다.
 */
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
        const kx = Math.hypot(m.a, m.b);
        const ky = Math.hypot(m.c, m.d);
        if (kx > 0) sx *= kx;
        if (ky > 0) sy *= ky;
      } catch {
        /* 파싱 실패는 배율 1로 둔다 */
      }
    }
  }
  return { sx, sy };
}

// ───────────────────────────────────────────────────────────────────────────
// 화면 회전(환경 방해 "모니터 세로모드", ui/hazards/portrait.js)
//
// ★ 회전 보정은 이 파일 하나에만 있다. 다른 곳(systems/input.js, ui/*)에 회전
//   보정 코드를 흩뿌리지 않는다 — clientToWorld / worldToClient가 이미 모든 좌표
//   변환의 단일 통로라, 여기만 고치면 방해꾼 클릭·popup X버튼·state.pointer·
//   화면깨짐 드래그·H키 오버레이·statusWindow가 전부 자동으로 따라온다.
//
// ★ 회전 자체는 #stage에 건다(#desktop이 아니다). ui/canvasFit.js가 리사이즈마다
//   desktop.style.transform을 통째로 다시 쓰기 때문에, 거기 얹으면 방해 도중
//   창 크기만 바뀌어도 회전이 지워진다. 소유권을 갈라둔다:
//     #desktop = 화면 맞춤 배율(canvasFit) / #stage = 회전(hazard).
//
// ★ HTML 오버레이(설정창·갤러리·hazard 창 버튼)는 여기와 무관하다 — 진짜 DOM
//   요소라 브라우저가 회전을 포함한 역변환을 직접 해준다. 손댈 게 없다.
// ───────────────────────────────────────────────────────────────────────────

/** 지금 화면 회전각(라디안, CSS 기준 시계방향). 0이면 회전 없음(평소). */
let rotationRad = 0;

/**
 * 화면 회전각을 설정한다(도 단위). ui/hazards/portrait.js가 켜고 끈다.
 * ★ 여기서 CSS를 건드리지 않는다 — 이 값은 "판정이 알아야 하는 각도"일 뿐이고,
 *   실제로 화면을 돌리는 건 그쪽 hazard의 CSS 클래스다. 둘을 한 함수에 묶으면
 *   "화면은 돌았는데 판정은 안 돌았다"(또는 그 반대)가 조용히 생길 수 있어서,
 *   hazard가 두 줄을 나란히 부르게 두고 여기서는 각도만 기억한다.
 */
export function setScreenRotation(deg) {
  rotationRad = (deg * Math.PI) / 180;
}

/** 지금 회전 중인가(판정을 쓰는 쪽이 알아야 할 때만). */
export function isScreenRotated() {
  return rotationRad !== 0;
}

/** 뷰포트 중심 — 회전의 기준점(#stage가 뷰포트를 꽉 채우고 transform-origin이 center). */
function viewportCenter() {
  return { cx: window.innerWidth / 2, cy: window.innerHeight / 2 };
}

/** 점을 뷰포트 중심 기준으로 rad만큼 돌린다(CSS와 같은 시계방향, y축 아래). */
function rotatePoint(x, y, rad) {
  if (rad === 0) return { x, y };
  const { cx, cy } = viewportCenter();
  const dx = x - cx;
  const dy = y - cy;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
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
  //   ★ 회전과 무관하다 — clientWidth는 레이아웃 값이라 transform의 영향을 안 받고,
  //     조상 배율도 위에서 열 노름으로 뽑아 회전 성분이 빠져 있다(실측 확인:
  //     90° 회전 중에도 1920 × 0.75 = 1440 그대로).
  let dispW = canvas.clientWidth * sx;
  let dispH = canvas.clientHeight * sy;

  // 레이아웃이 아직 안 잡혔을 때(clientWidth 0 등)의 최후 방어 — 0으로 나누는 것만 막는다.
  if (!(dispW > 0)) dispW = rect.width || 1;
  if (!(dispH > 0)) dispH = rect.height || 1;

  // ── 원점 ─────────────────────────────────────────────────────────────────
  // 평소(회전 없음)엔 rect.left/top을 그대로 쓴다(위 주석의 실측 근거 그대로).
  //
  // ★ 회전 중에는 rect가 "회전된 캔버스의 축정렬 bbox"라 그 좌상단이 캔버스의
  //   좌상단이 아니다(90°면 폭/높이가 스왑되고, 중간각이면 bbox가 부풀기까지 한다).
  //   그래서 모서리를 직접 쓰지 않고 **bbox 중심**만 쓴다 — 회전은 사각형의 중심을
  //   그대로 옮기고, 회전된 사각형의 bbox도 같은 중심을 갖기 때문에(어느 각도에서나
  //   성립) 중심 하나만 역회전하면 회전 전 중심이 정확히 나온다. 거기서 표시 크기의
  //   절반을 빼면 회전 전 좌상단이다. 모서리 대응 규칙(90°면 좌상단이 우상단으로…)을
  //   각도별로 따질 필요가 없어 실수할 자리가 없다.
  let originX = rect.left;
  let originY = rect.top;
  if (rotationRad !== 0) {
    const c = rotatePoint(rect.left + rect.width / 2, rect.top + rect.height / 2, -rotationRad);
    originX = c.x - dispW / 2;
    originY = c.y - dispH / 2;
  }

  return {
    originX,
    originY,
    dispW,
    dispH,
    // 진단용으로만 쓴다(판정에는 안 들어간다). 채택한 식과 rect가 갈리는 순간이
    // 곧 "이 브라우저의 rect는 zoom을 안 반영한다"는 신호다.
    diag: { wRect: rect.width, hRect: rect.height, zoomX: sx, zoomY: sy, rotationRad },
  };
}

/**
 * 화면(client) → 월드. 판정에 쓰는 값.
 * worldToBacking은 ui/render.js가 이번 프레임에 컨텍스트에 실제로 건 배율이다
 * (캔버스 엘리먼트에 적어둔다 — 모듈이 몇 벌 로드되든 같은 값이 보장된다).
 */
export function clientToWorld(canvas, clientX, clientY, worldToBacking) {
  const g = getCanvasGeometry(canvas);
  // ★ 회전 중이면 먼저 화면 좌표를 "회전 전 좌표"로 되돌리고, 그다음은 예전과
  //   똑같은 식을 그대로 탄다(g.originX/Y도 회전 전 값이라 짝이 맞는다).
  //   회전이 없으면 rotatePoint가 입력을 그대로 돌려주므로 예전 경로와 동일하다.
  const p = rotatePoint(clientX, clientY, -rotationRad);
  return {
    x: ((p.x - g.originX) * (canvas.width / g.dispW)) / worldToBacking,
    y: ((p.y - g.originY) * (canvas.height / g.dispH)) / worldToBacking,
  };
}

/**
 * 월드 → 화면(client). clientToWorld의 정확한 역함수 — 같은 기하값에서 나오므로
 * 둘이 갈라질 수 없다. 그리기 자체는 브라우저가 백킹스토어를 화면에 얹어서 하지만,
 * "게임이 생각하는 화면 위치"를 확인해야 할 때(자기검사·디버그) 이걸 쓴다.
 */
export function worldToClient(canvas, worldX, worldY, worldToBacking) {
  const g = getCanvasGeometry(canvas);
  // 회전 전 화면 좌표를 먼저 구하고(예전 식 그대로), 마지막에 정회전을 얹는다 —
  // clientToWorld의 정확한 역순이라 둘이 갈라질 수 없다.
  const x = g.originX + ((worldX * worldToBacking) / canvas.width) * g.dispW;
  const y = g.originY + ((worldY * worldToBacking) / canvas.height) * g.dispH;
  return rotatePoint(x, y, rotationRad);
}
