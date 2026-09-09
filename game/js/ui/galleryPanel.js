// 이 파일 역할: 그림 갤러리(.layer-gallery) — 완성한 그림 36장을 모아 보여주는
// 수집 화면. ui/settingsPanel.js와 완전히 같은 패턴이다: index.html에 이미 있는
// 정적 마크업에 핸들러만 붙이고(.win/.tbar/.ico/.wb 재사용, 새 창 장치 없음),
// initGallery()/openGallery()/closeGallery() 세 함수로 여닫는다.
//
// 타이틀에서만 열린다(다른 화면엔 진입 버튼이 없다) — 그래서 설정창과 달리
// state.settingsOpen 같은 일시정지 플래그가 필요 없다(타이틀 화면 자체가 이미
// 게임이 안 돈다). ★이 갤러리 창 자체는 ESC로도 안 닫는다: ESC는 이미 설정창
// 토글로 쓰고 있어서, 여기서 또 받으면 갤러리를 닫으면서 동시에 설정창이
// 열린다(ui/confirmDialog.js가 같은 이유로 ESC를 안 쓴 전례와 같다). 닫는
// 길은 [닫기]/×뿐이다. (아래 확대 팝업만은 예외 — handleGalleryViewerKey 참고)
//
// ★ 그리드 셀은 정적 마크업이 아니라 이 파일이 openGallery()마다 매번 새로
//   그린다 — 잠긴 그림은 갤러리를 닫아둔 사이에도 늘어날 수 있고(구간 클리어),
//   36칸을 캐싱해뒀다가 갱신을 놓치는 쪽보다 매번 다시 그리는 쪽이 더 단순하고
//   확실하다(칸 수가 많지 않아 비용도 무시할 만하다).
// ★ 아이콘: 정적 마크업(위 index.html의 .ico)은 data-icon 자리표시자를 쓰지만,
//   이 그리드 셀들은 동적으로 만들어지므로 icon()을 이 파일에서 직접 호출한다
//   (applyIcons()는 부팅 시 한 번, 정적 DOM만 훑는다 — 나중에 생기는 셀은
//   대상이 아니다).
//
// === 확대 팝업(2026-09-07 신설) ===
// docs/xp-design-system.html 섹션 5의 .xp-lightbox/openLb/lbStep을 그대로
// 옮겼다 — 다른 점은 그 문서가 "해금 = 앞쪽 몇 장"이라는 단순한 접두사
// 모델(GAL.unlockedTo)을 썼는데, 실제 세이브의 unlockedPictures는 플레이
// 중 무작위로 뽑힌 순서라 해금된 것이 36칸 사이에 흩어져 있을 수 있다는
// 점이다. 그래서 순환은 "해금된 것만 걸러 만든 목록"(unlockedList, 아래)
// 안에서 인덱스로 돈다 — 미해금이 그 목록에 애초에 없으므로 절대 안 낀다.
// ★ 이미지 로딩은 격자와 같은 지연 원칙 — 팝업을 열 때 unlockedList는
//   src 문자열만 모을 뿐 이미지를 미리 안 읽는다. <img src>는 openViewerAt()이
//   그 순간 보여줄 그림 "한 장"에만 건다(이동해도 매번 한 장씩).

import { getSave } from '../core/save.js';
import { allPictureSrcs, pictureLabel } from '../systems/filePicture.js';
import { icon } from './icons.js';
import { playSfx, SFX } from '../systems/sound.js';
import { initDex, buildDexGrid, handleDexViewerKey, closeDexViewer } from './dexPanel.js';

let layer = null;
let gridEl = null;
let countEl = null;
let totalEl = null;
let viewerEl = null;
let viewerWinEl = null;
let viewerImgEl = null;
let viewerTitleEl = null;
let viewerMetaEl = null;
let prevBtnEl = null;
let nextBtnEl = null;

// [그림]/[도감] 탭 — index.html의 정적 버튼 두 개와 .gallery-page 두 개.
let tabButtons = null;
let pageEls = null;

// 그리드를 다시 그릴 때마다(openGallery()) 새로 만든다 — 이전 관찰자가 이미
// 사라진 <img>를 계속 들고 있게 두지 않는다.
let thumbObserver = null;

// 확대 팝업 — 해금된 것만 canonical 순서(allPictureSrcs 순서)로 걸러낸 목록과
// 그 안에서 지금 보고 있는 위치. buildGrid()가 매번 다시 채운다(세이브가
// 갱신됐을 수 있어 그리드와 같은 이유로 캐시하지 않는다).
let unlockedList = [];
let curIndex = -1;

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

/** 그리드를 지금 세이브 기준으로 새로 그린다. unlockedList(확대 팝업 순환용)도
 * 같이 다시 채운다 — 세이브가 갱신됐을 수 있어 그리드와 같은 이유로 캐시하지
 * 않는다(위 파일 상단 주석). */
function buildGrid() {
  if (!gridEl) return;
  thumbObserver?.disconnect();

  const unlocked = new Set(getSave().unlockedPictures);
  const srcs = allPictureSrcs();
  unlockedList = srcs.filter((src) => unlocked.has(src));

  gridEl.innerHTML = srcs.map((src) => (unlocked.has(src) ? unlockedCellHtml(src) : lockedCellHtml())).join('');

  if (countEl) countEl.textContent = String(unlockedList.length);
  if (totalEl) totalEl.textContent = String(srcs.length);

  gridEl.querySelectorAll('.gallery-cell.unlocked').forEach((cell) => {
    // 클릭한 칸이 unlockedList의 몇 번째인지 찾아 그 인덱스로 연다 —
    // 확대 팝업의 ◀▶/← →가 이 인덱스 하나로 통일해서 돈다(아래 openViewerAt).
    cell.addEventListener('click', () => openViewerAt(unlockedList.indexOf(cell.dataset.src)));
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

/**
 * 확대 팝업을 unlockedList[idx]로 연다(이미 열려 있으면 그 자리에서 그림만
 * 바꾼다 — ◀▶/← →가 이 함수 하나로 통일해서 돈다). 뒤 격자 선택도 같이
 * 옮긴다(요구사항 — 이동하면 격자 선택이 따라올 것).
 * @param {number} idx unlockedList 안의 인덱스. 범위 밖이면 아무 일도 안 한다
 *   (예: 해금된 게 하나도 없는데 실수로 불렸을 경우의 안전망).
 */
function openViewerAt(idx) {
  if (!viewerEl || !viewerImgEl) return;
  if (idx < 0 || idx >= unlockedList.length) return;
  curIndex = idx;
  const src = unlockedList[idx];
  const label = pictureLabel(src);

  viewerImgEl.src = src; // 지금 보여줄 한 장만(격자와 같은 지연 원칙 — 전체 미리읽기 없음)
  if (viewerTitleEl) viewerTitleEl.textContent = `${label} — 그림 보기`;
  if (viewerMetaEl) viewerMetaEl.textContent = `${label} · ${idx + 1} / ${unlockedList.length} (해금분)`;
  // 이동 버튼 — 해금이 1장뿐이면 눌러봐야 자기 자신으로 되돌아올 뿐이니 아예 막는다.
  const canStep = unlockedList.length > 1;
  if (prevBtnEl) prevBtnEl.disabled = !canStep;
  if (nextBtnEl) nextBtnEl.disabled = !canStep;

  gridEl?.querySelectorAll('.gallery-cell.unlocked').forEach((cell) => {
    cell.classList.toggle('sel', cell.dataset.src === src);
  });

  viewerEl.classList.add('open');
}

/** ◀▶ 버튼/← → 키 — 해금된 것 안에서만 순환한다(요구사항). unlockedList 자체가
 * 이미 해금분만 걸러낸 목록이라 미해금이 낄 여지가 구조적으로 없다. */
function stepViewer(delta) {
  if (unlockedList.length === 0) return;
  openViewerAt((curIndex + delta + unlockedList.length) % unlockedList.length);
}

function closeViewer() {
  if (!viewerEl) return;
  viewerEl.classList.remove('open');
  // 닫으면 그림을 놓아준다(디코드된 상태를 계속 붙잡고 있을 이유가 없다) —
  // 다시 열면 어차피 브라우저 이미지 캐시가 있어 재요청 없이 바로 뜬다.
  if (viewerImgEl) viewerImgEl.src = '';
}

/** 지금 확대 팝업이 열려 있는가 — systems/input.js가 ESC 우선순위를 정할 때 쓴다. */
function isViewerOpen() {
  return !!viewerEl?.classList.contains('open');
}

/**
 * 확대 팝업 전용 키 처리 — debug.js의 handleDebugKey/settingsPanel.js의
 * handleSettingsKey와 같은 자리(systems/input.js의 onKeyDown이 부른다).
 * 처리했으면 true.
 * ★ ESC는 settingsPanel의 ESC(설정 토글)보다 먼저 검사해야 한다 — 안 그러면
 *   이 팝업이 떠 있는 동안 ESC가 설정창부터 열어버린다(타이틀 화면은 ESC로
 *   설정을 열 수 있는 phase다, ESC_OPENABLE_PHASES 참고). systems/input.js의
 *   onKeyDown 상단 주석에 이 순서를 그대로 적어뒀다.
 */
export function handleGalleryViewerKey(code) {
  // ★ 도감 상세 팝업(ui/dexPanel.js)도 여기서 함께 받는다 — systems/input.js의
  //   진입점을 하나로 유지하려는 것이다(그 파일 onKeyDown 상단의 ESC 순서
  //   주석이 "갤러리 확대 팝업이 설정 ESC보다 먼저"라고 못박고 있는데, 도감
  //   팝업도 정확히 같은 자리에 있어야 할 또 하나의 모달-위-모달이다).
  //   둘은 동시에 열릴 수 없다(탭이 갈려 있고, 탭을 바꾸면 아래 switchTab이
  //   둘 다 닫는다) — 그래서 순서를 따질 필요 없이 먼저 물어보면 된다.
  if (handleDexViewerKey(code)) return true;
  if (!isViewerOpen()) return false;
  if (code === 'Escape') { closeViewer(); return true; }
  if (code === 'ArrowLeft') { stepViewer(-1); return true; }
  if (code === 'ArrowRight') { stepViewer(1); return true; }
  return false;
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
  closeDexViewer(); // [도감] 상세 팝업도 같은 이유로 함께 닫는다
  for (const [name, btn] of Object.entries(tabButtons)) btn?.classList.toggle('active', name === tab);
  for (const [name, page] of Object.entries(pageEls)) page?.classList.toggle('show', name === tab);
  if (tab === 'dex') buildDexGrid(); // 이 탭을 실제로 볼 때만 그린다(그림 그리드와 같은 지연 원칙)
}

/** 최초 1회(main.js). 버튼에 핸들러를 붙인다. */
export function initGallery() {
  layer = document.getElementById('layer-gallery');
  if (!layer) return;

  gridEl = document.getElementById('gallery-grid');
  countEl = document.getElementById('gallery-count');
  totalEl = document.getElementById('gallery-total');
  viewerEl = document.getElementById('gallery-viewer');
  viewerWinEl = document.getElementById('gallery-viewer-win');
  viewerImgEl = document.getElementById('gallery-viewer-img');
  viewerTitleEl = document.getElementById('gallery-viewer-title');
  viewerMetaEl = document.getElementById('gallery-viewer-meta');
  prevBtnEl = document.getElementById('gallery-viewer-prev');
  nextBtnEl = document.getElementById('gallery-viewer-next');
  initDex();

  tabButtons = { pics: document.getElementById('gallery-tab-pics'), dex: document.getElementById('gallery-tab-dex') };
  pageEls = { pics: document.getElementById('gallery-page-pics'), dex: document.getElementById('gallery-page-dex') };
  tabButtons.pics?.addEventListener('click', () => switchTab('pics'));
  tabButtons.dex?.addEventListener('click', () => switchTab('dex'));

  document.getElementById('gallery-close')?.addEventListener('click', closeGallery);
  document.getElementById('gallery-done')?.addEventListener('click', closeGallery);

  // 확대 팝업 — 닫기 4경로 중 배경 클릭/×/[닫기] 셋(ESC는 handleGalleryViewerKey,
  // systems/input.js가 부른다). 배경(viewerEl) 클릭은 통째로 닫기지만, 안쪽
  // (viewerWinEl) 클릭은 stopPropagation으로 막아 새어나가지 않게 한다 — 그래야
  // 사진이나 도구줄을 눌러도 안 닫힌다(★그림 위에도 물론). ◀▶는 자기 핸들러로
  // 직접 이동하고, 그 클릭도 배경까지 안 새어나간다(같은 stopPropagation 덕에).
  viewerEl?.addEventListener('click', closeViewer);
  viewerWinEl?.addEventListener('click', (e) => e.stopPropagation());
  document.getElementById('gallery-viewer-x')?.addEventListener('click', closeViewer);
  document.getElementById('gallery-viewer-close')?.addEventListener('click', closeViewer);
  prevBtnEl?.addEventListener('click', () => stepViewer(-1));
  nextBtnEl?.addEventListener('click', () => stepViewer(1));
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
