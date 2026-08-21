// 이 파일 역할: 가장 낮은 층의 그리기 도구(색 읽기, 둥근 사각형, 글씨, 막대). hud/screens/render가 공통으로 쓴다.

export const FONT = `system-ui, -apple-system, 'Apple SD Gothic Neo', sans-serif`;

// CSS 변수는 실행 중에 바뀌지 않으므로 한 번 읽고 캐시한다
// (매 프레임 getComputedStyle을 부르면 불필요하게 느려진다).
const colorCache = new Map();

/** style.css의 --color-* 변수 값을 읽는다. JS에는 색을 직접 쓰지 않는다. */
export function cssColor(varName) {
  let value = colorCache.get(varName);
  if (value === undefined) {
    value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    colorCache.set(varName, value);
  }
  return value;
}

export function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function text(
  ctx,
  str,
  x,
  y,
  { size = 14, color = '--color-text', align = 'left', baseline = 'alphabetic', weight = '400' } = {},
) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = cssColor(color);
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(str, x, y);
}

export function bar(ctx, x, y, w, h, ratio, fillVar, bgVar) {
  ctx.fillStyle = cssColor(bgVar);
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();

  // 채움 폭은 비율 그대로 — 최소 폭을 두면 0%인데도 막대가 보여서 오해를 부른다.
  // (roundRect가 반지름을 폭에 맞춰 줄이므로 아주 얇아도 모양이 깨지지 않는다)
  const fillW = w * Math.max(0, Math.min(1, ratio));
  if (fillW >= 1) {
    ctx.fillStyle = cssColor(fillVar);
    roundRect(ctx, x, y, fillW, h, h / 2);
    ctx.fill();
  }
}

export function pointInRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}
