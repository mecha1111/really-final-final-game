// 이 파일 역할: 가장 낮은 층의 그리기 도구(색 읽기, 둥근 사각형, 글씨, 막대). hud/screens/render가 공통으로 쓴다.

export const FONT = `system-ui, -apple-system, 'Apple SD Gothic Neo', sans-serif`;
// 게임 픽셀폰트 — 밝은 XP 배경/화질복구 그림 위에서도 읽혀야 하는 캔버스 글씨
// (피격손실·콤보·처치MB 등, outlinedText 전용)는 이걸 쓴다. index.html이 이미
// @font-face로 실제 로드해두므로(DGM 실패 시 Galmuri11로 폴백) 여기서 또 로드할
// 필요는 없다 — #desktop의 CSS font-family와 같은 스택을 그대로 문자열로 옮겼을
// 뿐이다(HTML 쪽과 폰트가 갈리면 "왜 이 글씨만 다르지"가 생긴다).
export const PIXEL_FONT = `'DGM', 'Galmuri11', monospace`;

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

/**
 * DGM(픽셀폰트) + 외곽선(strokeText) 글씨. 밝은 XP 창·화질복구 그림처럼 배경이
 * 계속 바뀌는 곳 위에 얹히는 캔버스 텍스트(피격손실·콤보·처치MB)는 배경색과
 * 우연히 비슷해지면 안 보일 수 있어서, 항상 어두운 테두리를 먼저 깔고 그 위에
 * 채운다 — HTML 쪽(.file-complete-label 등)이 8방향 text-shadow로 흉내 내는
 * "가짜 외곽선"을, 캔버스에서는 진짜 strokeText로 훨씬 싸고 매끈하게 낸다.
 *
 * @param {string} color 채움색. '--'로 시작하면 cssColor()로 CSS 변수를 읽고,
 *   아니면 그대로 CSS 색 문자열로 쓴다(예: config.combo.tiers의 리터럴 hex).
 * @param {string} [lineJoin] 기본은 'round'(둥근 이음매, 콤보 카운터가 이 기본값을
 *   그대로 쓴다). ui/renderEnemies.js의 drawFloats만 'miter'를 넘겨 각진 얇은
 *   외곽선을 쓴다 — 손그림 낙서 톤엔 두꺼운 둥근 테두리가 "말랑"해 보였다.
 */
export function outlinedText(
  ctx,
  str,
  x,
  y,
  {
    size = 20,
    weight = '700',
    align = 'center',
    baseline = 'middle',
    color = '#fff',
    strokeColor = '#111',
    strokeWidth = 4,
    lineJoin = 'round',
    miterLimit = 2,
  } = {},
) {
  ctx.font = `${weight} ${size}px ${PIXEL_FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.lineJoin = lineJoin;
  ctx.miterLimit = miterLimit;
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = strokeColor;
  ctx.strokeText(str, x, y);
  ctx.fillStyle = color.startsWith('--') ? cssColor(color) : color;
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
