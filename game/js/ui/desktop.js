// 이 파일 역할: HTML 바탕화면 껍데기 — 창 드래그, 개그 팝업(닫으면 새로 뜸), 토스트, 시계.
// 게임 규칙과 무관한 "분위기" 담당. 게임 수치를 그리는 건 ui/statusWindow.js가 맡는다.
//
// ★ 여기 나오는 개그 팝업(.gagpop)은 방해꾼 popup(클릭해서 잡는 적)과 완전히 다른 것이다.
//   - 개그 팝업: HTML, 점수와 무관, 닫으면 또 뜨는 개그 장치
//   - 방해꾼 popup: 캔버스, enemies 시트의 적, X 버튼 클릭으로 잡아야 업로드가 산다

import { config } from '../config.js';

// #desktop의 고정 좌표계 크기. index.html/style.css와 같은 값이어야 한다.
const BASE_W = 1920;
const BASE_H = 1080;

let topZ = 100;

/** 창을 맨 앞으로. 창끼리의 앞뒤만 바꾸며, 레이어(z-index) 자체는 안 넘는다. */
function bringFront(el) {
  el.style.zIndex = String(++topZ);
}

/**
 * 제목표시줄을 잡고 끄는 드래그.
 * #desktop이 transform:scale 돼 있으므로 화면 이동량을 배율로 나눠야
 * 커서와 창이 1:1로 붙어 움직인다(안 나누면 창이 커서보다 빠르거나 느리게 간다).
 */
function makeDraggable(win) {
  const bar = win.querySelector('.tbar') || win.querySelector('.bar');
  if (!bar) return;

  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  const scaleOf = () => {
    const desktop = document.getElementById('desktop');
    const rect = desktop.getBoundingClientRect();
    return rect.width / BASE_W || 1;
  };

  win.addEventListener('pointerdown', () => bringFront(win));

  bar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.wb')) return; // 창 버튼(_ □ ×)은 드래그가 아니다
    dragging = true;
    bringFront(win);

    const desktop = document.getElementById('desktop');
    const rect = desktop.getBoundingClientRect();
    const s = scaleOf();
    offsetX = (e.clientX - rect.left) / s - win.offsetLeft;
    offsetY = (e.clientY - rect.top) / s - win.offsetTop;

    bar.style.cursor = 'grabbing';
    e.preventDefault();
  });

  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const desktop = document.getElementById('desktop');
    const rect = desktop.getBoundingClientRect();
    const s = scaleOf();

    // 창이 화면 밖으로 완전히 사라지지 않게 살짝 물려둔다
    const x = Math.max(-win.offsetWidth + 120, Math.min(BASE_W - 120, (e.clientX - rect.left) / s - offsetX));
    const y = Math.max(0, Math.min(BASE_H - 60, (e.clientY - rect.top) / s - offsetY));
    win.style.left = `${x}px`;
    win.style.top = `${y}px`;
  });

  window.addEventListener('pointerup', () => {
    dragging = false;
    bar.style.cursor = 'move';
  });
}

/** 화면 아래쪽에 잠깐 뜨는 안내 문구 */
export function toast(msg) {
  const desktop = document.getElementById('desktop');
  if (!desktop) return;

  let el = desktop.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    desktop.appendChild(el);
  }
  el.innerHTML = msg;
  el.style.opacity = '1';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.style.transition = 'opacity .4s';
    el.style.opacity = '0';
  }, config.desktop.toastSec * 1000);
}

// 개그 팝업 문구들 — [제목, 본문(HTML), 버튼]
const GAG_LINES = [
  ['알림', '🎉 축하합니다!<br>당신은 100만번째<br>방문자입니다!', '지금 받기'],
  ['메시지', '안에 사람들이<br>있잖아!!', '확인'],
  ['경고', '바이러스가 3809개<br>발견되었습니다', '치료(가짜)'],
  ['돌고래', '절대 바이러스<br>아닙니다...<br>전 돌고래입니다', '믿어주세요'],
  ['당첨', '아이폰 당첨!!!<br>여기 클릭', '받기'],
];

/** 팝업 하나에 "닫으면 새 팝업이 또 뜬다"는 개그 동작을 붙인다. */
function wireGagPopup(el) {
  const close = () => {
    el.remove();
    spawnGagPopup(); // ★ 닫으면 하나 더 — 이게 개그 포인트
  };
  el.querySelector('.x')?.addEventListener('click', (e) => {
    e.stopPropagation();
    close();
  });
  el.querySelector('button')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toast('낚였다!');
    close();
  });
  makeDraggable(el);
}

/** 무작위 개그 팝업을 무작위 위치에 하나 띄운다. */
export function spawnGagPopup() {
  const layer = document.getElementById('layer-gag');
  if (!layer) return;
  if (layer.childElementCount >= config.desktop.maxGagPopups) return; // 무한 증식 방지

  const [title, body, btn] = GAG_LINES[Math.floor(Math.random() * GAG_LINES.length)];
  const el = document.createElement('div');
  el.className = 'gagpop';
  el.style.left = `${config.desktop.gagSpawnX[0] + Math.random() * (config.desktop.gagSpawnX[1] - config.desktop.gagSpawnX[0])}px`;
  el.style.top = `${config.desktop.gagSpawnY[0] + Math.random() * (config.desktop.gagSpawnY[1] - config.desktop.gagSpawnY[0])}px`;
  el.style.width = '250px';
  el.innerHTML =
    `<div class="bar"><span>${title}</span><span class="x">×</span></div>` +
    `<div class="c">${body}<br><button>${btn}</button></div>`;

  layer.appendChild(el);
  wireGagPopup(el);
}

/** 작업표시줄 시계 — 그냥 분위기용(게임 시간과 무관). */
function startClock() {
  const el = document.getElementById('tb-clock');
  if (!el) return;
  const tick = () => {
    const d = new Date();
    const h = d.getHours();
    const ampm = h < 12 ? '오전' : '오후';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    el.textContent = `${ampm} ${h12}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  tick();
  setInterval(tick, 10000);
}

/** 최초 1회. 창 드래그·창 버튼·개그 팝업·시계를 붙인다. */
export function initDesktop() {
  document.querySelectorAll('#desktop .win').forEach(makeDraggable);

  // 창 버튼(× 닫기 / _ 최소화): 상태.dat/업로드 두 메인 창(.win)은 게임 정보를 계속
  // 띄워두고 있어야 하므로 둘 다 동작하지 않는다 — 창이 사라질 수단을 아예 없앤다.
  // 일부러 클릭 핸들러를 안 붙이고(= 눌러도 아무 일도 안 일어난다) 비활성 스타일
  // (.disabled, style.css)만 입혀 "이건 안 눌린다"를 보여준다.
  // 개그 팝업(.gagpop)의 × 는 이 선택자와 무관한 wireGagPopup()이 따로 처리하므로
  // 기존대로 닫힌다 — 여기서 안 건드린다.
  document.querySelectorAll('#desktop .win .wb .x').forEach((x) => {
    x.classList.add('disabled');
    x.title = '이 창은 닫을 수 없습니다';
  });
  document.querySelectorAll('#desktop .win .wb .min').forEach((m) => {
    m.classList.add('disabled');
    m.title = '이 창은 최소화할 수 없습니다';
  });

  // 건너뛰기 버튼 — 일부러 클릭 핸들러를 안 붙인다. S키로만 동작해야 실수로
  // 눌리는 걸 막을 수 있다(systems/input.js의 KeyS → skipFile()). <button> 모양은
  // 유지하되(index.html의 skip-btn 주석 참고) 마우스로는 절대 발동 안 된다.

  for (let i = 0; i < config.desktop.initialGagPopups; i++) spawnGagPopup();
  startClock();
}

/**
 * 캔버스 위/아래 HTML을 페이즈에 맞춰 켜고 끈다.
 * 대기·결과 화면에서는 캔버스가 전체 오버레이를 그리므로, 그 위에 뜨는
 * 창·팝업을 숨겨야 화면이 안 겹친다(style.css의 .phase-playing 규칙).
 * title 화면도 같은 방식 — .phase-title일 때만 .layer-title이 보인다.
 * failed(BSOD) 화면도 마찬가지 — .phase-failed일 때만 .layer-bsod가 보인다.
 */
export function syncDesktopPhase(phase) {
  const desktop = document.getElementById('desktop');
  if (!desktop) return;
  desktop.classList.toggle('phase-playing', phase === 'playing');
  desktop.classList.toggle('phase-title', phase === 'title');
  desktop.classList.toggle('phase-failed', phase === 'failed');
}
