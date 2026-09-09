// 이 파일 역할: 인게임 튜토리얼의 스포트라이트 — "지금 이걸 보라"고 화면 하나를 지목한다.
//   무엇을 언제 지목할지는 여기가 안 정한다(그건 ui/tutorial.js의 대본이다).
//   여기는 "주어진 자리에 구멍을 낸다"만 한다.
//
// ── 구멍을 어떻게 뚫나 ──────────────────────────────────────────────────────
// filter / backdrop-filter / mask는 전부 금지다(docs/xp-design-system.html 맨 위
// 규칙 — 움직이는 내용 위 전체화면 filter는 매 프레임 재합성을 부른다). 그래서
// "어둠을 깔고 구멍만 지우는" 흔한 방법을 못 쓴다.
// 대신 뒤집는다: 빈 요소 하나에 box-shadow 확산을 화면보다 크게(9999px) 걸면
// 그 요소 ★바깥 전부가 어두워지고 요소 자신만 그대로 비친다. 그게 구멍이다.
// 실제 CSS는 style.css의 .op-spot에 있다.
//
// ── ★좌표 (이 프로젝트가 반복해서 틀린 지점) ────────────────────────────────
// #desktop은 1920x1080 고정 좌표계를 transform:scale로 줄여서 보여준다
// (ui/canvasFit.js). getBoundingClientRect()는 ★줄어든 값을 준다 — 그대로 쓰면
// 구멍이 배율만큼 작게, 왼쪽 위로 밀려 그려진다.
//
// 두 갈래로 푼다:
//   · HTML 대상 — rect ÷ 무대 배율. 배율은 (표시 폭 / 레이아웃 폭)으로 잰다.
//     ★offsetLeft 사슬로 가면 틀린다. "offset은 이미 #desktop 좌표계라 배율이
//       개입 안 한다"는 맞지만, ★대상 자신의 transform을 못 본다 — 이 게임은
//       가운데 정렬을 translate(-50%)로 하는 요소가 많다(정본 문서
//       docs/xp-tutorial.html에서 실측으로 215px/130px 어긋난 걸 확인하고
//       이 방식으로 바꿨다). rect는 transform까지 반영한 최종 위치라 안전하다.
//     ★이 나눗셈이 성립하는 전제는 #desktop이 CSS zoom이 아니라 transform:scale인
//       것이다. zoom이던 시절엔 일부 크롬이 rect에 배율을 아예 반영조차 안 했다.
//   · 캔버스 대상(방해꾼) — 논리좌표 × (1920 / config.canvas.width).
//     이건 getUiScaleFactor()의 역수다. 두 값이 다 알려져 있어 rect를 잴 이유가 없다.
//
// ★단위는 전부 px 고정이다. vh 금지 — #desktop은 뷰포트가 아니라 자기 고정
//   좌표계를 산다(창을 줄이면 배율만 바뀌고 좌표계는 그대로다).

import { config, getUiScaleFactor } from '../config.js';

let layerEl = null;
let holeEl = null;
let desktopEl = null;

/** 최초 1회(main.js). DOM만 잡아둔다. */
export function initTutorialSpotlight() {
  layerEl = document.getElementById('op-spot');
  holeEl = document.getElementById('op-spot-hole');
  desktopEl = document.getElementById('desktop');
}

/**
 * #desktop의 현재 배율(표시 폭 / 레이아웃 폭). rect를 환산할 때만 쓴다.
 * 창 크기가 바뀌면 값도 바뀌므로 ★캐시하지 않는다 — 지목할 때마다 다시 잰다.
 */
function desktopScale() {
  const w = desktopEl?.offsetWidth ?? 0;
  return w ? desktopEl.getBoundingClientRect().width / w : 1;
}

/**
 * 구멍을 #desktop 고정 좌표계 (x, y, w, h)에 둔다.
 * @param {number} pad 사방으로 넓힐 여백(px). 생략하면 config.tutorial.spotPadPx.
 * @param {boolean} snap ★true면 전환 없이 즉시 옮긴다.
 *   구멍은 기본적으로 0.26초에 걸쳐 스르륵 옮겨간다 — 대상이 바뀔 때 순간이동하면
 *   "옮겨갔다"가 아니라 "다른 게 떴다"로 읽혀 시선이 안 따라오기 때문이다.
 *   그런데 ★매 프레임 따라다녀야 하는 대상(돌아다니는 방해꾼, 등장 연출 중인 놈)에는
 *   그 전환이 정확히 반대로 작용한다: 목표가 매 프레임 바뀌니 구멍이 영원히 뒤처져
 *   따라간다(실측 — ransom의 slam 등장 중 구멍이 스프라이트 한참 위에 남아 있었다).
 *   그래서 "고정된 것으로 옮겨갈 때"만 전환을 쓰고, "따라다닐 때"는 끈다.
 */
export function spotToRect(x, y, w, h, pad, snap) {
  if (!holeEl) return;
  const p = pad ?? config.tutorial.spotPadPx;
  holeEl.classList.toggle('snap', !!snap);

  // ★무대 밖으로 삐져나가지 않게 자른다. 화면 가장자리에 붙는 대상(모서리에
  //   고정되는 bait가 그렇다 — 실측에서 구멍이 위로 44px 넘어갔다)은 그냥 두면
  //   넘어간 쪽 테두리가 안 보여서 구멍이 "잘린 것"처럼 읽힌다. 무대 밖에는
  //   어차피 아무것도 없으므로 잘라내도 잃는 게 없다.
  const maxW = desktopEl?.offsetWidth ?? 1920;
  const maxH = desktopEl?.offsetHeight ?? 1080;
  const x0 = Math.max(0, x - p);
  const y0 = Math.max(0, y - p);
  const x1 = Math.min(maxW, x + w + p);
  const y1 = Math.min(maxH, y + h + p);

  holeEl.style.left = `${Math.round(x0)}px`;
  holeEl.style.top = `${Math.round(y0)}px`;
  holeEl.style.width = `${Math.round(Math.max(0, x1 - x0))}px`;
  holeEl.style.height = `${Math.round(Math.max(0, y1 - y0))}px`;
  layerEl.classList.add('on'); // ★.on 토글 — hidden 속성은 안 쓴다(display에 특이도로 밀린다)
}

/**
 * HTML 엘리먼트 하나를 지목한다. 여러 개를 주면 ★전부를 감싸는 사각형 하나를 판다
 * (구멍을 두 개 뚫으면 두 box-shadow가 서로의 어둠을 덮어 둘 다 반쯤 밝아진다 —
 *  9999px 확산이 겹치기 때문이다. 그래서 구멍은 언제나 하나다).
 * @param {(Element|null)[]} els
 */
export function spotToElements(els, pad) {
  const list = els.filter(Boolean);
  if (list.length === 0 || !desktopEl) return;

  const s = desktopScale();
  const base = desktopEl.getBoundingClientRect();
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;

  for (const el of list) {
    const r = el.getBoundingClientRect();
    x0 = Math.min(x0, (r.left - base.left) / s);
    y0 = Math.min(y0, (r.top - base.top) / s);
    x1 = Math.max(x1, (r.right - base.left) / s);
    y1 = Math.max(y1, (r.bottom - base.top) / s);
  }
  spotToRect(x0, y0, x1 - x0, y1 - y0, pad);
}

/** id로 지목하는 짧은 길 — 대본이 읽기 좋으라고 둔다. */
export function spotToIds(ids, pad) {
  spotToElements(ids.map((id) => document.getElementById(id)), pad);
}

/**
 * 캔버스 위의 방해꾼을 지목한다. 인자는 ★캔버스 논리좌표(enemy.x/y/w/h 그대로)다.
 * 매 프레임 다시 불러도 싸다 — 움직이는 놈을 따라가야 하므로 실제로 그렇게 쓴다.
 */
export function spotToWorld(cx, cy, w, h, pad, snap) {
  // 논리 → #desktop(1920) 환산. getUiScaleFactor()가 그 반대 방향이라 역수를 쓴다.
  const k = 1 / getUiScaleFactor();
  spotToRect(cx * k - (w * k) / 2, cy * k - (h * k) / 2, w * k, h * k, pad, snap);
}

/** 구멍을 끈다(어둠도 함께 사라진다). */
export function spotOff() {
  layerEl?.classList.remove('on');
}
