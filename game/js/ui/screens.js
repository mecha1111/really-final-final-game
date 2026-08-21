// 이 파일 역할: 게임 화면이 아닌 화면들 — 난이도 선택, 결과, 로딩 오버레이, 그리고 리로드 버튼(DOM).

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
    '제한시간 안에 할당량만큼 파일을 업로드하세요. 방해꾼은 클릭해서 치우고, 팝업창은 창 안의 버튼을 눌러 닫으세요.',
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

export function getRestartButton(canvas) {
  const w = 260;
  const h = 60;
  return { x: canvas.width / 2 - w / 2, y: canvas.height - 150, w, h };
}

export function drawResultScreen(ctx, canvas, state, pointer) {
  const cleared = state.phase === 'cleared';

  ctx.fillStyle = cssColor('--color-overlay');
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  text(ctx, cleared ? '업로드 완료!' : '시간 초과', canvas.width / 2, 175, {
    size: 52,
    weight: '700',
    align: 'center',
    color: cleared ? '--color-success' : '--color-danger',
  });

  // 어느 구간이었고 다음에 뭐가 되는지. 표시는 사람이 읽기 쉽게 n+1("1구간"부터).
  const shownStage = state.stageIndex + 1;
  text(
    ctx,
    cleared ? `${shownStage} 구간 돌파 → ${shownStage + 1} 구간` : `${shownStage} 구간 실패 → 1 구간부터 다시`,
    canvas.width / 2,
    218,
    { size: 20, weight: '700', align: 'center', color: cleared ? '--color-accent' : '--color-text-muted' },
  );

  const s = state.stats;
  const acc = s.clicks > 0 ? Math.round((s.hits / s.clicks) * 100) : 0;
  const lines = [
    `업로드   ${Math.floor(state.uploaded)} / ${state.rules.quota}MB`,
    `크레딧   ${Math.floor(state.reward)}`,
    `완료한 파일   ${s.filesDone}개`,
    `제거한 방해꾼   ${s.killed}마리`,
    `클릭 정확도   ${acc}%  (${s.hits}/${s.clicks})`,
    `업로드 정지 시간   ${s.blockedSec.toFixed(1)}초`,
    `방해로 깎인 양   ${Math.round(s.drainedPct)}%`,
  ];

  lines.forEach((line, i) => {
    text(ctx, line, canvas.width / 2, 275 + i * 32, {
      size: 18,
      align: 'center',
      color: i === 0 ? '--color-text' : '--color-text-muted',
    });
  });

  const btn = getRestartButton(canvas);
  const hover = pointInRect(pointer, btn);
  ctx.fillStyle = cssColor(hover ? '--color-btn-hover-bg' : '--color-btn-bg');
  roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 10);
  ctx.fill();
  ctx.strokeStyle = cssColor('--color-btn-border');
  ctx.lineWidth = 2;
  ctx.stroke();
  text(ctx, cleared ? '다음 구간 (R)' : '다시 하기 (R)', btn.x + btn.w / 2, btn.y + btn.h / 2, {
    size: 20,
    weight: '700',
    align: 'center',
    baseline: 'middle',
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
