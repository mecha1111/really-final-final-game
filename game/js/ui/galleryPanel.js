// 이 파일 역할: 그림 갤러리(.layer-gallery) — 완성한 그림 36장을 모아 보여주는
// 수집 화면. ui/settingsPanel.js와 완전히 같은 패턴이다: index.html에 이미 있는
// 정적 마크업에 핸들러만 붙이고(.win/.tbar/.ico/.wb 재사용, 새 창 장치 없음),
// initGallery()/openGallery()/closeGallery() 세 함수로 여닫는다.
//
// 타이틀에서만 열린다(다른 화면엔 진입 버튼이 없다) — 그래서 설정창과 달리
// state.settingsOpen 같은 일시정지 플래그가 필요 없다(타이틀 화면 자체가 이미
// 게임이 안 돈다). ESC로도 안 닫는다: ESC는 이미 설정창 토글로 쓰고 있어서,
// 여기서 또 받으면 갤러리를 닫으면서 동시에 설정창이 열린다(ui/confirmDialog.js가
// 같은 이유로 ESC를 안 쓴 전례와 같다). 닫는 길은 [닫기]/×뿐이다.
//
// ★ 그리드 셀은 정적 마크업이 아니라 이 파일이 openGallery()마다 매번 새로
//   그린다 — 잠긴 그림은 갤러리를 닫아둔 사이에도 늘어날 수 있고(구간 클리어),
//   36칸을 캐싱해뒀다가 갱신을 놓치는 쪽보다 매번 다시 그리는 쪽이 더 단순하고
//   확실하다(칸 수가 많지 않아 비용도 무시할 만하다).
// ★ 아이콘: 정적 마크업(위 index.html의 .ico)은 data-icon 자리표시자를 쓰지만,
//   이 그리드 셀들은 동적으로 만들어지므로 icon()을 이 파일에서 직접 호출한다
//   (applyIcons()는 부팅 시 한 번, 정적 DOM만 훑는다 — 나중에 생기는 셀은
//   대상이 아니다).

import { getSave } from '../core/save.js';
import { allPictureSrcs } from '../systems/filePicture.js';
import { icon } from './icons.js';
import { playSfx, SFX } from '../systems/sound.js';

let layer = null;
let gridEl = null;
let countEl = null;
let totalEl = null;
let viewerEl = null;
let viewerImgEl = null;

// [그림]/[도감] 탭 — index.html의 정적 버튼 두 개와 .gallery-page 두 개.
let tabButtons = null;
let pageEls = null;

// 그리드를 다시 그릴 때마다(openGallery()) 새로 만든다 — 이전 관찰자가 이미
// 사라진 <img>를 계속 들고 있게 두지 않는다.
let thumbObserver = null;

/** 잠금 칸 — 실루엣(흐린 그림 아이콘)+lock 배지. 이미지 자체가 없어 네트워크
 * 요청도, 스포일러도 없다. */
function lockedCellHtml() {
  return (
    `<div class="gallery-cell locked">` +
    `<div class="gallery-silhouette">${icon('image', 40)}</div>` +
    `<div class="gallery-lock">${icon('lock', 14)}</div>` +
    `</div>`
  );
}

/** 해금 칸 — <img>에 src를 바로 안 박고 data-src에만 넣어둔다. 실제 src는
 * 아래 IntersectionObserver가 이 칸이 그리드 스크롤 안에 들어올 때만 옮겨
 * 붙인다 — 그 전까지는 브라우저가 이 <img>에 대해 네트워크 요청을 아예
 * 안 만든다(빈 src 속성은 요청을 안 낸다).
 *
 * ★ 처음엔 `<img loading="lazy">`(브라우저 표준 지연 로딩)만으로 해봤는데,
 *   크로미움의 기본 미리읽기 여유 거리가 넉넉해서(문서화된 바로도 화면 몇 배
 *   분량) 이 모달 크기의 그리드에서는 사실상 즉시 다 불러버렸다 — 실측으로
 *   확인한 뒤 이 방식(수동 IntersectionObserver, root를 그리드 자신으로 좁힘)
 *   으로 바꿨다. 지금 자산 수(36장)로는 어차피 대부분이 창 안에 들어오지만,
 *   나중에 countPerTier가 커져 정말 스크롤이 길어졌을 때도 이 방식이라야
 *   확실히 미뤄진다. */
function unlockedCellHtml(src) {
  return `<div class="gallery-cell unlocked" data-src="${src}"><img class="gallery-thumb" data-src="${src}" alt="" /></div>`;
}

/** 그리드를 지금 세이브 기준으로 새로 그린다. */
function buildGrid() {
  if (!gridEl) return;
  thumbObserver?.disconnect();

  const unlocked = new Set(getSave().unlockedPictures);
  const srcs = allPictureSrcs();
  let count = 0;

  gridEl.innerHTML = srcs
    .map((src) => {
      if (!unlocked.has(src)) return lockedCellHtml();
      count++;
      return unlockedCellHtml(src);
    })
    .join('');

  if (countEl) countEl.textContent = String(count);
  if (totalEl) totalEl.textContent = String(srcs.length);

  gridEl.querySelectorAll('.gallery-cell.unlocked').forEach((cell) => {
    cell.addEventListener('click', () => openViewer(cell.dataset.src));
  });

  // root를 그리드 자신으로 좁혀서(뷰포트 전체가 아니라) "이 스크롤 상자 안에서
  // 보이는가"만 본다 — rootMargin을 살짝 준 건 스크롤하다 딱 걸리는 순간의
  // 한 프레임 버벅임을 없애려는 것뿐, 몇 칸 앞을 넘겨 미리읽지는 않는다.
  thumbObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const img = entry.target;
        if (img.dataset.src) {
          img.src = img.dataset.src;
          delete img.dataset.src;
        }
        thumbObserver.unobserve(img);
      }
    },
    { root: gridEl, rootMargin: '48px', threshold: 0.01 },
  );
  gridEl.querySelectorAll('.gallery-thumb').forEach((img) => thumbObserver.observe(img));
}

function openViewer(src) {
  if (!viewerEl || !viewerImgEl) return;
  viewerImgEl.src = src;
  viewerEl.classList.add('open');
}

function closeViewer() {
  if (!viewerEl) return;
  viewerEl.classList.remove('open');
  // 닫으면 그림을 놓아준다(디코드된 상태를 계속 붙잡고 있을 이유가 없다) —
  // 다시 열면 어차피 브라우저 이미지 캐시가 있어 재요청 없이 바로 뜬다.
  if (viewerImgEl) viewerImgEl.src = '';
}

/**
 * 탭을 바꾼다 — [그림]/[도감] 두 쪽 다 정적 마크업(index.html)이라 새 창이나
 * DOM 이동 없이 .active/.show 클래스만 토글한다.
 * ★ hidden 속성이 아니라 class로 여닫는다 — 이 갤러리 창의 다른 오버레이
 *   (.gallery-viewer)가 hidden을 썼다가 #desktop .gallery-viewer{display:flex}
 *   규칙(구체성이 더 높다)에 밀려 계속 보이는 실제 버그를 낸 전례가 있다
 *   (style.css의 그 주석 참고) — 같은 함정을 여기서 또 밟지 않는다.
 */
function switchTab(tab) {
  if (!tabButtons || !pageEls) return;
  closeViewer(); // [그림] 뷰어가 떠 있는 채로 탭을 넘기면 뒤에서 계속 열려 있게 된다
  for (const [name, btn] of Object.entries(tabButtons)) btn?.classList.toggle('active', name === tab);
  for (const [name, page] of Object.entries(pageEls)) page?.classList.toggle('show', name === tab);
}

/** 최초 1회(main.js). 버튼에 핸들러를 붙인다. */
export function initGallery() {
  layer = document.getElementById('layer-gallery');
  if (!layer) return;

  gridEl = document.getElementById('gallery-grid');
  countEl = document.getElementById('gallery-count');
  totalEl = document.getElementById('gallery-total');
  viewerEl = document.getElementById('gallery-viewer');
  viewerImgEl = document.getElementById('gallery-viewer-img');

  tabButtons = { pics: document.getElementById('gallery-tab-pics'), dex: document.getElementById('gallery-tab-dex') };
  pageEls = { pics: document.getElementById('gallery-page-pics'), dex: document.getElementById('gallery-page-dex') };
  tabButtons.pics?.addEventListener('click', () => switchTab('pics'));
  tabButtons.dex?.addEventListener('click', () => switchTab('dex'));

  document.getElementById('gallery-close')?.addEventListener('click', closeGallery);
  document.getElementById('gallery-done')?.addEventListener('click', closeGallery);
  // 뷰어 배경 아무 데나(닫기 버튼 포함) 클릭하면 닫힌다 — 버튼도 클릭이 결국
  // 이 리스너까지 버블링되므로 따로 안 묶어도 된다(구간 클리어 화면의
  // "배경 클릭=스킵"과 같은 결).
  viewerEl?.addEventListener('click', closeViewer);
}

/** 갤러리를 연다 — 매번 최신 세이브로 그리드를 새로 그린다. 항상 [그림] 탭부터. */
export function openGallery() {
  if (!layer) return;
  switchTab('pics');
  buildGrid();
  playSfx(SFX.UI_OPEN, { ui: true });
  layer.classList.add('open');
}

export function closeGallery() {
  if (!layer) return;
  playSfx(SFX.UI_CLOSE, { ui: true });
  layer.classList.remove('open');
}
