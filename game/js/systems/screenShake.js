// 이 파일 역할: 화면 흔들림을 한 군데로 모은다. 여러 곳(ransom 착지, 처치 타격감 등)이
// 동시에 흔들라고 해도 서로 덮어쓰지 않고 겹쳐서 합쳐진다.
//
// ★ DOM transform이 아니라 "캔버스 그리기 원점 오프셋"으로만 흔든다.
//   <canvas>의 조상에 3단계 이상의 transform 애니를 걸면 크롬이 canvas의
//   getBoundingClientRect()를 영구히 망가뜨리는 실측 버그가 있다(ui/crtTransition.js
//   상단의 긴 주석 참고 — 그것 때문에 CRT 흔들림도 같은 방식으로 옮겼다).
//   여기도 같은 원칙을 따른다: DOM은 절대 안 건드리고 ui/render.js가 ctx.translate만 한다.
//
// ★ 시계는 performance.now() 하나만 쓴다. 흔들림을 "거는 쪽"은 update(dt) 안이라
//   rAF timestamp를 손에 안 들고 있고, "읽는 쪽"은 render(now) 안이라 들고 있다 —
//   서로 다른 시계를 섞으면 미세하게 어긋나므로, 이 모듈 안에서만 쓰는 시계를
//   하나 정해서 양쪽 다 그걸 쓴다(두 시계는 같은 기준점이라 값도 사실상 같다).

// 지금 진행 중인 흔들림들. 끝난 건 getShakeOffset이 훑을 때 걸러낸다.
let shakes = [];

/**
 * 흔들림 하나를 추가한다. 이미 흔들리는 중이면 겹쳐서 더 세게 흔들린다.
 * @param {number} ampPx  시작 진폭(px, 논리 좌표계). 지수 감쇠로 잦아든다.
 * @param {number} durMs  이 시간이 지나면 완전히 멈춘다.
 * @param {number} [freqHz] 초당 진동 수. 안 주면 기본값(짧고 날카로운 충격).
 */
export function addShake(ampPx, durMs, freqHz = 22) {
  if (!(ampPx > 0) || !(durMs > 0)) return;
  shakes.push({ start: performance.now(), dur: durMs, amp: ampPx, freq: freqHz });
  // 폭주 방지 — 같은 프레임에 수십 마리가 죽어도 흔들림 객체가 무한히 쌓이지 않게.
  // 오래된 것부터 버린다(어차피 감쇠해서 기여가 가장 작다).
  if (shakes.length > 12) shakes = shakes.slice(-12);
}

/** 진행 중인 흔들림을 전부 지운다(화면 전환·리셋처럼 흔들림이 남으면 안 되는 순간용). */
export function clearShake() {
  shakes = [];
}

/**
 * 지금 이 프레임에 그리기 원점을 얼마나 밀어야 하는지(논리 좌표계 px).
 * 진행 중인 게 없으면 {x:0,y:0} — 평소엔 완전히 무해하다.
 * 두 축에 다른 진동수를 줘서 대각선이 아니라 불규칙하게 흔들리게 한다.
 */
export function getShakeOffset() {
  if (shakes.length === 0) return { x: 0, y: 0 };

  const now = performance.now();
  let x = 0;
  let y = 0;
  let alive = false;

  for (const s of shakes) {
    const t = now - s.start;
    if (t < 0 || t >= s.dur) continue;
    alive = true;
    const decay = 1 - t / s.dur; // 선형 감쇠 — 끝나는 순간 정확히 0이 되어 튐이 없다
    const amp = s.amp * decay * decay; // 제곱해서 초반에 세고 뒤로 갈수록 빨리 잦아들게
    const w = (2 * Math.PI * s.freq * t) / 1000;
    x += amp * Math.sin(w);
    y += amp * Math.cos(w * 0.83); // 0.83배 → 두 축 주기가 안 맞아 원운동이 안 된다
  }

  // 다 끝났으면 배열을 비워서 다음 프레임부터는 위 early return으로 빠지게 한다.
  if (!alive) shakes = [];
  return { x, y };
}
