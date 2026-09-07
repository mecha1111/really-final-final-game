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

import { gameData } from '../config.js';
import { getSave } from '../core/save.js';
import { dexFrameKey } from '../sprite/animator.js';
import { icon } from './icons.js';

// 시트의 name_kr/special_effect를 그대로 노출하면 공략이 전부 새어나간다(예:
// clone의 분열 단계 수, hourglass의 정확한 페널티 수치, fake_btn의 손실 %).
// 그래서 도감 문구는 시트 값이 아니라 여기 따로 적어둔 "한 줄 힌트"를 쓴다 —
// 정체와 위험한 낌새만 알려주고, 정확한 수치·공략은 플레이로 알아내게 둔다.
const DEX_DESC = {
  basic: '가장 흔한 방해꾼. 한 번 클릭하면 사라진다.',
  ransom: '단단하다. 여러 번 두들겨야 한다.',
  clone: '때리면 나뉜다. 나뉜 것도 또 나뉜다.',
  popup: '닫으려면 정확한 곳을 눌러야 한다.',
  bomb: '시간이 다 되기 전에 처리할 것.',
  fake_btn: '커서를 따라다닌다. 수상하다.',
  copier: '가짜 커서를 잔뜩 뿌린다.',
  unplug: '업데이트가 멈춘다. 최우선으로.',
  bait: '정신없이 설친다. 그게 전부다.',
  hidden: '잘 안 보인다. 놔두면 손해.',
  hourglass: '건드리면 후회한다.',
  zombie: '죽여도 끝이 아니다.',
};

// 표시 순서 = 이 표의 순서(시트 로드 순서가 바뀌어도 도감 배치는 안 흔들린다).
// "발견 N / 12"의 12도 이 길이에서 나온다 — 시트에 13번째 종류가 늘어도 여기
// 표에 올리기 전까지는 도감이 조용히 그 놈을 안 보여줄 뿐 크래시는 안 난다.
const DEX_IDS = Object.keys(DEX_DESC);

let gridEl = null;
let countEl = null;
let totalEl = null;

// 그리드를 다시 그릴 때마다 새로 만든다 — ui/galleryPanel.js의 thumbObserver와
// 같은 이유(이전 관찰자가 이미 사라진 <img>를 계속 들고 있게 두지 않는다).
let thumbObserver = null;

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

/** 해금 칸 — 스프라이트(lazy) + 이름 + 한 줄 설명 + 처치 수. */
function unlockedCellHtml(spec, count) {
  const frame = dexFrameKey(spec.id);
  const desc = DEX_DESC[spec.id] ?? '';
  const name = spec.name_kr ?? spec.id;
  return (
    `<div class="gallery-cell unlocked">` +
    `<img class="gallery-thumb dex-thumb" data-src="./assets/enemies/${frame}.png" alt="" />` +
    `<div class="dex-name">${name}</div>` +
    `<div class="dex-desc">${desc}</div>` +
    `<div class="dex-count">처치 ${count}회</div>` +
    `</div>`
  );
}

/** 도감 그리드를 지금 세이브 기준으로 새로 그린다(ui/galleryPanel.js가 [도감] 탭을 열 때마다). */
export function buildDexGrid() {
  if (!gridEl) return;
  thumbObserver?.disconnect();

  const save = getSave();
  const unlocked = new Set(save.unlockedEnemies);
  const specById = new Map(gameData.enemies.map((s) => [s.id, s]));
  let count = 0;

  gridEl.innerHTML = DEX_IDS.map((id) => {
    if (!unlocked.has(id)) return lockedCellHtml();
    count++;
    // 시트에서 그 id가 아직 안 왔으면(리로드 타이밍 등) 이름만 id로 대신한다 —
    // 이미 해금된 걸 도로 잠그는 것보다 이름이 잠깐 어색한 쪽이 낫다.
    const spec = specById.get(id) ?? { id, name_kr: id };
    return unlockedCellHtml(spec, save.killCounts[id] ?? 0);
  }).join('');

  if (countEl) countEl.textContent = String(count);
  if (totalEl) totalEl.textContent = String(DEX_IDS.length);

  // ui/galleryPanel.js의 그림 그리드와 같은 방식 — root를 그리드 자신으로 좁혀서
  // "이 스크롤 상자 안에서 보이는가"만 본다. 지금 12칸뿐이라 대부분 한눈에
  // 들어오지만, 원칙은 그림 그리드와 똑같이 지킨다.
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

/** 최초 1회(ui/galleryPanel.js의 initGallery()가 부른다). */
export function initDex() {
  gridEl = document.getElementById('dex-grid');
  countEl = document.getElementById('dex-count');
  totalEl = document.getElementById('dex-total');
}
