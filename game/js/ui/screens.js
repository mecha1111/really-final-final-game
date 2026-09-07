// 이 파일 역할: 게임 화면이 아닌 화면들 — 로딩 오버레이와 리로드 버튼(DOM).
// 결과 화면(클리어·실패)은 더 이상 여기 없다 — 실패는 ui/bsodScreen.js, 클리어는
// ui/clearScreen.js가 각자 HTML 오버레이로 그린다.
//
// ★ 2026-09-07: 대기 화면(select)을 그리던 drawSelectScreen/getStartButton을
//   지웠다. advanceStage()가 항상 곧장 startGame()으로 가게 바뀐 뒤로 어디서도
//   setPhase('select')를 하지 않아 도달할 수 없는 코드였고, 그것 때문에 매
//   프레임 죽은 분기 검사와 좌표 계산이 남아 있었다(ui/render.js, systems/input.js).

import { cssColor, text } from './draw.js';

/** 밸런스 CSV를 불러오는 동안 */
export function drawLoadingOverlay(ctx, canvas) {
  ctx.fillStyle = cssColor('--color-overlay');
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  text(ctx, '밸런스 불러오는 중...', canvas.width / 2, canvas.height / 2, {
    size: 24,
    align: 'center',
    baseline: 'middle',
  });
}

export function initReloadButton(onReload) {
  const btn = document.createElement('button');
  btn.id = 'reload-balance-btn';
  btn.type = 'button';
  btn.title = '밸런스 다시 불러오기';
  btn.textContent = '↻'; // 이모지 대신 유니코드 화살표 기호

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
