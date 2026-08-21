// 이 파일 역할: 방해꾼 본체·게이지, 가짜 커서, 뜬 글씨을 그린다. render.js는 조립만 하고 세부는 여기서 맡는다.

import { config } from '../config.js';
import { enemyImages } from '../assets.js';
import { cssColor, roundRect, text } from './draw.js';
import { drawBaitEnemy } from './baitRender.js';

export function drawEnemy(ctx, e, showHitbox) {
  if (e.isBait) {
    // bait는 예비동작/흔들림 등 다른 연출과 안 섞이는 완전 별개 연출이다
    // (모서리 고정 + 저화질→고화질 복구). 히트박스도 없어서 그릴 게 없다.
    drawBaitEnemy(ctx, e);
    return;
  }

  const img = enemyImages[e.id];

  // 세 가지 순간 연출이 겹칠 수 있다: 클릭 맞음(flash) / 곧 공격(telegraph) / 오클릭(shake)
  const flashRatio = e.hitFlash / config.enemy.hitFlashSec;
  const telegraph = e.atkTelegraphRatio;
  const shakeRatio = e.shakeTimer / config.enemy.bodyShakeSec;

  const punch = 1 + config.enemy.hitPunch * flashRatio + config.enemy.atkTelegraphPunch * telegraph;
  const w = e.w * punch;
  const h = e.h * punch;

  const shakeX =
    shakeRatio > 0 ? Math.sin(shakeRatio * Math.PI * 6) * config.enemy.bodyShakeAmount * shakeRatio : 0;
  const telegraphX = telegraph > 0 ? Math.sin(e.age * 40) * config.enemy.atkTelegraphShake * telegraph : 0;
  const telegraphY = telegraph > 0 ? Math.cos(e.age * 47) * config.enemy.atkTelegraphShake * telegraph : 0;

  const x = e.x + shakeX + telegraphX - w / 2;
  const y = e.y + telegraphY - h / 2;

  ctx.save();
  if (flashRatio > 0) ctx.filter = `brightness(${1 + 1.6 * flashRatio})`;
  else if (telegraph > 0) ctx.filter = `brightness(${1 + 0.5 * telegraph})`;

  if (img) {
    ctx.drawImage(img, x, y, w, h);
  } else {
    // PNG를 못 읽었을 때의 대체 표시
    ctx.fillStyle = cssColor('--color-enemy-fallback');
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.filter = 'none';
    text(ctx, e.id, e.x, e.y, { size: 12, align: 'center', baseline: 'middle' });
  }
  ctx.restore();

  drawEnemyGauges(ctx, e);

  if (showHitbox) {
    // popup류는 X 버튼이 실제 판정이므로 그걸 보여준다
    const r = e.closeButton ? e.closeButtonRect() : e.hitRect();
    if (r) {
      ctx.strokeStyle = cssColor('--color-hitbox');
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
    }
  }
}

/** 남은 수명 바 + 남은 클릭 수(hp) 점 */
function drawEnemyGauges(ctx, e) {
  const barH = config.enemy.lifeBarH;
  const life = e.lifeRatio();

  if (barH > 0) {
    const w = Math.max(e.w * 0.7, 40);
    const x = e.x - w / 2;
    const y = e.y + e.h / 2 + 4;

    // 수명이 끝날 때 벌칙이 있거나(bomb, hidden) 커서를 노리는 놈(copier)은
    // 빨갛게 — 우선순위 판단용
    const danger = e.hasExpiryPenalty;
    const blink = danger && life < 0.35 && Math.floor(e.age * 8) % 2 === 0;

    ctx.fillStyle = cssColor('--color-bar-bg');
    ctx.fillRect(x, y, w, barH);
    ctx.fillStyle = cssColor(danger || blink ? '--color-life-bar-danger' : '--color-life-bar');
    ctx.fillRect(x, y, w * life, barH);
  }

  // hp가 2 이상인 놈만 남은 클릭 수를 점으로 보여준다
  if (e.maxHp > 1) {
    const dot = 6;
    const gap = 4;
    const total = e.maxHp * dot + (e.maxHp - 1) * gap;
    let px = e.x - total / 2;
    const py = e.y - e.h / 2 - 10;

    for (let i = 0; i < e.maxHp; i++) {
      ctx.fillStyle = cssColor(i < e.hp ? '--color-hp-pip' : '--color-hp-pip-empty');
      ctx.beginPath();
      ctx.arc(px + dot / 2, py, dot / 2, 0, Math.PI * 2);
      ctx.fill();
      px += dot + gap;
    }
  }
}

/** 가짜 커서와 위장한 진짜 커서는 반드시 같은 모양이어야 한다(구분 불가가 핵심). */
export function drawCursorGlyph(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1.4, 1.4);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 17);
  ctx.lineTo(4.5, 13);
  ctx.lineTo(7, 19);
  ctx.lineTo(10, 17.5);
  ctx.lineTo(7.5, 12);
  ctx.lineTo(13, 11.5);
  ctx.closePath();
  ctx.fillStyle = cssColor('--color-cursor-fake');
  ctx.fill();
  ctx.strokeStyle = cssColor('--color-cursor-fake-outline');
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

/** "+60MB" / "-10%" 처럼 위로 떠오르며 사라지는 글씨 */
export function drawFloats(ctx, floats) {
  for (const f of floats) {
    const t = f.age / config.fx.floatSec;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - t);
    text(ctx, f.text, f.x, f.y - config.fx.floatRise * t, {
      size: 20,
      weight: '700',
      align: 'center',
      baseline: 'middle',
      color: f.positive ? '--color-float-plus' : '--color-float-minus',
    });
    ctx.restore();
  }
}
