// 이 파일 역할: 화면 상단 HUD(업로드 바, 누적/할당량, 남은시간·크레딧·스킵·난이도)와 업로드 정지 경고 배너.
// HUD의 "차지하는 영역"도 여기서 단일 정의한다(isPointOverHud) — 그려지는 곳과 클릭 판정이 갈라지지 않게.

import { config, getUiScaleFactor } from '../config.js';
import { cssColor, roundRect, text, bar, FONT } from './draw.js';

/**
 * 물리(실제 캔버스) 좌표가 HUD 띠 위인가.
 *
 * 왜 필요한가 — 방해꾼과 UI는 스케일 기준이 다르다(방해꾼 baseWidth=1280, UI
 * uiBaseWidth=1920). 게다가 방해꾼을 놀이 영역에 가두는 bounceInside는 "스프라이트"
 * 반높이로 클램프하는데 클릭 히트박스는 hitbox_padding 만큼 더 크다. 그래서
 * 방해꾼이 놀이 영역 최상단에 붙으면 히트박스만 HUD 띠 안으로 삐져 들어간다
 * (960x540 기준 실측: 전 방해꾼 공통 3.75px. hitboxTop=44.25 < HUD바닥=48).
 *
 * 그 겹치는 구간에서 한 클릭이 UI와 방해꾼 양쪽에 걸리므로 우선순위를 정해야 한다.
 * 정책: **UI가 항상 이긴다** — 이 함수가 true면 systems/input.js가 방해꾼 히트
 * 테스트를 아예 하지 않고 클릭을 소비한다(중복 처리 없음). 사용자가 HUD를 겨냥해
 * 눌렀는데 뒤 방해꾼이 맞는 일이 없어야 하고, 정확도 통계도 오염되지 않는다.
 *
 * 그리기(drawHud)와 이 판정이 같은 config.hud.height·같은 스케일을 쓰므로
 * HUD 높이를 바꿔도 둘이 자동으로 같이 움직인다.
 */
export function isPointOverHud(pt) {
  return pt.y < config.hud.height * getUiScaleFactor();
}

export function drawHud(ctx, canvas, state) {
  const { hud } = config;
  const { rules, file } = state;

  ctx.fillStyle = cssColor('--color-hud-bg');
  ctx.fillRect(0, 0, canvas.width, hud.height);
  ctx.fillStyle = cssColor('--color-hud-border');
  ctx.fillRect(0, hud.height - 1, canvas.width, 1);

  drawUploadBar(ctx, state, file);
  drawQuotaBar(ctx, state, rules);
  drawStatCells(ctx, canvas, state, rules);
}

function drawUploadBar(ctx, state, file) {
  const { hud } = config;

  const label = file ? `업로드 · ${file.label} ${file.sizeMb}MB` : '업로드 대기';
  text(ctx, label, hud.barX, hud.barY - 4, { size: 12, color: '--color-text-muted' });

  const fillVar = state.blocked
    ? '--color-bar-blocked'
    : state.hitFlash > 0
      ? '--color-bar-drain'
      : '--color-bar-fill';

  bar(ctx, hud.barX, hud.barY, hud.barW, hud.barH, file ? file.progress / 100 : 0, fillVar, '--color-bar-bg');

  text(ctx, `${Math.floor(file ? file.progress : 0)}%`, hud.barX + hud.barW - 10, hud.barY + hud.barH / 2, {
    size: 15,
    weight: '700',
    align: 'right',
    baseline: 'middle',
  });

  // 방해꾼이 곧 한 방 먹일 예비동작 중 — 방해꾼 자체도 커지고 흔들리지만
  // HUD에도 같이 띄워서 놓치기 어렵게 한다.
  if (state.attackWarning) {
    text(ctx, '공격 임박!', hud.barX + hud.barW + 12, hud.barY + hud.barH / 2, {
      size: 13,
      weight: '700',
      color: '--color-warning',
      baseline: 'middle',
    });
  }
}

function drawQuotaBar(ctx, state, rules) {
  const { hud } = config;
  const quotaY = hud.barY + hud.barH + 14;

  text(ctx, `누적 ${Math.floor(state.uploaded)} / ${rules.quota}MB`, hud.barX, quotaY - 3, {
    size: 12,
    color: '--color-text-muted',
  });

  bar(
    ctx,
    hud.barX + 150,
    quotaY - 12,
    hud.barW - 150,
    12,
    state.uploaded / rules.quota,
    '--color-quota-fill',
    '--color-quota-bg',
  );
}

function drawStatCells(ctx, canvas, state, rules) {
  const cells = [
    { label: '남은 시간', value: `${Math.ceil(state.timeLeft)}`, unit: '초', danger: state.timeLeft <= 30 },
    { label: '크레딧', value: `${Math.floor(state.reward)}`, unit: '', accent: true },
    { label: '스킵 (S)', value: `${state.skipsLeft}`, unit: `/${rules.skipLimit}`, danger: state.skipsLeft === 0 },
    { label: '난이도', value: String(rules.difficulty).toUpperCase(), unit: '' },
  ];

  const startX = canvas.width - 24 - cells.length * 150;

  cells.forEach((cell, i) => {
    const cx = startX + i * 150;
    text(ctx, cell.label, cx, 26, { size: 12, color: '--color-text-muted' });

    const color = cell.danger ? '--color-danger' : cell.accent ? '--color-accent' : '--color-text';
    text(ctx, cell.value, cx, 58, { size: 26, weight: '700', color });

    if (cell.unit) {
      const w = ctx.measureText(cell.value).width;
      text(ctx, cell.unit, cx + w + 4, 58, { size: 13, color: '--color-text-muted' });
    }
  });
}

/** 업로드가 완전히 멈췄을 때 놀이 영역 위쪽에 크게 경고 */
export function drawBlockedBanner(ctx, canvas, playArea, names, timeSec) {
  const blink = Math.floor(timeSec * 4) % 2 === 0;
  if (!blink) return;

  const msg = `업로드 정지 — ${names.join(', ')}`;
  ctx.font = `700 22px ${FONT}`;
  const w = ctx.measureText(msg).width + 36;
  const x = playArea.x + playArea.w / 2 - w / 2;
  const y = playArea.y + 14;

  ctx.fillStyle = cssColor('--color-hud-bg');
  roundRect(ctx, x, y, w, 40, 8);
  ctx.fill();
  ctx.strokeStyle = cssColor('--color-warning');
  ctx.lineWidth = 2;
  ctx.stroke();

  text(ctx, msg, playArea.x + playArea.w / 2, y + 20, {
    size: 22,
    weight: '700',
    align: 'center',
    baseline: 'middle',
    color: '--color-warning',
  });
}
