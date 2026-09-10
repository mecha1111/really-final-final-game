// 이 파일 역할: special_effect가 만들어내는 결과들 — 분열(clone), 수명만료 벌칙(bomb/hidden), copier의 가짜 커서.

import { config } from '../config.js';
import { state } from '../core/state.js';
import { addFloat } from '../systems/floats.js';
import { damageUpload, triggerHitFeedback } from '../systems/upload.js';
import { playSfx, SFX } from '../systems/sound.js';
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
 *
 * @param {object} [cap] 유한 구간의 마릿수·종류·종류별 개별 상한(2026-09-10
 *   신설). 호출부(core/stageManager.js의 processDeaths)가 "이번 프레임에 이미
 *   정해진 점유"를 들고 있다가 넘겨준다 — { occupancy, types, byId } 형태이고,
 *   이 함수가 실제로 몇 마리를 낳을지 정한 뒤 그 결과를 이 객체에 되먹인다
 *   (같은 프레임에 분열이 여러 번 겹쳐도 순서대로 정확히 반영되게). 무한모드는
 *   호출부가 아예 안 넘긴다(cap === undefined) — 그러면 이 함수는 예전 그대로
 *   무제한으로 돈다(요구사항: 무한모드 분열은 이번 변경 범위 밖).
 *
 *   왜 필요했는가 — 이 함수는 enemies/spawner.js의 update()를 거치지 않는
 *   유일한 생성 경로라, 예전엔 세 상한(마릿수·종류·종류별 개별)을 전부
 *   우회했다(실측: 4구간 표기 6 → 동시 마릿수 최대 10, 400판 중 95%에서 초과 —
 *   헤드리스 시뮬레이터로 확인).
 *
 *   세 필드는 서로 다른 기준을 쓴다 — 각자 대응하는 기존 스폰 필터가 이미
 *   쓰던 기준을 그대로 물려받았을 뿐, 여기서 새로 정한 게 아니다:
 *     occupancy — .alive 기준(살아있는 놈만, corpseTimer 시체 제외). "동시
 *       몇 마리"를 묻는 rules.maxAlive 게이트의 기준이다.
 *     types     — .alive 기준. enemies/spawner.js의 filterByTypeCap이 쓰는
 *       기준과 같다(그 함수 주석 참고 — 시체·부활 대기는 "화면에 안 보인다"고 본다).
 *     byId      — countsForConcurrency 기준(부활 대기 zombie도 포함). 같은
 *       파일의 filterByConcurrencyCap이 config.enemy.maxConcurrentById를
 *       읽을 때 쓰는 기준과 같다 — 지금은 그 표에 분열하는 종류가 없어서(clone은
 *       표에 없다) 실질적으로 아무 것도 안 막지만, 나중에 분열하는 종류가
 *       상한표에 오르면 이 필드만으로 저절로 맞물린다.
 */
export function splitEnemy(parent, rules, playArea, cap) {
  const split = parent.effect.split;
  if (!split) return [];

  const nextTier = parent.tier + 1;
  if (nextTier >= split.tiers.length) return []; // 막내는 그냥 죽는다
  if (nextTier > cloneMaxTierForStage(rules.stageIndex)) return []; // 이 구간엔 여기까지

  // ★ 2026-09-10 — 유한 구간의 상한을 분열 자식에도 적용한다(위 @param cap 주석
  //   참고). cap이 없으면(무한모드) 이 블록 전체를 건너뛰고 예전과 완전히
  //   동일하게 돈다.
  let count = split.count;
  if (cap) {
    // 종류 상한: 이 변종(parent.id, 자식도 부모와 같은 spec이라 id가 같다)이
    // 지금 화면에 이미 있으면(다른 자리의 clone이 살아있으면) 상한과 무관하게
    // 허용한다 — "이미 떠 있는 종류를 한 마리 더 늘리는 것"이지 새 종류가
    // 아니다(enemies/spawner.js의 filterByTypeCap과 같은 원칙). 없는데 상한이
    // 이미 찼으면 분열 자체를 접는다 — 위 cloneMaxTierForStage와 같은 자리·
    // 같은 취급이라 "가끔 안 갈라진다"는 이 게임에 이미 있는 정상 동작이다.
    const alreadyOnScreen = cap.types.has(parent.id);
    if (!alreadyOnScreen && cap.types.size >= rules.typeCap) return [];

    // 종류별 개별 상한(config.enemy.maxConcurrentById) — 지금은 clone이 이
    // 표에 없어서 idCap이 항상 null이라 이 블록이 실질적으로 아무 것도 안 막는다.
    const idCap = config.enemy.maxConcurrentById?.[parent.id];
    if (idCap != null) {
      const idOccupancy = cap.byId.get(parent.id) ?? 0;
      count = Math.min(count, Math.max(0, idCap - idOccupancy));
      if (count <= 0) return [];
    }

    // 마릿수 상한: 남은 자리만큼만 낳는다. split.count(원래 갈래 수)를 다 낳을
    // 자리가 없다고 분열 자체를 취소하진 않는다 — 한 마리라도 나올 자리가
    // 있으면 그만큼은 내보낸다. 자리가 0이면 이 놈도 그냥 죽는다.
    const room = Math.max(0, rules.maxAlive - cap.occupancy);
    count = Math.min(count, room);
    if (count <= 0) return [];
  }

  const baseW = parent.spec.size_w || 60;
  const scale = split.tiers[nextTier] / baseW;
  const children = [];

  for (let i = 0; i < count; i++) {
    // 부모 자리에서 살짝 벌려서 튀어나오게 한다. 각도 배치는 상한에 걸려 덜
    // 태어나도 split.count(원래 갈래 수) 기준을 그대로 쓴다 — count로 나누면
    // 둘만 남았을 때 반대편으로 확 벌어져 보여서 "원래 몇 갈래였는지"가 안 보인다.
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

  // 실제로 조각이 나왔을 때만 낸다 — 위 가드(막내 tier, 구간 게이트, 이번에
  // 신설한 상한)에 걸려 그냥 죽는 경우엔 분열이 일어나지 않았으므로 분열음도
  // 나면 안 된다.
  // (그 경우에도 Enemy.kill()의 처치음은 이미 났다 — 잡힌 건 잡힌 것이다)
  if (children.length) playSfx(SFX.CLONE_SPLIT);

  // 이번 분열로 실제로 늘어난 만큼을 점유·종류·종류별 카운트에 되먹인다 — 같은
  // 프레임에 또 다른 clone이 죽어 splitEnemy가 다시 불릴 때 이 결과를 반영해서 본다.
  if (cap && children.length) {
    cap.occupancy += children.length;
    cap.types.add(parent.id);
    cap.byId.set(parent.id, (cap.byId.get(parent.id) ?? 0) + children.length);
  }

  return children;
}

/** 수명이 다해서 사라질 때만 터지는 효과 (bomb: 업로드 -20%, hidden: 다음 파일 -15MB) */
export function applyExpiryEffect(enemy) {
  const fx = enemy.effect;

  if (fx.expirePct > 0) {
    // bomb이 터졌다. 폭발음(BOMB_EXPLODE)이 곧 "당했다"는 신호라, damageUpload의
    // 공통 피격음(HIT)은 silent로 꺼서 겹치지 않게 한다 — 공통음까지 얹으면 폭발음이
    // 묻힌다. 시각 피드백(번쩍임·비네트·"-20%")은 damageUpload가 그대로 켠다.
    playSfx(SFX.BOMB_EXPLODE);
    damageUpload(fx.expirePct, enemy.x, enemy.y, { silent: true });
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

  playSfx(SFX.COPIER_SELFDESTRUCT);

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
