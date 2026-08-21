// 이 파일 역할: 업로드 바의 진행/정지/피해 계산. 방해꾼의 주기 공격이 여기로 들어온다.

import { config } from '../config.js';
import { state } from '../core/state.js';
import { addFloat } from './floats.js';
import { completeFile } from './file.js';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/**
 * 업로드 바를 즉시 깎는다. 주기 공격, bomb 폭발, 함정 오클릭이 모두 이걸 쓴다.
 * @param {number} pct 깎을 퍼센트 포인트
 */
export function damageUpload(pct, x, y) {
  if (!state.file) return;

  const before = state.file.progress;
  state.file.progress = clamp(before - pct, 0, 100);
  state.stats.drainedPct += before - state.file.progress;

  addFloat(`-${Math.round(pct)}%`, x, y, false);
}

/**
 * 한 프레임 분의 업로드 처리:
 *  - A타입(stops_upload)이 하나라도 살아있으면 진행 정지
 *  - B타입은 atk_interval마다 한 방씩 (enemy.pendingAttack)
 */
export function updateUpload(dt, rules) {
  const blockers = [];
  let anyTelegraph = false;
  let hitThisFrame = false;

  for (const enemy of state.enemies) {
    if (enemy.stopsUpload) blockers.push(enemy.spec.name_kr || enemy.id);
    if (enemy.atkTelegraphRatio > 0) anyTelegraph = true;

    if (enemy.pendingAttack > 0) {
      hitThisFrame = true;
      damageUpload(enemy.pendingAttack * rules.dpsMultiplier, enemy.x, enemy.y);
    }
  }

  state.blocked = blockers.length > 0;
  state.blockedBy = blockers;
  state.attackWarning = anyTelegraph;
  state.hitFlash = Math.max(0, state.hitFlash - dt);
  if (hitThisFrame) state.hitFlash = config.hud.hitFlashSec;

  if (state.blocked) state.stats.blockedSec += dt;
  if (!state.file) return;

  if (!state.blocked) {
    state.file.progress = clamp(state.file.progress + (100 / state.file.timeSec) * dt, 0, 100);
  }

  if (state.file.progress >= 100) completeFile();
}
