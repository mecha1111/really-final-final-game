// 이 파일 역할: 게임 화면이 아닌 화면들 — 대기(select, 사실상 도달 안 함), 로딩
// 오버레이, 그리고 리로드 버튼(DOM). 결과 화면(클리어·실패)은 더 이상 여기 없다 —
// 실패는 ui/bsodScreen.js, 클리어는 ui/clearScreen.js가 각자 HTML 오버레이로 그린다.

import { cssColor, roundRect, text, pointInRect } from './draw.js';

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

/**
 * 시작 화면의 "시작" 버튼 위치. 그리기와 클릭 판정이 같은 값을 쓰도록 한 곳에서 만든다.
 * (난이도 선택은 없어졌다 — 구간 n이 오를수록 공식이 알아서 조인다)
 */
export function getStartButton(canvas) {
  const w = 320;
  const h = 76;
  return { x: canvas.width / 2 - w / 2, y: canvas.height / 2 + 20, w, h };
}

/**
 * 시작/다음 구간 대기 화면.
 * @param {number} stageIndex 앞으로 시작할 구간(0부터)
 * @param {object} preview 그 구간에 실제로 적용될 rules (createRules 결과)
 */
export function drawSelectScreen(ctx, canvas, stageIndex, preview, pointer) {
  ctx.fillStyle = cssColor('--color-overlay');
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  text(ctx, '진짜_최종_final_수정_진짜최종(5).exe', canvas.width / 2, 150, {
    size: 40,
    weight: '700',
    align: 'center',
  });
  text(
    ctx,
    '제한시간 안에 할당량만큼 파일을 업데이트하세요. 방해꾼은 클릭해서 치우고, 팝업창은 창 안의 버튼을 눌러 닫으세요.',
    canvas.width / 2,
    198,
    { size: 16, align: 'center', color: '--color-text-muted' },
  );

  // 이번 구간에 실제로 적용될 숫자를 그대로 보여준다(공식 결과를 눈으로 확인).
  // ★ 화면에 보이는 구간 번호는 사람이 읽기 쉽게 n+1 ("1구간"부터).
  //   내부 인덱스 n은 0부터라는 규칙은 그대로 두고 표시만 +1 한다.
  text(ctx, `${stageIndex + 1} 구간`, canvas.width / 2, 268, {
    size: 30,
    weight: '700',
    align: 'center',
    color: '--color-accent',
  });

  const info = [
    `할당량  ${preview.quota}MB`,
    `제한시간  ${preview.timeLimit}초`,
    `스폰 간격  ${preview.spawnInterval.toFixed(2)}초`,
    `동시 최대  ${preview.maxAlive}마리`,
  ];
  info.forEach((line, i) => {
    text(ctx, line, canvas.width / 2, 312 + i * 28, { size: 17, align: 'center', color: '--color-text-muted' });
  });

  const btn = getStartButton(canvas);
  const hover = pointInRect(pointer, btn);
  ctx.fillStyle = cssColor(hover ? '--color-btn-hover-bg' : '--color-btn-bg');
  roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 12);
  ctx.fill();
  ctx.strokeStyle = cssColor('--color-btn-border');
  ctx.lineWidth = 2;
  ctx.stroke();
  text(ctx, stageIndex === 0 ? '시작 (Enter)' : '이어서 (Enter)', btn.x + btn.w / 2, btn.y + btn.h / 2, {
    size: 22,
    weight: '700',
    align: 'center',
    baseline: 'middle',
    color: hover ? '--color-accent' : '--color-text',
  });
}

/**
 * 리로드 버튼(DOM). 시트를 수정한 뒤 다시 fetch해서 확인할 때 쓴다.
 * 디버그 패널과 달리 항상 켜져 있다(밸런스 담당자가 쓰는 버튼).
 */
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
