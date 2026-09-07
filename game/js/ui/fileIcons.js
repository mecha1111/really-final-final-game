// 이 파일 역할: 바탕화면 "파일" 아이콘 카탈로그. ★ui/icons.js와 계약이 다르다.
//
// ── 왜 파일을 나눴나 ────────────────────────────────────────────────────────
// ui/icons.js는 24×24 · currentColor 단색 · 평면이다. 톱니·소리·체크 같은 UI
// 크롬엔 정확히 맞는 계약이다(부모 color를 물려받아 테마를 따라간다).
// 그런데 바탕화면 파일 아이콘에 그 계약을 쓰면 폴더도 exe도 휴지통도 전부
// 같은 색 실루엣이 된다 — 실제로 그랬다. 실물 XP는 ★색이 곧 정보다:
// 폴더 노랑 / exe 파랑 / 휴지통 은색. 한 함수로 두 계약을 억지로 겸하면
// 어느 쪽이든 틀리므로, 아예 파일을 갈랐다.
//
//   ui/icons.js   UI 크롬 : 24×24 · currentColor 단색 · 평면 · 그라데이션 금지
//   ui/fileIcons.js 파일  : 48×48 · 고정 다색 · ★아이소메트릭 · 그라데이션 허용
//
// ★ 그라데이션을 여기서만 허용하는 근거: 이 프로젝트가 금지한 건 filter(랙의
//   주범, icons.js 상단 주석)이지 linearGradient가 아니다. 그라데이션은 합성
//   비용이 사실상 0이고, XP 입체감이 전적으로 여기서 나온다. 반대로 UI 크롬은
//   여전히 단색이다 — 거긴 색이 정보가 아니라 테마이기 때문.
//
// ★ 핵심은 색이 아니라 ★시점이다. 정면 평면으로 그리면 다색이어도 "현대 플랫
//   아이콘"으로 읽힌다. 그래서 전부 약간 위·왼쪽에서 본 3/4 시점 + 두께(옆면)
//   + 세로 그라데이션 음영 + 아래쪽 그림자로 그린다.
//   (근거·A/B 비교: docs/xp-icons-crack.html §1, §4)
//
// ★ 그림자는 filter: drop-shadow 금지 → 반투명 타원 도형(SHADOW)으로 흉내낸다.
//   icons.js가 필터를 금지한 이유가 여기서도 그대로 유효하다.
//
// ★ id 충돌 방지: 그라데이션은 <defs>의 id로 참조되는데, 같은 문서에 여러 개가
//   인라인되면 이름이 겹친다. 참조 문서(docs/xp-icons-crack.html)는 실제로 이
//   함정에 걸려 있다 — folder_open이 자기 defs엔 없는 gFolderBack(folder 쪽
//   id)을 참조해서, 바탕화면에 folder가 같이 있어야만 색이 나온다. 그래서 여기서는
//   도형을 `{{id}}` 토큰으로 쓰고 호출마다 고유 접두사로 치환한다 — 어떤 조합으로
//   몇 개를 깔든 서로를 침범할 수 없다.

const VIEWBOX = '0 0 48 48';

// 공통 그림자 — filter 대신 반투명 타원 하나.
const SHADOW = '<ellipse cx="25" cy="43" rx="17" ry="3" fill="rgba(0,0,0,.20)"/>';

/** 종이류(doc/psd/virus)의 공통 몸통 — ★옆면 두께가 보여야 "종이"로 읽힌다. */
function paper(inner) {
  return (
    SHADOW +
    '<path d="M12 6h18l9 9v27H12z" fill="#c8c4b4"/>' +
    '<path d="M10 4h18l9 9v27H10z" fill="url(#{{id}}paper)" stroke="#8b8778" stroke-width="1.2" stroke-linejoin="round"/>' +
    '<path d="M28 4v9h9z" fill="#dedac9" stroke="#8b8778" stroke-width="1.2" stroke-linejoin="round"/>' +
    inner +
    '<defs><linearGradient id="{{id}}paper" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e9e6da"/></linearGradient></defs>'
  );
}

/** XP 창류(exe/game)의 공통 몸통 — 두께 + 파란 타이틀바. */
function window_(inner) {
  return (
    SHADOW +
    '<path d="M9 12h34v26H9z" fill="#9aa4b0"/>' +
    '<rect x="6" y="9" width="36" height="27" rx="2.5" fill="#ECE9D8" stroke="#17427c" stroke-width="1.4"/>' +
    '<path d="M6 11.5A2.5 2.5 0 0 1 8.5 9h31A2.5 2.5 0 0 1 42 11.5V17H6z" fill="url(#{{id}}title)"/>' +
    '<rect x="8.4" y="11" width="3.6" height="3.6" rx=".8" fill="#fff" opacity=".85"/>' +
    inner +
    '<defs><linearGradient id="{{id}}title" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#5fa8f0"/><stop offset=".5" stop-color="#2b73d8"/><stop offset="1" stop-color="#1a5ac4"/>' +
    '</linearGradient></defs>'
  );
}

// 이름 → 48×48 SVG 내용물. `{{id}}`는 emit 시 호출별 고유 접두사로 바뀐다.
const FILE_ICONS = {
  // 폴더 — ★앞판이 기울어진 사다리꼴인 게 XP 폴더의 핵심이다(직사각형이면 9x).
  folder:
    SHADOW +
    '<path d="M4 13h14l4 4h23v22H4z" fill="url(#{{id}}back)" stroke="#8a6208" stroke-width="1.2" stroke-linejoin="round"/>' +
    '<path d="M9 21h39l-6 19H3z" fill="url(#{{id}}front)" stroke="#8a6208" stroke-width="1.2" stroke-linejoin="round"/>' +
    '<path d="M9.8 22.4h36.6l-.7 2.2H9.1z" fill="rgba(255,255,255,.45)"/>' +
    '<defs>' +
    '<linearGradient id="{{id}}back" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8c53f"/><stop offset="1" stop-color="#d99a10"/></linearGradient>' +
    '<linearGradient id="{{id}}front" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset=".55" stop-color="#fdc63f"/><stop offset="1" stop-color="#e0a014"/></linearGradient>' +
    '</defs>',

  // 열린 폴더 — 앞판이 더 크게 벌어진다. ★자기 defs를 온전히 들고 있다
  // (참조 문서는 여기서 folder의 id를 빌려 쓰다 색이 빠지는 함정이 있었다).
  folder_open:
    SHADOW +
    '<path d="M4 13h14l4 4h23v22H4z" fill="url(#{{id}}back)" stroke="#8a6208" stroke-width="1.2" stroke-linejoin="round"/>' +
    '<path d="M13 19h35l-9 21H2z" fill="url(#{{id}}front)" stroke="#8a6208" stroke-width="1.2" stroke-linejoin="round"/>' +
    '<defs>' +
    '<linearGradient id="{{id}}back" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8c53f"/><stop offset="1" stop-color="#d99a10"/></linearGradient>' +
    '<linearGradient id="{{id}}front" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset=".55" stop-color="#fdc63f"/><stop offset="1" stop-color="#e0a014"/></linearGradient>' +
    '</defs>',

  doc: paper('<path d="M15 20h17M15 25h17M15 30h11" stroke="#3a72c4" stroke-width="2"/>'),

  psd: paper(
    '<rect x="15" y="22" width="19" height="15" rx="1.5" fill="url(#{{id}}ps)"/>' +
      '<text x="24.5" y="33.5" font-size="10" fill="#57d3ff" text-anchor="middle" font-family="monospace" font-weight="bold">Ps</text>' +
      '<defs><linearGradient id="{{id}}ps" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b4a8f"/><stop offset="1" stop-color="#062043"/></linearGradient></defs>',
  ),

  virus: paper(
    '<circle cx="30" cy="32" r="11" fill="url(#{{id}}vir)" stroke="#7a1c12" stroke-width="1.3"/>' +
      '<path d="M25.6 27.6l8.8 8.8M34.4 27.6l-8.8 8.8" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/>' +
      '<defs><radialGradient id="{{id}}vir" cx=".35" cy=".3"><stop offset="0" stop-color="#f0705f"/><stop offset="1" stop-color="#c22a1c"/></radialGradient></defs>',
  ),

  // zip — 상자. 뚜껑 면이 보여야 입체로 읽힌다.
  zip:
    SHADOW +
    '<path d="M8 15l16-6 16 6v22l-16 6-16-6z" fill="url(#{{id}}body)" stroke="#8a6a12" stroke-width="1.2" stroke-linejoin="round"/>' +
    '<path d="M8 15l16 6 16-6-16-6z" fill="url(#{{id}}top)" stroke="#8a6a12" stroke-width="1.2" stroke-linejoin="round"/>' +
    '<path d="M24 21v22" stroke="#8a6a12" stroke-width="1.2"/>' +
    '<rect x="21" y="18" width="6" height="9" rx="1.2" fill="#fff6d8" stroke="#8a6a12" stroke-width="1.1"/>' +
    '<rect x="23.2" y="21" width="1.8" height="4" fill="#8a6a12"/>' +
    '<defs>' +
    '<linearGradient id="{{id}}body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6d76a"/><stop offset="1" stop-color="#cf9c14"/></linearGradient>' +
    '<linearGradient id="{{id}}top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe89a"/><stop offset="1" stop-color="#efc849"/></linearGradient>' +
    '</defs>',

  exe: window_(
    '<rect x="10" y="20" width="28" height="12" rx="1" fill="#fff" stroke="#9a9584" stroke-width="1"/>' +
      '<path d="M19 22.5l7 3.5-7 3.5z" fill="#2b73d8"/>',
  ),

  // ★우리 게임 앱 아이콘. 바탕화면·작업표시줄·인트로가 전부 이걸 쓴다.
  //   주변이 노란 폴더·흰 문서라 "파란 창 + 초록 진행바"면 색만으로 즉시 갈린다.
  //   16px까지 줄여도 그 두 색 관계가 살아남는다(docs/xp-icons-crack.html §2에
  //   16/24/32/48/64 실물 비교가 있다).
  game: window_(
    '<rect x="10" y="20" width="28" height="8" fill="#fff" stroke="#9a9584" stroke-width="1"/>' +
      '<rect x="11.4" y="21.4" width="4" height="5.2" fill="url(#{{id}}bar)"/>' +
      '<rect x="16.4" y="21.4" width="4" height="5.2" fill="url(#{{id}}bar)"/>' +
      '<rect x="21.4" y="21.4" width="4" height="5.2" fill="url(#{{id}}bar)"/>' +
      '<rect x="26.4" y="21.4" width="4" height="5.2" fill="url(#{{id}}bar)"/>' +
      '<path d="M10 31.5h28M10 34h18" stroke="#b3aea0" stroke-width="1.6"/>' +
      '<defs><linearGradient id="{{id}}bar" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#a4f07a"/><stop offset=".5" stop-color="#4bbb1a"/><stop offset="1" stop-color="#5fd02c"/>' +
      '</linearGradient></defs>',
  ),

  // 휴지통 — ★반투명 원통. XP 실물이 이 모양이다.
  bin:
    SHADOW +
    '<path d="M13 15l2.5 25c.2 1.6 4 2.6 8.5 2.6s8.3-1 8.5-2.6L35 15z" fill="url(#{{id}}bin)" stroke="#5d6b7a" stroke-width="1.3" stroke-linejoin="round"/>' +
    '<ellipse cx="24" cy="15" rx="11" ry="3.6" fill="#eef3f8" stroke="#5d6b7a" stroke-width="1.3"/>' +
    '<ellipse cx="24" cy="12.4" rx="12.5" ry="4" fill="#b7c4d2" stroke="#5d6b7a" stroke-width="1.3"/>' +
    '<path d="M19 20v18M24 20.4v19M29 20v18" stroke="rgba(93,107,122,.55)" stroke-width="1.4"/>' +
    '<defs><linearGradient id="{{id}}bin" x1="0" y1="0" x2="1" y2="0">' +
    '<stop offset="0" stop-color="#cfdae6"/><stop offset=".4" stop-color="#eef4fa"/><stop offset="1" stop-color="#a9b8c8"/>' +
    '</linearGradient></defs>',

  // 방패 — XP 보안 센터의 4분할 방패.
  shield:
    SHADOW +
    '<path d="M24 4l16 6.5v11.5c0 9.6-6.6 16.8-16 19.6C14.6 38.8 8 31.6 8 22V10.5z" fill="url(#{{id}}shl)" stroke="#7a5c00" stroke-width="1.4" stroke-linejoin="round"/>' +
    '<path d="M24 5.4v35.4M9.4 20.5h29.2" stroke="rgba(255,255,255,.75)" stroke-width="1.8"/>' +
    '<defs><linearGradient id="{{id}}shl" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#ffe071"/><stop offset=".55" stop-color="#f5bd1c"/><stop offset="1" stop-color="#cf9508"/>' +
    '</linearGradient></defs>',

  help:
    SHADOW +
    '<circle cx="24" cy="23" r="17" fill="url(#{{id}}help)" stroke="#1b4a8f" stroke-width="1.4"/>' +
    '<ellipse cx="19" cy="15" rx="7" ry="4.5" fill="rgba(255,255,255,.35)"/>' +
    '<path d="M18.6 18.5a5.6 5.6 0 1 1 7.4 5.3v3.4" fill="none" stroke="#fff" stroke-width="4.2" stroke-linecap="round"/>' +
    '<circle cx="24" cy="32.4" r="2.6" fill="#fff"/>' +
    '<defs><linearGradient id="{{id}}help" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#7cbcf5"/><stop offset="1" stop-color="#2160b8"/></linearGradient></defs>',

  pad:
    SHADOW +
    '<path d="M11 17h26l4 20H7z" fill="#7c8798"/>' +
    '<rect x="5" y="15" width="38" height="19" rx="9" fill="url(#{{id}}pad)" stroke="#17427c" stroke-width="1.4"/>' +
    '<ellipse cx="16" cy="21" rx="8" ry="3" fill="rgba(255,255,255,.28)"/>' +
    '<path d="M12 21.5v6M9 24.5h6" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>' +
    '<circle cx="34" cy="22.5" r="2.6" fill="#fff"/><circle cx="38" cy="27" r="2.6" fill="#fff"/>' +
    '<defs><linearGradient id="{{id}}pad" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#6fb2f2"/><stop offset=".5" stop-color="#2e6fd0"/><stop offset="1" stop-color="#1c4c9c"/></linearGradient></defs>',
};

/** 등록된 파일 아이콘 이름들(디버그·검증용). */
export const FILE_ICON_NAMES = Object.keys(FILE_ICONS);

// 호출마다 도는 카운터 — 그라데이션 id 접두사를 유일하게 만든다(위 주석 참고).
let seq = 0;

// 모르는 이름이 왔을 때. icons.js와 같은 원칙으로 "빠졌다"가 바로 보이게 한다.
const FALLBACK = SHADOW + '<rect x="8" y="6" width="32" height="36" rx="2" fill="#f2f0e6" stroke="#b03a2a" stroke-width="1.6" stroke-dasharray="4 3"/><text x="24" y="30" font-size="18" fill="#b03a2a" text-anchor="middle" font-family="monospace" font-weight="bold">?</text>';

/**
 * 파일 아이콘 하나를 SVG 문자열로 돌려준다.
 * ★ui/icons.js의 icon()과 절대 섞어 쓰지 말 것 — 크기(48 vs 24)도 색 계약도 다르다.
 * @param {string} name FILE_ICONS의 키
 * @param {number} size 화면에 그릴 한 변(px)
 */
export function fileIcon(name, size = 48) {
  const body = FILE_ICONS[name];
  if (body === undefined) {
    console.warn(`[fileIcons] 등록되지 않은 파일 아이콘: "${name}" — 자리표시 도형으로 대체한다.`);
    return wrap(FALLBACK, size, `f${seq++}`);
  }
  return wrap(body, size, `f${seq++}`);
}

function wrap(body, size, id) {
  // {{id}}를 이번 호출 전용 접두사로 바꿔 같은 문서 안의 다른 아이콘과 안 겹치게 한다.
  const inner = body.split('{{id}}').join(id);
  return (
    `<svg class="xfileicon" width="${size}" height="${size}" viewBox="${VIEWBOX}" ` +
    `aria-hidden="true" focusable="false">${inner}</svg>`
  );
}

/**
 * 정적 마크업의 [data-file-icon] 자리표시자를 실제 SVG로 채운다.
 * ui/icons.js의 applyIcons()와 같은 방식이지만 ★속성 이름이 다르다 —
 * 두 계약이 한 문서에 섞여 있어도 서로를 침범하지 않게 하려는 것이다.
 */
export function applyFileIcons(root = document) {
  root.querySelectorAll('[data-file-icon]').forEach((el) => {
    const size = Number(el.dataset.size) || 48;
    el.innerHTML = fileIcon(el.dataset.fileIcon, size);
  });
}
