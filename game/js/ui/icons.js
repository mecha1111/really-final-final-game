// 이 파일 역할: 이 게임의 유일한 아이콘 카탈로그. 이모지 리터럴이 index.html·
// ui/desktop.js·ui/hazards/*.js 세 곳에 흩어져 있던 것을 여기 name→SVG 문자열
// 맵 하나로 모은다. 갤러리·도감·튜토리얼처럼 앞으로 계속 늘어날 새 창들이 전부
// 이 한 곳만 보고 아이콘을 가져다 쓰게 하려는 것 — 새 아이콘이 필요해지면
// 아래 ICONS에 항목 하나만 추가하면 된다(호출부 코드는 바뀔 게 없다).
//
// ★ fill/stroke는 전부 currentColor 기준이다. 색을 여기서 박지 않고 부모의 CSS
//   color를 그대로 물려받는다 — 나중에 구간별 테마로 색을 바꿀 때 아이콘이
//   자동으로 따라간다(지금 각 사용처가 이미 .h/.ico/.cleared-dlg-icon 등에서
//   color를 정하고 있으므로, 그 값을 그대로 넘겨받기만 하면 된다).
//
// ★ SVG 필터·blur는 쓰지 않는다 — 인수인계서에 SVG 필터가 성능 랙의 주범이라
//   전부 제거된 이력이 있다(이 프로젝트의 다른 연출도 필터 대신 캔버스 2D
//   픽셀 마스크를 쓴다, ui/baitRender.js 참고). 그래서 여기 도형은 <path>/
//   <rect>/<circle>/<ellipse>만 쓰고, <filter>/<feGaussianBlur> 등은 절대
//   안 쓴다. 그라데이션이 필요해 보이는 입체감(기어 톱니 등)도 전부 단색
//   선/면의 배치만으로 표현한다.
//
// ★ 정적 마크업(index.html)에는 이 SVG 문자열을 직접 박아넣지 않는다. 대신
//   <span class="xicon" data-icon="이름"></span> 자리표시자만 두고, 부팅 시
//   applyIcons()가 그 자리에 실제 SVG를 채운다 — 아이콘 도형이 나중에 바뀌어도
//   index.html을 또 고칠 필요가 없게 하려는 것(모양의 진실은 이 파일 하나뿐).
//   반대로 JS가 그 자리에서 직접 DOM/템플릿 문자열을 만드는 곳(예: 개그 팝업)은
//   icon()을 그 자리에서 바로 호출한다 — 둘 다 결국 이 파일의 ICONS를 거친다.

const VIEWBOX = '0 0 24 24';

// 이름 → <svg> 안에 들어갈 내용물(<path>/<rect>/<circle>/<ellipse>만). 24×24
// 기준 선 굵기 2의 라인 아이콘 톤으로 통일했다 — 이모지처럼 알록달록하지 않고
// XP 시스템 아이콘(수수한 단색 픽토그램)에 더 가깝다.
const ICONS = {
  // === 시스템 ===
  // 시작 메뉴 깃발 — Windows 시작 버튼의 네 조각 사각형을 그대로 딴 것(이모지
  // 🪟 대신). 다른 아이콘과 달리 선이 아니라 면(fill)이다 — 원본이 그렇다.
  xp_flag: `
    <rect x="3" y="3" width="8" height="8" rx="1" fill="currentColor" stroke="none"/>
    <rect x="13" y="3" width="8" height="8" rx="1" fill="currentColor" stroke="none"/>
    <rect x="3" y="13" width="8" height="8" rx="1" fill="currentColor" stroke="none"/>
    <rect x="13" y="13" width="8" height="8" rx="1" fill="currentColor" stroke="none"/>
  `,
  shield: `<path d="M12 3 L19 6 V11 C19 15.5 16 19 12 21 C8 19 5 15.5 5 11 V6 Z"/>`,
  warning: `
    <path d="M12 3 L22 20 H2 Z"/>
    <path d="M12 9.5 V14"/>
    <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none"/>
  `,
  error: `
    <circle cx="12" cy="12" r="9"/>
    <path d="M9 9 L15 15 M15 9 L9 15"/>
  `,
  check: `<path d="M4 12.5 L9.5 18 L20 6"/>`,
  // 톱니바퀴 — 가운데 원 + 8방향 사각 이빨. transform은 순수 배치용(필터 아님).
  gear: `
    <circle cx="12" cy="12" r="3.4"/>
    <rect x="10.8" y="1.5" width="2.4" height="3.4" rx="0.6" fill="currentColor" stroke="none"/>
    <rect x="10.8" y="19.1" width="2.4" height="3.4" rx="0.6" fill="currentColor" stroke="none"/>
    <rect x="10.8" y="1.5" width="2.4" height="3.4" rx="0.6" fill="currentColor" stroke="none" transform="rotate(45 12 12)"/>
    <rect x="10.8" y="19.1" width="2.4" height="3.4" rx="0.6" fill="currentColor" stroke="none" transform="rotate(45 12 12)"/>
    <rect x="10.8" y="1.5" width="2.4" height="3.4" rx="0.6" fill="currentColor" stroke="none" transform="rotate(90 12 12)"/>
    <rect x="10.8" y="19.1" width="2.4" height="3.4" rx="0.6" fill="currentColor" stroke="none" transform="rotate(90 12 12)"/>
    <rect x="10.8" y="1.5" width="2.4" height="3.4" rx="0.6" fill="currentColor" stroke="none" transform="rotate(135 12 12)"/>
    <rect x="10.8" y="19.1" width="2.4" height="3.4" rx="0.6" fill="currentColor" stroke="none" transform="rotate(135 12 12)"/>
  `,
  monitor: `
    <rect x="3" y="4" width="18" height="12" rx="1"/>
    <path d="M8.5 20 H15.5 M12 16 V20"/>
  `,
  power: `
    <path d="M12 3 V11"/>
    <path d="M7 6.2 A8 8 0 1 0 17 6.2"/>
  `,
  plug: `
    <path d="M9 2.5 V8 M15 2.5 V8"/>
    <rect x="7" y="8" width="10" height="6" rx="1.4"/>
    <path d="M12 14 V18.5"/>
    <path d="M8 18.5 H16"/>
  `,

  // === 창/파일 ===
  folder: `<path d="M3 7 H10 L12 9 H21 V18 H3 Z"/>`,
  file: `
    <path d="M6 3 H14 L18 7 V21 H6 Z"/>
    <path d="M14 3 V7 H18"/>
  `,
  image: `
    <rect x="3" y="4" width="18" height="16" rx="1"/>
    <circle cx="8.5" cy="9.5" r="1.6" fill="currentColor" stroke="none"/>
    <path d="M21 16 L15 10 L5 20"/>
  `,
  recycle: `
    <path d="M4 7 H20"/>
    <path d="M9 7 V4 H15 V7"/>
    <path d="M6 7 L7 21 H17 L18 7"/>
    <path d="M10 11 V17 M14 11 V17"/>
  `,
  save: `
    <path d="M4 4 H17 L20 7 V20 H4 Z"/>
    <rect x="7.5" y="4" width="7" height="5"/>
    <rect x="7" y="13.5" width="10" height="6.5"/>
  `,
  // 인트로 바탕화면의 가짜 파일용(ui/intro.js). 참조 문서
  // docs/xp-design-system.html에도 psd/zip이 있지만 그쪽은 16×16 다색 채움이라
  // 그대로는 못 가져온다 — 이 카탈로그는 24×24 + currentColor 단색이 계약이고
  // (아래 wrap()이 viewBox를 못박는다), 다색 하나만 섞이면 화면에서 그것만 튄다.
  // 그래서 "같은 모티프를 이 집 화법으로" 다시 그렸다: 문서 아이콘 위의 Ps 상자,
  // 지퍼 달린 상자.
  psd: `
    <path d="M6 3 H14 L18 7 V21 H6 Z"/>
    <path d="M14 3 V7 H18"/>
    <rect x="8.4" y="10.8" width="7.2" height="7.2" rx="0.8"/>
    <path d="M10.6 16.4 V12.4 H12.3 A1.6 1.6 0 0 1 12.3 15.6 H10.6"/>
  `,
  zip: `
    <rect x="4.5" y="2.5" width="15" height="19" rx="1.5"/>
    <path d="M11 2.5 V9.5 M13 2.5 V9.5"/>
    <rect x="10.1" y="11" width="3.8" height="5.4" rx="1.2"/>
  `,
  game: `
    <rect x="2.5" y="8" width="19" height="9.5" rx="4"/>
    <path d="M7.5 10.8 V15 M5.4 12.9 H9.6"/>
    <circle cx="15.5" cy="11.6" r="0.9" fill="currentColor" stroke="none"/>
    <circle cx="17.8" cy="14" r="0.9" fill="currentColor" stroke="none"/>
  `,

  // === UI ===
  close: `<path d="M5 5 L19 19 M19 5 L5 19"/>`,
  // XP "검색 도우미" 사이드바 머리말 아이콘(ui/rover.js) — 돋보기.
  search: `
    <circle cx="10.5" cy="10.5" r="6.5"/>
    <path d="M15.3 15.3 L21 21"/>
  `,
  lock: `
    <rect x="5" y="11" width="14" height="10" rx="2"/>
    <path d="M8 11 V7.5 A4 4 0 0 1 16 7.5 V11"/>
  `,
  question: `
    <circle cx="12" cy="12" r="9"/>
    <path d="M9.2 9.5 A3 3 0 1 1 12.5 13 V14.8"/>
    <circle cx="12.3" cy="17.6" r="0.9" fill="currentColor" stroke="none"/>
  `,
  star: `<path d="M12 3 L14.6 9.1 L21.2 9.6 L16.2 13.9 L17.7 20.3 L12 16.8 L6.3 20.3 L7.8 13.9 L2.8 9.6 L9.4 9.1 Z"/>`,
  // 인트로 도우미 말풍선의 "팁 있음" 표시(ui/intro.js) — 캐릭터 위에서 깜빡이는
  // 노란 전구. 참조 문서(.xp-assist .bulb)와 같은 모티프지만 여기 규격(24×24,
  // currentColor 단색)으로 다시 그렸다 — 색은 쓰는 쪽 CSS가 정한다.
  bulb: `
    <path d="M12 2.8 A6.4 6.4 0 0 0 8.4 14.6 V17 H15.6 V14.6 A6.4 6.4 0 0 0 12 2.8 Z"/>
    <path d="M9.4 19.6 H14.6 M10.4 22 H13.6"/>
  `,
  coin: `
    <circle cx="12" cy="12" r="9"/>
    <circle cx="12" cy="12" r="5.4"/>
    <path d="M12 9 V15 M10 10.4 H14 M10 13.6 H14"/>
  `,
  sound: `
    <path d="M4 9 H7.5 L13 5 V19 L7.5 15 H4 Z"/>
    <path d="M16 9 A5 5 0 0 1 16 15"/>
    <path d="M18.6 6.3 A9 9 0 0 1 18.6 17.7"/>
  `,

  // === 방해꾼(도감용 총칭) ===
  bug: `
    <ellipse cx="12" cy="14" rx="4.2" ry="6"/>
    <circle cx="12" cy="6.5" r="2.1"/>
    <path d="M10.2 5 L8.5 3 M13.8 5 L15.5 3"/>
    <path d="M8.2 10.5 L4 9 M8.2 14 L3.5 14 M8.2 17.5 L4 19"/>
    <path d="M15.8 10.5 L20 9 M15.8 14 L20.5 14 M15.8 17.5 L20 19"/>
  `,
};

// 모르는 이름이 들어왔을 때(오타·아직 안 만든 아이콘)를 위한 자리표시 도형 —
// 점선 상자 + 물음표. 화면에서 "뭔가 빠졌다"는 게 바로 보여야 조용히 넘어가지
// 않고 바로 고치게 된다(빈 문자열을 돌려주면 그냥 안 보이기만 해서 놓치기 쉽다).
const FALLBACK_ICON = `
  <rect x="2.5" y="2.5" width="19" height="19" rx="2" stroke-dasharray="3 2.5"/>
  <path d="M9.2 9.5 A3 3 0 1 1 12.5 13 V14.8"/>
  <circle cx="12.3" cy="17.6" r="0.9" fill="currentColor" stroke="none"/>
`;

/**
 * 아이콘 하나를 SVG 문자열로 돌려준다.
 * @param {string} name ICONS에 등록된 이름
 * @param {number} [size=16] 기본 가로/세로(px). class="xicon"가 CSS로 1em을
 *   강제하므로(style.css), 부모의 font-size가 정해진 자리에서는 이 값이 실제로
 *   화면에 그려지는 크기를 좌우하지 않는다 — 대신 이 속성이 그 CSS보다 먼저
 *   적용돼야 하는 자리(별도 font-size 문맥이 없는 곳)를 위한 기본값이다.
 * @returns {string}
 */
export function icon(name, size = 16) {
  const inner = ICONS[name];
  if (inner === undefined) {
    console.warn(`[icons] 등록되지 않은 아이콘 이름: "${name}" — 자리표시 도형으로 대체한다.`);
    return wrap(FALLBACK_ICON, size);
  }
  return wrap(inner, size);
}

function wrap(inner, size) {
  return (
    `<svg class="xicon" width="${size}" height="${size}" viewBox="${VIEWBOX}" fill="none" ` +
    `stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ` +
    `aria-hidden="true" focusable="false">${inner}</svg>`
  );
}

/**
 * 정적 마크업(index.html)의 `<span class="xicon-slot" data-icon="이름" data-size="20">`
 * 자리표시자를 전부 찾아 실제 아이콘으로 채운다. main.js가 부팅 시 1회만 부른다.
 *
 * ★ index.html에 SVG를 직접 박지 않고 이 방식을 택한 이유: 아이콘 모양의 "진실"이
 *   ICONS 한 곳에만 있어야, 나중에 도형을 다듬을 때 index.html까지 같이 고칠
 *   일이 없다. data-size가 없으면 함수 기본값(16)을 쓰지만, 실제 화면 크기는
 *   위 icon() 주석대로 대체로 CSS(.xicon{width:1em;height:1em})가 정한다.
 */
export function applyIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    const size = Number(el.dataset.size) || 16;
    el.innerHTML = icon(el.dataset.icon, size);
  });
}
