// 이 파일 역할: special_effect가 만들어내는 결과들 — 분열(clone), 수명만료 벌칙(bomb/hidden), copier의 가짜 커서.

import { config } from '../config.js';
import { state } from '../core/state.js';
import { addFloat } from '../systems/floats.js';
import { damageUpload } from '../systems/upload.js';
import { trailPositionAt } from '../systems/pointerTrail.js';
import { Enemy } from './Enemy.js';

const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/**
 * clone이 터질 때 나올 조각들을 만든다.
 * special_effect의 "대100→중70x2→소50x4"를 그대로 따른다:
 * 큰 놈 1 → 중간 2 → 작은 4 (마지막 단계는 더 안 갈라진다).
 */
export function splitEnemy(parent, rules, playArea) {
  const split = parent.effect.split;
  if (!split) return [];

  const nextTier = parent.tier + 1;
  if (nextTier >= split.tiers.length) return []; // 막내는 그냥 죽는다

  const baseW = parent.spec.size_w || 60;
  const scale = split.tiers[nextTier] / baseW;
  const children = [];

  for (let i = 0; i < split.count; i++) {
    // 부모 자리에서 살짝 벌려서 튀어나오게 한다
    const angle = (Math.PI * 2 * i) / split.count + rand(-0.3, 0.3);
    const spread = parent.w * 0.4;

    const child = new Enemy(parent.spec, {
      x: parent.x + Math.cos(angle) * spread,
      y: parent.y + Math.sin(angle) * spread,
      rules,
      playArea,
      scale,
      tier: nextTier,
    });

    child.vx = Math.cos(angle) * child.speed;
    child.vy = Math.sin(angle) * child.speed;
    child.clampInside(playArea);
    children.push(child);
  }

  return children;
}

/** 수명이 다해서 사라질 때만 터지는 효과 (bomb: 업로드 -20%, hidden: 다음 파일 -15MB) */
export function applyExpiryEffect(enemy) {
  const fx = enemy.effect;

  if (fx.expirePct > 0) {
    damageUpload(fx.expirePct, enemy.x, enemy.y);
  }
  if (fx.expireNextFileMb > 0) {
    state.nextFilePenaltyMb += fx.expireNextFileMb;
    addFloat(`다음 파일 -${fx.expireNextFileMb}MB`, enemy.x, enemy.y, false);
  }
}

/**
 * copier가 진짜 커서 위에 안착했을 때 — 그 자리에서 사라지며 커서 주위로
 * 가짜 커서를 360도 방사형으로 흩뿌리고, 진짜 커서도 똑같은 모양으로
 * 위장시킨다. 개수는 시트 문구가 아니라 config.cursor.fakeCursorCount를 쓴다.
 */
export function triggerSelfDestruct(enemy) {
  const fx = enemy.effect.fakeCursor;
  if (!fx) return;

  const cc = config.cursor;
  // 터진 지점 = 진짜 커서 자리. 각 가짜는 이 자리를 기준으로 궤적을 따라간다
  // (systems/pointerTrail.js) — 그리기 좌표는 매 프레임 updateFakeCursors가 갱신한다.
  const originX = state.pointer.x;
  const originY = state.pointer.y;

  // fakeStickCount개는 방사형 대신 진짜 바로 옆에 거의 붙는다("저것도 가짜?").
  // 나머지는 360도를 고르게 나눠 쏠림 없이 배치한다.
  const nonStickCount = Math.max(1, cc.fakeCursorCount - cc.fakeStickCount);
  let maxDuration = 0;

  for (let i = 0; i < cc.fakeCursorCount; i++) {
    const isSticky = i < cc.fakeStickCount;
    const angle = isSticky
      ? rand(0, Math.PI * 2)
      : (Math.PI * 2 * (i - cc.fakeStickCount)) / nonStickCount + rand(-cc.fakeAngleJitter, cc.fakeAngleJitter);
    const dist = isSticky ? rand(0, cc.fakeStickOffsetMax) : rand(cc.fakeOffsetMin, cc.fakeOffsetMax);

    const duration = rand(cc.fakeDurationMin, cc.fakeDurationMax);
    maxDuration = Math.max(maxDuration, duration);

    state.fakeCursors.push({
      offsetX: Math.cos(angle) * dist,
      offsetY: Math.sin(angle) * dist,
      delay: rand(cc.fakeDelayMin, cc.fakeDelayMax),
      jitterSeed: rand(0, Math.PI * 2),
      jitterPhase: 0,
      life: duration,
      x: originX,
      y: originY,
    });
  }

  // 이미 위장 중이면(연달아 터진 경우) 더 긴 쪽으로 늘린다
  state.cursorDisguise = Math.max(state.cursorDisguise, maxDuration);
  addFloat('가짜 커서!', originX, originY - 24, false);
}

/**
 * 가짜 커서를 진짜 커서의 실제 궤적을 시간차(delay)로 재생해서 움직인다 —
 * 절차적으로 "사람처럼" 흉내내지 않고 진짜 사람 움직임을 그대로 복제하므로
 * 멈춤-이동-멈춤 리듬이 저절로 나온다. 위에 손 떨림(jitter)만 더한다.
 */
export function updateFakeCursors(dt, playArea) {
  state.cursorDisguise = Math.max(0, state.cursorDisguise - dt);
  if (state.fakeCursors.length === 0) return;

  const cc = config.cursor;

  for (const c of state.fakeCursors) {
    c.life -= dt;
    c.jitterPhase += dt;

    const trail = trailPositionAt(c.delay);
    const jitterX = Math.sin(c.jitterPhase * cc.jitterSpeed + c.jitterSeed) * cc.jitterAmount;
    const jitterY = Math.cos(c.jitterPhase * cc.jitterSpeed * 1.3 + c.jitterSeed) * cc.jitterAmount;

    c.x = clamp(trail.x + c.offsetX + jitterX, playArea.x, playArea.x + playArea.w);
    c.y = clamp(trail.y + c.offsetY + jitterY, playArea.y, playArea.y + playArea.h);
  }

  state.fakeCursors = state.fakeCursors.filter((c) => c.life > 0);
}
