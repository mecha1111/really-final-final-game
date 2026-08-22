// 이 파일 역할: special_effect가 만들어내는 결과들 — 분열(clone), 수명만료 벌칙(bomb/hidden), copier의 가짜 커서.

import { config } from '../config.js';
import { state } from '../core/state.js';
import { addFloat } from '../systems/floats.js';
import { damageUpload, triggerHitFeedback } from '../systems/upload.js';
import { trailPositionAt } from '../systems/pointerTrail.js';
import { Enemy } from './Enemy.js';

const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/**
 * 이번 구간(rules.stageIndex)에서 분열이 갈 수 있는 가장 깊은 tier.
 * config.enemy.cloneSplitMaxTierByStage에서 "stage <= stageIndex"를 만족하는
 * 마지막 칸이 이긴다(config.combo.tiers와 같은 표 문법 — 표가 stage 오름차순이라는
 * 전제다). 표가 비어 있으면(잘못 지워진 경우) 안전하게 무제한(Infinity) 취급한다 —
 * 새 설정이 게임을 멈추게 하면 안 된다.
 */
function cloneMaxTierForStage(stageIndex) {
  const table = config.enemy.cloneSplitMaxTierByStage;
  let maxTier = Infinity;
  for (const row of table) {
    if (stageIndex >= row.stage) maxTier = row.maxTier;
  }
  return maxTier;
}

/**
 * clone이 터질 때 나올 조각들을 만든다.
 * special_effect의 "대100→중70x2→소50x4"를 그대로 따른다:
 * 큰 놈 1 → 중간 2 → 작은 4 (마지막 단계는 더 안 갈라진다).
 *
 * ★ 구간 게이트(config.enemy.cloneSplitMaxTierByStage)로 초반 구간엔 이 마지막
 *   단계 전에 멈춘다 — 시트의 분열 정의 자체는 안 건드리고, "이번에 만들 조각의
 *   tier가 이 구간에서 허용된 깊이를 넘는지"만 여기서 한 번 더 본다. split 효과를
 *   쓰는 종류가 늘어도(지금은 clone뿐) 이 함수 하나로 똑같이 적용된다.
 */
export function splitEnemy(parent, rules, playArea) {
  const split = parent.effect.split;
  if (!split) return [];

  const nextTier = parent.tier + 1;
  if (nextTier >= split.tiers.length) return []; // 막내는 그냥 죽는다
  if (nextTier > cloneMaxTierForStage(rules.stageIndex)) return []; // 이 구간엔 여기까지

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
    // damageUpload()를 안 거친다 — 지금 파일의 진행률(state.file.progress)이
    // 아니라 "다음 파일"의 예약 페널티라 지금 바가 안 줄어든다. 그래도 "당했다"
    // 자체는 알려야 하므로 피드백만 따로 켠다(번쩍임+비네트+수치 텍스트,
    // 바 손실 잔상만 빠진다 — 지금 바가 실제로 안 줄었으니 당연하다).
    triggerHitFeedback(`-${fx.expireNextFileMb}MB`);
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
