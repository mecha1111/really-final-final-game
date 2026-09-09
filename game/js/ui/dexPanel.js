// 이 파일 역할: 방해꾼 도감 — 그림 갤러리 창(.layer-gallery)의 [도감] 탭.
// ★ 새 창을 안 만든다(요구사항) — ui/galleryPanel.js가 이미 여는/닫는 창을
//   그대로 쓰고, 이 파일은 그 안의 두 번째 탭 내용만 채운다. 정적 마크업에
//   매번 새로 그리는 그리드, data-src+IntersectionObserver로 미루는 썸네일
//   로딩까지 galleryPanel.js의 그림 그리드와 같은 패턴을 그대로 따른다 —
//   그쪽에 이미 적힌 이유를 여기서 다시 설명하지 않는다.
//
// ★ 해금 판정은 이 파일이 안 한다 — core/save.js의 recordEnemyEncounter()가
//   전담하고(무엇이 "처치"로 치는지는 systems/input.js·core/stageManager.js가
//   호출하는 자리에서 결정한다), 여기는 "이미 해금된 걸 어떻게 보여줄지"만 안다
//   (그리기와 판정을 분리하는 이 프로젝트의 관례 그대로).
//
// === 상세 팝업(2026-09-09 신설) ===
// 예전엔 격자 칸 안에 한 줄 설명과 처치 수를 같이 넣었는데, 3열 격자의 칸이
// 좁아 설명이 잘려서 못 읽었다(그래서 힌트로 기능하지 못했다). 지금은
//   · 격자 칸  = 그림 + 이름
//   · 상세 팝업 = 큰 그림 + 이름 + 긴 설명 + 처치 수
// 로 나눈다. 팝업은 그림 확대 팝업(ui/galleryPanel.js의 .gallery-viewer)과
// 완전히 같은 뼈대·같은 닫기 4경로(ESC/바깥/×/[닫기])·같은 순환 방식이다 —
// 해금된 것만 걸러 만든 목록(unlockedList) 안에서 인덱스로 돌기 때문에
// 미해금이 ◀▶에 낄 여지가 구조적으로 없다.

import { gameData } from '../config.js';
import { getSave } from '../core/save.js';
import { dexFrameKey } from '../sprite/animator.js';
import { icon } from './icons.js';

// 시트의 name_kr/special_effect를 그대로 노출하면 공략이 전부 새어나간다(예:
// clone의 분열 단계 수, hourglass의 정확한 페널티 수치, fake_btn의 손실 %).
// 그래서 도감 문구는 시트 값이 아니라 여기 따로 적어둔 설명을 쓴다 — 정체와
// 위험한 낌새만 알려주고, 정확한 수치·공략은 플레이로 알아내게 둔다.
// ★ 규칙: 힌트는 주되 답은 주지 않는다. "안 죽는다"(bait) "X버튼만"(popup)처럼
//   정답 자체를 적어버리면 직접 눌러보고 알아내는 재미가 사라진다 — 그래서
//   bait는 "정신없이 설친다. 그게 전부다."로, popup은 "정확한 곳을 눌러야
//   한다"까지만 적는다.
const DEX_DESC = {
  basic: '가장 흔한 방해꾼. 한 번 클릭하면 사라진다. 수는 많지만 하나하나는 약하다.',
  ransom: '단단하다. 여러 번 두들겨야 열린다. 한 번에 안 죽는다고 놀라지 말 것.',
  clone: '때리면 나뉜다. 나뉜 것도 또 나뉜다. 잡을수록 늘어나는 것처럼 보이지만 끝은 있다.',
  popup: '닫으려면 정확한 곳을 눌러야 한다. 아무 데나 누르면 닫히지 않는다.',
  bomb: '시간이 다 되기 전에 처리할 것. 놔두면 업데이트가 크게 되돌아간다.',
  fake_btn: '커서를 따라다닌다. 수상할 정도로 친절하다.',
  unplug: '업데이트가 멈춘다. 최우선으로 처리할 것.',
  bait: '정신없이 설친다. 그게 전부다.',
  hidden: '잘 안 보인다. 놔두면 다음 파일이 줄어든다.',
  copier: '가짜 커서를 잔뜩 뿌린다. 어느 게 진짜인지 헷갈린다.',
  hourglass: '건드리면 후회한다. 무시하는 편이 낫다.',
  zombie: '죽여도 끝이 아니다. 한 번 더 확인할 것.',
};

// 표시 순서 = 이 표의 순서(시트 로드 순서가 바뀌어도 도감 배치는 안 흔들린다).
// "발견 N / 12"의 12도 이 길이에서 나온다 — 시트에 13번째 종류가 늘어도 여기
// 표에 올리기 전까지는 도감이 조용히 그 놈을 안 보여줄 뿐 크래시는 안 난다.
const DEX_IDS = Object.keys(DEX_DESC);

let gridEl = null;
let countEl = null;
let totalEl = null;

// 상세 팝업 엘리먼트들.
let viewerEl = null;
let viewerWinEl = null;
let viewerImgEl = null;
let viewerTitleEl = null;
let viewerNameEl = null;
let viewerDescEl = null;
let viewerCountEl = null;
let viewerMetaEl = null;
let prevBtnEl = null;
let nextBtnEl = null;

// 그리드를 다시 그릴 때마다 새로 만든다 — ui/galleryPanel.js의 thumbObserver와
// 같은 이유(이전 관찰자가 이미 사라진 <img>를 계속 들고 있게 두지 않는다).
let thumbObserver = null;

// 상세 팝업이 도는 목록 = 해금된 항목만, DEX_IDS 순서 그대로. buildDexGrid()가
// 매번 다시 채운다(세이브가 갱신됐을 수 있어 그리드와 같은 이유로 캐시하지 않는다).
let unlockedList = [];
let curIndex = -1;

/** 잠금 칸 — 그림 갤러리의 잠금 칸과 같은 실루엣+lock이되, "???"로 이름 자리까지 가린다. */
function lockedCellHtml() {
  return (
    `<div class="gallery-cell locked">` +
    `<div class="gallery-silhouette">${icon('image', 40)}</div>` +
    `<div class="gallery-lock">${icon('lock', 14)}</div>` +
    `<div class="dex-unknown-name">???</div>` +
    `</div>`
  );
}

/** 해금 칸 — 스프라이트(lazy) + 이름. 설명·처치 수는 상세 팝업에서 읽는다. */
function unlockedCellHtml(entry) {
  return (
    `<div class="gallery-cell unlocked" data-dex-id="${entry.id}">` +
    `<img class="gallery-thumb dex-thumb" data-src="${entry.thumb}" alt="" />` +
    `<div class="dex-name">${entry.name}</div>` +
    `</div>`
  );
}

/** 도감 그리드를 지금 세이브 기준으로 새로 그린다(ui/galleryPanel.js가 [도감] 탭을 열 때마다). */
export function buildDexGrid() {
  if (!gridEl) return;
  thumbObserver?.disconnect();
  closeDexViewer(); // 다시 그리는 동안 팝업이 떠 있으면 목록과 어긋난다

  const save = getSave();
  const unlocked = new Set(save.unlockedEnemies);
  const specById = new Map(gameData.enemies.map((s) => [s.id, s]));
  unlockedList = [];

  gridEl.innerHTML = DEX_IDS.map((id) => {
    if (!unlocked.has(id)) return lockedCellHtml();
    // 시트에서 그 id가 아직 안 왔으면(리로드 타이밍 등) 이름만 id로 대신한다 —
    // 이미 해금된 걸 도로 잠그는 것보다 이름이 잠깐 어색한 쪽이 낫다.
    const spec = specById.get(id) ?? { id, name_kr: id };
    const entry = {
      id,
      name: spec.name_kr ?? id,
      desc: DEX_DESC[id] ?? '',
      thumb: `./assets/enemies/${dexFrameKey(id)}.png`,
      count: save.killCounts[id] ?? 0,
    };
    unlockedList.push(entry);
    return unlockedCellHtml(entry);
  }).join('');

  if (countEl) countEl.textContent = String(unlockedList.length);
  if (totalEl) totalEl.textContent = String(DEX_IDS.length);

  // 칸을 누르면 상세 팝업 — 잠금 칸에는 이 배선을 아예 안 건다(요구사항:
  // 미해금은 클릭해도 안 열림). 그림 갤러리가 .gallery-cell.unlocked에만
  // 핸들러를 다는 것과 같은 방식이다.
  gridEl.querySelectorAll('.gallery-cell.unlocked').forEach((cell) => {
    cell.addEventListener('click', () => {
      openDexViewerAt(unlockedList.findIndex((e) => e.id === cell.dataset.dexId));
    });
  });

  // ui/galleryPanel.js의 그림 그리드와 같은 방식 — root를 그리드 자신으로 좁혀서
  // "이 스크롤 상자 안에서 보이는가"만 본다.
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
  gridEl.querySelectorAll('.dex-thumb').forEach((img) => thumbObserver.observe(img));
}

/**
 * 상세 팝업을 unlockedList[idx]로 연다(이미 열려 있으면 그 자리에서 내용만
 * 바꾼다 — ◀▶/← →가 이 함수 하나로 통일해서 돈다).
 * @param {number} idx 범위 밖이면 아무 일도 안 한다(해금이 하나도 없는데 실수로
 *   불렸을 경우의 안전망 — 그림 팝업의 openViewerAt과 같은 가드).
 */
function openDexViewerAt(idx) {
  if (!viewerEl || idx < 0 || idx >= unlockedList.length) return;
  curIndex = idx;
  const entry = unlockedList[idx];

  if (viewerImgEl) viewerImgEl.src = entry.thumb;
  if (viewerTitleEl) viewerTitleEl.textContent = `${entry.name} — 도감`;
  if (viewerNameEl) viewerNameEl.textContent = entry.name;
  if (viewerDescEl) viewerDescEl.textContent = entry.desc;
  if (viewerCountEl) viewerCountEl.textContent = `처치 ${entry.count}회`;
  if (viewerMetaEl) viewerMetaEl.textContent = `${idx + 1} / ${unlockedList.length} (발견분)`;

  // 해금이 하나뿐이면 눌러봐야 자기 자신으로 되돌아올 뿐이라 아예 막는다.
  const canStep = unlockedList.length > 1;
  if (prevBtnEl) prevBtnEl.disabled = !canStep;
  if (nextBtnEl) nextBtnEl.disabled = !canStep;

  // 뒤 격자 선택도 같이 옮긴다(그림 팝업과 같은 규칙).
  gridEl?.querySelectorAll('.gallery-cell.unlocked').forEach((cell) => {
    cell.classList.toggle('sel', cell.dataset.dexId === entry.id);
  });

  viewerEl.classList.add('open');
}

/** ◀▶/← → — 발견한 것 안에서만 순환한다(unlockedList 자체가 해금분만 담는다). */
function stepDexViewer(delta) {
  if (unlockedList.length === 0) return;
  openDexViewerAt((curIndex + delta + unlockedList.length) % unlockedList.length);
}

export function closeDexViewer() {
  if (!viewerEl) return;
  viewerEl.classList.remove('open');
  // 닫으면 그림을 놓아준다(그림 팝업과 같은 이유 — 다시 열면 브라우저 캐시로 즉시).
  if (viewerImgEl) viewerImgEl.src = '';
}

/** 지금 도감 상세 팝업이 열려 있는가 — ESC 우선순위를 정할 때 쓴다. */
export function isDexViewerOpen() {
  return !!viewerEl?.classList.contains('open');
}

/**
 * 도감 상세 팝업 전용 키 처리. 처리했으면 true.
 * ★ 그림 확대 팝업의 handleGalleryViewerKey와 완전히 같은 계약이고, 실제로
 *   그쪽이 이 함수를 먼저 물어본다(systems/input.js의 진입점을 하나로 유지하려고
 *   — 그 파일의 ESC 순서 주석이 그대로 성립해야 한다).
 */
export function handleDexViewerKey(code) {
  if (!isDexViewerOpen()) return false;
  if (code === 'Escape') { closeDexViewer(); return true; }
  if (code === 'ArrowLeft') { stepDexViewer(-1); return true; }
  if (code === 'ArrowRight') { stepDexViewer(1); return true; }
  return false;
}

/** 최초 1회(ui/galleryPanel.js의 initGallery()가 부른다). */
export function initDex() {
  gridEl = document.getElementById('dex-grid');
  countEl = document.getElementById('dex-count');
  totalEl = document.getElementById('dex-total');

  viewerEl = document.getElementById('dex-viewer');
  viewerWinEl = document.getElementById('dex-viewer-win');
  viewerImgEl = document.getElementById('dex-viewer-img');
  viewerTitleEl = document.getElementById('dex-viewer-title');
  viewerNameEl = document.getElementById('dex-viewer-name');
  viewerDescEl = document.getElementById('dex-viewer-desc');
  viewerCountEl = document.getElementById('dex-viewer-count');
  viewerMetaEl = document.getElementById('dex-viewer-meta');
  prevBtnEl = document.getElementById('dex-viewer-prev');
  nextBtnEl = document.getElementById('dex-viewer-next');

  // 닫기 4경로 중 배경/×/[닫기] 셋(ESC는 위 handleDexViewerKey) — 안쪽 클릭은
  // stopPropagation으로 막아 창을 눌러도 안 닫히게 한다(그림 팝업과 같은 배선).
  viewerEl?.addEventListener('click', closeDexViewer);
  viewerWinEl?.addEventListener('click', (e) => e.stopPropagation());
  document.getElementById('dex-viewer-x')?.addEventListener('click', closeDexViewer);
  document.getElementById('dex-viewer-close')?.addEventListener('click', closeDexViewer);
  prevBtnEl?.addEventListener('click', () => stepDexViewer(-1));
  nextBtnEl?.addEventListener('click', () => stepDexViewer(1));
}
