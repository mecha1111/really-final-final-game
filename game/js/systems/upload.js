// 이 파일 역할: 업로드 바의 진행/정지/피해 계산. 방해꾼의 주기 공격이 여기로 들어온다.

import { config } from '../config.js';
import { state } from '../core/state.js';
import { addFloat } from './floats.js';
import { completeFile, grantFile } from './file.js';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/**
 * 피해 피드백을 한꺼번에 켠다 — 업로드 바 빨간 번쩍임 + 화면 가장자리 비네트 펄스 +
 * 바 옆에 뜨는 수치 텍스트. damageUpload()(즉발 피해)와 effects.js의 hidden 만료
 * (다음 파일 예약 피해, 지금 바를 안 건드리므로 damageUpload를 안 거친다)가 둘 다
 * 이 함수 하나만 부른다 — "당했다"는 신호를 한 곳에서만 켜야 종류가 늘어도
 * 빠뜨릴 일이 없다.
 * @param {string} text 바 옆에 띄울 텍스트(예: "-20%", "-15MB")
 */
export function triggerHitFeedback(text) {
  state.hitFlash = config.hud.hitFlashSec;
  state.vignetteMs = config.hud.vignettePulseSec * 1000;
  state.dmgFloatText = text;
  state.dmgFloatMs = config.hud.dmgFloatMs;
  // "새로 켜졌다"는 신호. dmgFloatMs 값 자체는 매 프레임 줄어들기만 해서 크기로는
  // "새로 켜진 순간"을 못 가려내는데, 이 값은 켤 때만 바뀌므로 ui/statusWindow.js가
  // 이 카운터의 변화만 보고 CSS 애니를 재시작(remove→reflow→add)한다.
  state.hitSeq += 1;
}

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
  triggerHitFeedback(`-${Math.round(pct)}%`);

  // 방금 깎이기 직전 값을 "손실분" 빨간 잔상으로 잠깐 남긴다(ui/statusWindow.js가
  // 그린다). 이미 더 큰 손실분이 표시 중이면(짧은 시간에 연타로 맞은 경우) 안
  // 줄어들게 max를 취한다 — 안 그러면 두 번째 타격이 첫 번째 잔상을 지워버린다.
  state.fileBarGhostRatio = Math.max(state.fileBarGhostRatio, before / 100);
  state.fileBarGhostMs = config.hud.barGhostMs;
}

/**
 * 한 프레임 분의 업로드 처리:
 *  - A타입(stops_upload)이 하나라도 살아있으면 진행 정지
 *  - B타입은 atk_interval마다 한 방씩 (enemy.pendingAttack)
 */
export function updateUpload(dt, rules) {
  // 완료 연출("해냈다" 반짝+팝+라벨) 유지 중 — 방금 끝난 파일은 이미 보상까지
  // 다 지급됐으니(systems/file.js의 completeFile) 더 이상 공격/정지 효과를
  // 받을 이유가 없다. blocked/attackWarning은 이 프레임엔 안 다시 정하고
  // 명시적으로 꺼둔다 — progress는 !blocked일 때만 오르므로 100%를 찍은 그
  // 프레임엔 이미 blocked였을 수 없어 안전하다. 홀드가 다 되면 다음 파일로
  // 넘어간다(grantFile) — completeFile()이 여기 대신 이걸 직접 안 부르는 이유는
  // systems/file.js의 completeFile() 주석 참고.
  if (state.fileCompleteHoldMs > 0) {
    state.fileCompleteHoldMs = Math.max(0, state.fileCompleteHoldMs - dt * 1000);
    state.blocked = false;
    state.attackWarning = false;
    state.hitFlash = Math.max(0, state.hitFlash - dt);
    state.vignetteMs = Math.max(0, state.vignetteMs - dt * 1000);
    state.dmgFloatMs = Math.max(0, state.dmgFloatMs - dt * 1000);
    if (state.dmgFloatMs <= 0) state.dmgFloatText = null;
    state.fileBarGhostMs = Math.max(0, state.fileBarGhostMs - dt * 1000);
    if (state.fileCompleteHoldMs <= 0) grantFile();
    return;
  }

  const blockers = [];
  let anyTelegraph = false;

  for (const enemy of state.enemies) {
    // 정지 원인 강조 표시(ui/renderEnemies.js)가 읽는 플래그. 매 프레임 다시
    // 정하므로 그 놈이 죽거나 사라지면 자동으로 꺼진다 — 별도 정리가 필요 없다.
    enemy.isBlocking = enemy.alive && enemy.stopsUpload;
    if (enemy.isBlocking) blockers.push(enemy.spec.name_kr || enemy.id);
    if (enemy.atkTelegraphRatio > 0) anyTelegraph = true;

    if (enemy.pendingAttack > 0) {
      damageUpload(enemy.pendingAttack * rules.dpsMultiplier, enemy.x, enemy.y);
    }
  }

  state.blocked = blockers.length > 0;
  state.blockedBy = blockers;
  state.attackWarning = anyTelegraph;

  // 피해 피드백 타이머들 감쇠. 전부 triggerHitFeedback()이 켜고 여기서만 줄어든다.
  state.hitFlash = Math.max(0, state.hitFlash - dt);
  state.vignetteMs = Math.max(0, state.vignetteMs - dt * 1000);
  state.dmgFloatMs = Math.max(0, state.dmgFloatMs - dt * 1000);
  if (state.dmgFloatMs <= 0) state.dmgFloatText = null;
  state.fileBarGhostMs = Math.max(0, state.fileBarGhostMs - dt * 1000);

  if (state.blocked) state.stats.blockedSec += dt;
  if (!state.file) return;

  if (!state.blocked) {
    state.file.progress = clamp(state.file.progress + (100 / state.file.timeSec) * dt, 0, 100);
  }
  // ★ 잔상을 여기서 따로 안 끈다 — fileBarGhostMs는 위에서 이미 dt만큼 깎이므로
  //   barGhostMs(550ms)가 지나면 자연히 사라진다. 진행이 다시 올라 잔상 비율을
  //   따라잡으면(짧은 파일에서 흔함) 렌더 쪽(ui/statusWindow.js)이 "잔상 폭이
  //   실제 진행보다 작다"고 계산해 스스로 안 그린다 — 별도 처리가 필요 없다.
  //   ★ 여기서 미리 0으로 지워버리면 안 되는 이유: damageUpload()가 이 함수의
  //   위쪽 루프(주기 공격)에서 이미 이번 프레임에 불렸을 수 있는데, 그때 막 켠
  //   잔상 타이머를 바로 아래에서 지워버려 잔상이 한 프레임도 안 보이고 사라진다
  //   (처음엔 "진행 중이면 지운다"를 여기 넣었었는데, 같은 프레임 순서 문제를
  //   코드를 다시 보다가 발견해서 뺐다 — 실행 순서를 놓친 내 실수였다).

  if (state.file.progress >= 100) completeFile();
}
