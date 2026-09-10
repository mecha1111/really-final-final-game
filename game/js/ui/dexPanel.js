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
// === 두 구획: 방해꾼 / 환경 방해 (2026-09-09) ===
// 도감에 환경 방해 6종이 함께 들어온다. 구조는 "탭 안의 또 탭"이 아니라 ★한
// 스크롤 상자 안의 두 구획이다:
//   · 갤러리 창은 이미 [그림]/[도감] 탭을 갖고 있다. 그 안에 두 번째 탭 줄을
//     또 넣으면 XP 창 하나에 탭이 두 겹이 되는데, 이 프로젝트가 흉내 내는 XP
//     대화상자 어휘에 그런 물건이 없다.
//   · 두 구획을 합쳐도 18칸(6행)뿐이라 한 상자에 그냥 들어간다. 탭으로 나누면
//     "저쪽에 뭐가 더 있나"를 눌러봐야만 알 수 있게 되는데, 도감은 수집 현황을
//     한눈에 보는 화면이라 그게 손해다.
//   · 구획 제목은 설정창이 이미 쓰는 .grp/.h 어휘를 그대로 재사용한다(새 CSS
//     언어를 안 만든다) — grid-column: 1 / -1로 한 줄을 통째로 차지한다.
// "발견 N / 18"의 분모도 두 구획 길이의 합이다.
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
// 그래서 도감 문구는 시트 값이 아니라 여기 따로 적어둔 설명을 쓴다.
// ★ 2026-09-10 재작성 — 한 줄, 존댓말, 수치 없이 대처법만. 예전엔 "정답 자체를
//   적지 않는다"는 규칙으로 bait를 "정신없이 설친다. 그게 전부다."처럼 에둘러
//   썼지만, 이번 지시는 반대로 "죽지 않습니다"처럼 대처법을 직접 알려주는
//   쪽으로 바뀌었다(요구사항 원문 그대로) — 수치(초·%·마리 수)만 여전히 뺀다.
const DEX_DESC = {
  basic: '한 번 클릭하면 사라집니다.',
  ransom: '여러 번 두들겨야 열립니다.',
  clone: '때리면 둘로 나뉩니다.',
  popup: '닫기 버튼을 정확히 눌러야 닫힙니다.',
  bomb: '시간 안에 처리하지 않으면 크게 깎입니다.',
  fake_btn: '누르면 손해입니다. 건드리지 마십시오.',
  unplug: '업데이트가 잠시 멈춥니다.',
  bait: '죽지 않습니다. 무시하십시오.',
  hidden: '눈에 잘 띄지 않습니다. 놔두면 다음 파일이 줄어듭니다.',
  copier: '가짜 커서를 여럿 퍼뜨립니다. 진짜를 잘 구별하십시오.',
  hourglass: '건드리면 조작이 멈춥니다. 연타로 빠져나옵니다.',
  zombie: '쓰러뜨려도 한 번 더 일어납니다.',
};

// 표시 순서 = 이 표의 순서(시트 로드 순서가 바뀌어도 도감 배치는 안 흔들린다).
// 시트에 13번째 종류가 늘어도 여기 표에 올리기 전까지는 도감이 조용히 그 놈을
// 안 보여줄 뿐 크래시는 안 난다.
const DEX_IDS = Object.keys(DEX_DESC);

// 환경 방해 6종. id는 systems/hazard.js에 등록된 값 그대로다(ui/hazards/*.js의
// registerHazard({ id })) — 여기 이름이 그쪽과 갈리면 해금이 영영 안 붙는다.
// ★ 아이콘: 방해꾼과 달리 스프라이트가 없다(환경 방해는 캔버스가 아니라 HTML
//   레이어에 그려지는 장치라 "한 장의 그림"이 애초에 없다). 새 아트를 만드는
//   대신 ui/icons.js의 글리프를 쓴다 — 각 방해가 자기 화면에서 이미 쓰고 있는
//   아이콘과 최대한 같은 것으로 골랐다(절전=plug, 드라이버=경고, 재부팅=전원…).
//   여섯이 서로 겹치지 않게만 조정했다(driver와 flip이 둘 다 monitor를 쓰고
//   있어서 driver를 warning으로 옮겼다 — 도감에서는 구분이 더 중요하다).
const HAZARD_DEX = [
  { id: 'reboot', name: '재부팅 카운트다운', icon: 'power',
    desc: '화면 한가운데 창이 뜬다. 버튼을 잘 보고 고를 것.' },
  { id: 'screensaver', name: '스크린세이버', icon: 'star',
    desc: '화면이 잠긴 것처럼 보인다. 아무 데나 누르면 풀린다.' },
  { id: 'powersave', name: '절전 모드', icon: 'plug',
    desc: '화면이 어두워진다. 계속 움직여야 유지된다.' },
  { id: 'driver', name: '드라이버 오류', icon: 'warning',
    desc: '커서가 늦게 따라온다. 보이는 것보다 앞서 눌러야 한다.' },
  { id: 'cracked', name: '화면 깨짐', icon: 'error',
    desc: '찢어진 세로줄이 화면을 가린다. 잠시 참으면 복구된다.' },
  { id: 'flip', name: '화면 상하반전', icon: 'monitor',
    desc: '화면이 뒤집힌다. 잠시 참으면 돌아온다.' },
];

let gridEl = null;
let countEl = null;
let totalEl = null;

// 상세 팝업 엘리먼트들.
let viewerEl = null;
let viewerWinEl = null;
let viewerImgEl = null;
let viewerIconEl = null;
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

/** 잠금 칸 — 해금 칸과 똑같은 두 조각 구조(썸네일 영역 + 이름 영역)를 쓴다
 * (style.css의 .gallery-dex-grid 재작성 주석 참고) — 그래야 잠금/해금이 같은
 * 행에 섞여도 셀 높이가 항상 같다. 썸네일 자리엔 실루엣+lock, 이름 자리엔
 * "???"를 넣어 그림 갤러리의 잠금 칸과 같은 느낌을 유지한다. */
function lockedCellHtml() {
  return (
    `<div class="gallery-cell locked">` +
    `<div class="dex-thumb dex-thumb-locked">` +
    `<div class="gallery-silhouette">${icon('image', 40)}</div>` +
    `<div class="gallery-lock">${icon('lock', 14)}</div>` +
    `</div>` +
    `<div class="dex-name dex-unknown-name">???</div>` +
    `</div>`
  );
}

/** 해금 칸 — 그림 + 이름. 설명·처치 수는 상세 팝업에서 읽는다.
 * 방해꾼은 스프라이트(lazy 로딩), 환경 방해는 icons.js 글리프(요청 자체가 없다). */
function unlockedCellHtml(entry) {
  const art = entry.thumb
    ? `<img class="gallery-thumb dex-thumb" data-src="${entry.thumb}" alt="" />`
    : `<div class="dex-thumb dex-thumb-icon">${icon(entry.icon, 56)}</div>`;
  return (
    `<div class="gallery-cell unlocked" data-dex-id="${entry.id}">` +
    art +
    `<div class="dex-name">${entry.name}</div>` +
    `</div>`
  );
}

/** 구획 제목 — 설정창의 .grp .h와 같은 어휘. 격자 한 줄을 통째로 쓴다(CSS). */
function sectionHeadHtml(text, found, total) {
  return `<div class="dex-section">${text} <span class="dex-section-n">${found} / ${total}</span></div>`;
}

/** 도감 그리드를 지금 세이브 기준으로 새로 그린다(ui/galleryPanel.js가 [도감] 탭을 열 때마다). */
export function buildDexGrid() {
  if (!gridEl) return;
  thumbObserver?.disconnect();
  closeDexViewer(); // 다시 그리는 동안 팝업이 떠 있으면 목록과 어긋난다

  const save = getSave();
  const specById = new Map(gameData.enemies.map((s) => [s.id, s]));
  unlockedList = [];

  // ── 구획 1: 방해꾼 ────────────────────────────────────────────────────────
  const unlockedEnemies = new Set(save.unlockedEnemies);
  const enemyCells = DEX_IDS.map((id) => {
    if (!unlockedEnemies.has(id)) return lockedCellHtml();
    // 시트에서 그 id가 아직 안 왔으면(리로드 타이밍 등) 이름만 id로 대신한다 —
    // 이미 해금된 걸 도로 잠그는 것보다 이름이 잠깐 어색한 쪽이 낫다.
    const spec = specById.get(id) ?? { id, name_kr: id };
    const entry = {
      id,
      name: spec.name_kr ?? id,
      desc: DEX_DESC[id] ?? '',
      thumb: `./assets/enemies/${dexFrameKey(id)}.png`,
      // 방해꾼 칸의 누적 표시. bait/hourglass/fake_btn/copier는 세는 의미가
      // 조금씩 다르지만(core/save.js의 killCounts 주석) 표시는 "처치"로 통일한다.
      countLabel: `처치 ${save.killCounts[id] ?? 0}회`,
    };
    unlockedList.push(entry);
    return unlockedCellHtml(entry);
  });
  const foundEnemies = unlockedList.length;

  // ── 구획 2: 환경 방해 ─────────────────────────────────────────────────────
  const unlockedHazards = new Set(save.unlockedHazards);
  const hazardCells = HAZARD_DEX.map((h) => {
    if (!unlockedHazards.has(h.id)) return lockedCellHtml();
    const entry = {
      id: h.id,
      name: h.name,
      desc: h.desc,
      thumb: null, // 스프라이트가 없다 — icon으로 그린다(위 HAZARD_DEX 주석)
      icon: h.icon,
      countLabel: `겪음 ${save.killCounts[h.id] ?? 0}회`,
    };
    unlockedList.push(entry);
    return unlockedCellHtml(entry);
  });
  const foundHazards = unlockedList.length - foundEnemies;

  gridEl.innerHTML =
    sectionHeadHtml('방해꾼', foundEnemies, DEX_IDS.length) +
    enemyCells.join('') +
    sectionHeadHtml('환경 방해', foundHazards, HAZARD_DEX.length) +
    hazardCells.join('');

  if (countEl) countEl.textContent = String(unlockedList.length);
  if (totalEl) totalEl.textContent = String(DEX_IDS.length + HAZARD_DEX.length);

  // 칸을 누르면 상세 팝업 — 잠금 칸에는 이 배선을 아예 안 건다(요구사항:
  // 미해금은 클릭해도 안 열림). 그림 갤러리가 .gallery-cell.unlocked에만
  // 핸들러를 다는 것과 같은 방식이다.
  gridEl.querySelectorAll('.gallery-cell.unlocked').forEach((cell) => {
    cell.addEventListener('click', () => {
      openDexViewerAt(unlockedList.findIndex((e) => e.id === cell.dataset.dexId));
    });
  });

  // ui/galleryPanel.js의 그림 그리드와 같은 방식 — root를 그리드 자신으로 좁혀서
  // "이 스크롤 상자 안에서 보이는가"만 본다. (환경 방해 칸은 <img>가 아니라
  //  인라인 SVG라 애초에 관찰 대상이 아니다 — 네트워크 요청이 없다.)
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
  gridEl.querySelectorAll('img.dex-thumb').forEach((img) => thumbObserver.observe(img));
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

  // 방해꾼은 스프라이트 <img>, 환경 방해는 글리프 — 둘 중 하나만 보여준다.
  if (viewerImgEl) {
    viewerImgEl.hidden = !entry.thumb;
    viewerImgEl.src = entry.thumb ?? '';
  }
  if (viewerIconEl) {
    viewerIconEl.hidden = !!entry.thumb;
    viewerIconEl.innerHTML = entry.thumb ? '' : icon(entry.icon, 110);
  }
  if (viewerTitleEl) viewerTitleEl.textContent = `${entry.name} — 도감`;
  if (viewerNameEl) viewerNameEl.textContent = entry.name;
  if (viewerDescEl) viewerDescEl.textContent = entry.desc;
  // "처치 N회"(방해꾼) / "겪음 N회"(환경 방해) — buildDexGrid가 미리 정해 넣는다.
  if (viewerCountEl) viewerCountEl.textContent = entry.countLabel;
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
  if (viewerIconEl) viewerIconEl.innerHTML = '';
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
  viewerIconEl = document.getElementById('dex-viewer-icon');
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
