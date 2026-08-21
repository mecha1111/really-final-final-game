// 이 파일 역할: 방해꾼 본체·게이지, 가짜 커서, 뜬 글씨을 그린다. render.js는 조립만 하고 세부는 여기서 맡는다.

import { config } from '../config.js';
import { enemyImages } from '../assets.js';
import { cssColor, roundRect, text } from './draw.js';
import { drawBaitEnemy } from './baitRender.js';
import { getFrameKey } from '../sprite/animator.js';

export function drawEnemy(ctx, e, showHitbox, now) {
  if (e.isBait) {
    // bait는 예비동작/흔들림 등 다른 연출과 안 섞이는 완전 별개 연출이다
    // (모서리 고정 + 저화질→고화질 복구). 히트박스도 없어서 그릴 게 없다.
    drawBaitEnemy(ctx, e, now);
    return;
  }

  // 지금 보여줄 프레임(순환 애니/체력 단계/분열 tier 등)은 전부 sprite/animator.js가 정한다.
  const img = enemyImages[getFrameKey(e, now)];

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

  // 죽어서 잠깐 corpseTimer만큼 남아있는 동안(basic dead 프레임)은 게이지를 안 그린다 —
  // 이미 죽은 놈의 수명 바/hp 점이 잠깐 더 보이면 헷갈린다.
  if (e.alive) drawEnemyGauges(ctx, e);

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

/**
 * 가짜 커서와 위장한 진짜 커서는 반드시 같은 모양이어야 한다(구분 불가가 핵심) —
 * 그래서 이 함수 하나만 부르면 어느 쪽이든 항상 같은 그림이 나온다.
 * assets/enemies/cursor/cursor.png(손그림 낙서체 커서)를 쓰고, 못 읽었을 때만
 * 예전 벡터 그림으로 대신한다(이미지 하나 없다고 안 보이면 더 이상하다).
 */
export function drawCursorGlyph(ctx, x, y) {
  const cc = config.cursor;
  const img = enemyImages['cursor/cursor'];

  if (img) {
    const w = cc.spriteSize;
    const h = (img.height / img.width) * w;
    ctx.drawImage(img, x - w * cc.hotspotXRatio, y - h * cc.hotspotYRatio, w, h);
    return;
  }

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

/**
 * 디버그 전용(H키). systems/input.js가 계산한 "클릭의 월드 좌표"에 십자선을 찍는다.
 * 화면에서 누른 자리 위에 십자선이 정확히 얹히면 좌표 변환이 맞는 것이고,
 * 한쪽으로 밀려 있으면 그 방향·거리가 그대로 오차다 — 히트박스 사각형과 겹쳐 보면
 * "판정이 왜 안 맞는지"를 숫자 없이 한 번에 알 수 있다.
 * 가장 최근 클릭만 진하게, 이전 것들은 옅게 그려서 흐름도 보이게 한다.
 */
export function drawClickMarkers(ctx, clicks) {
  if (!clicks || clicks.length === 0) return;

  const R = 14;
  ctx.save();
  ctx.lineWidth = 1.5;
  clicks.forEach((c, i) => {
    const newest = i === clicks.length - 1;
    ctx.globalAlpha = newest ? 1 : 0.25;
    ctx.strokeStyle = cssColor(newest ? '--color-danger' : '--color-hitbox');
    ctx.beginPath();
    ctx.moveTo(c.x - R, c.y);
    ctx.lineTo(c.x + R, c.y);
    ctx.moveTo(c.x, c.y - R);
    ctx.lineTo(c.x, c.y + R);
    ctx.stroke();
    if (newest) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
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
