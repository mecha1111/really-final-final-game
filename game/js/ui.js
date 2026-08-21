// ui.js
// 그리기(렌더링)와 입력 처리. 색은 전부 style.css의 :root 변수를 읽어서 쓴다 —
// 이 파일을 포함해 어디에도 색을 hex/rgb로 하드코딩하지 않는다.

const rootStyle = getComputedStyle(document.documentElement);

/** style.css의 --color-* 변수 값을 읽는다. */
export function cssColor(varName) {
  return rootStyle.getPropertyValue(varName).trim();
}

export const input = {
  left: false,
  right: false,
  up: false,
  down: false,
};

const KEY_MAP = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
};

export function initInput() {
  window.addEventListener('keydown', (e) => {
    const dir = KEY_MAP[e.code];
    if (dir) input[dir] = true;
  });
  window.addEventListener('keyup', (e) => {
    const dir = KEY_MAP[e.code];
    if (dir) input[dir] = false;
  });
}

/**
 * 매 프레임 화면을 그린다. 지금 단계에서는 캔버스를
 * --color-canvas-bg로 채우는 것까지가 성공 기준이다.
 */
export function draw(ctx, canvas, state) {
  ctx.fillStyle = cssColor('--color-canvas-bg');
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // TODO: 다음 단계에서 플레이어/방해꾼/HUD 렌더링 추가
}

/** 밸런스 데이터(구글 시트 CSV) 로딩 중 화면 중앙에 안내 문구를 그린다. */
export function drawLoadingOverlay(ctx, canvas) {
  ctx.save();
  ctx.fillStyle = cssColor('--color-text');
  ctx.font = '20px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('밸런스 불러오는 중...', canvas.width / 2, canvas.height / 2);
  ctx.restore();
}

/**
 * 🔄 리로드 버튼(실제 DOM 엘리먼트, 클릭 hit-test가 캔버스보다 간단해서
 * canvas가 아닌 button 태그로 만든다). 누르면 onReload를 호출한다.
 * 시트를 수정한 뒤 다시 fetch해서 확인할 때 쓴다.
 */
export function initReloadButton(onReload) {
  const btn = document.createElement('button');
  btn.id = 'reload-balance-btn';
  btn.type = 'button';
  btn.title = '밸런스 다시 불러오기';
  btn.textContent = '🔄';

  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    btn.disabled = true;
    Promise.resolve(onReload()).finally(() => {
      btn.disabled = false;
    });
  });

  document.body.appendChild(btn);
  return btn;
}
