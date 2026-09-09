// 이 파일 역할: 업로드 바의 진행/정지/피해 계산. 방해꾼의 주기 공격이 여기로 들어온다.

import { config } from '../config.js';
import { state } from '../core/state.js';
import { addFloat } from './floats.js';
import { completeFile, grantFile } from './file.js';
import { playSfx, SFX } from './sound.js';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// ── "상태가 바뀌는 순간"만 소리를 내기 위한 직전 프레임 값 ──────────────────────
// state.blocked / state.attackWarning은 매 프레임 처음부터 다시 계산되는 값이라,
// 그 값만 봐서는 "지금 막 멈췄다"와 "아까부터 멈춰 있다"가 구분되지 않는다 —
// 그대로 소리를 걸면 정지가 이어지는 내내 매 프레임 울린다. 그래서 직전 프레임에
// 무엇이었는지를 여기 들고 있다가 false→true로 넘어가는 그 한 프레임에만 낸다.
//
// ★ state에 얹지 않고 모듈 안에 두는 이유: 이건 게임 상태가 아니라 "소리를 이미
//   냈는가"라는 이 파일만의 기억이다. 매 프레임 다시 정해지는 값을 공용 객체에
//   붙여두면 "누가 이걸 읽나"를 매번 다시 확인해야 한다(이 파일 아래쪽 blockers
//   주석에 같은 이유로 enemy.isBlocking을 걷어낸 전례가 있다).
// ★ 판이 바뀔 때는 반드시 resetUploadEdges()로 지워야 한다 — 정지된 채로 판이
//   끝나면 wasBlocked가 true로 남아, 다음 판에서 처음 멈출 때 소리가 안 난다.
let wasBlocked = false;
let wasTelegraph = false;

/** 새 판이 시작될 때(core/stageManager.js의 startGame). 지난 판의 엣지 기억을 끊는다. */
export function resetUploadEdges() {
  wasBlocked = false;
  wasTelegraph = false;
}

/**
 * state.blocked를 정하면서 "이번 프레임에 막 멈췄나"만 걸러 소리를 낸다.
 * blocked를 쓰는 곳이 두 군데(완료 연출 홀드 중 / 평상시)라 대입을 여기 하나로 모은다 —
 * 한쪽에서 직접 state.blocked에 대입해버리면 그 경로만 엣지 추적에서 빠져,
 * "완료 연출 직후 첫 정지에는 소리가 안 나는" 식으로 조용히 갈라진다.
 */
function setBlocked(next) {
  if (next && !wasBlocked) playSfx(SFX.UNPLUG_STOP);
  wasBlocked = next;
  state.blocked = next;
}

/** 위 setBlocked와 같은 이유로 attackWarning도 대입을 한 곳으로 모은다. */
function setAttackWarning(next) {
  if (next && !wasTelegraph) playSfx(SFX.ATK_WARNING);
  wasTelegraph = next;
  state.attackWarning = next;
}

/**
 * 피해 피드백을 한꺼번에 켠다 — 업로드 바 빨간 번쩍임 + 화면 가장자리 비네트 펄스 +
 * 바 옆에 뜨는 수치 텍스트. damageUpload()(즉발 피해)와 effects.js의 hidden 만료
 * (다음 파일 예약 피해, 지금 바를 안 건드리므로 damageUpload를 안 거친다)가 둘 다
 * 이 함수 하나만 부른다 — "당했다"는 신호를 한 곳에서만 켜야 종류가 늘어도
 * 빠뜨릴 일이 없다.
 * @param {string} text 바 옆에 띄울 텍스트(예: "-20%", "-15MB")
 * @param {{silent?: boolean}} [opts] silent:true면 공통 피격음(HIT)을 안 낸다.
 *   피해의 "정체"를 알리는 전용 소리를 이미 내는 이벤트(bomb 폭발, fake_btn 오클릭)가
 *   쓴다 — 그 위에 공통음까지 겹치면 전용 소리가 묻힌다. 시각 피드백(번쩍임·비네트·수치)은
 *   그대로 남는다.
 */
export function triggerHitFeedback(text, opts) {
  // "당했다"를 켜는 단 하나의 자리라, 공통 피격음도 여기 하나만 걸면 종류가 늘어도
  // 자동으로 따라온다. 다만 전용 소리를 이미 내는 이벤트(bomb/fake_btn)는 silent로
  // 와서 공통음을 얹지 않는다 — 겹치면 탁해지고 전용 소리가 묻히기 때문.
  if (!opts?.silent) playSfx(SFX.HIT);
  state.vignetteMs = config.hud.vignettePulseSec * 1000;
  state.dmgFloatText = text;
  state.dmgFloatMs = config.hud.dmgFloatMs;
  // "새로 켜졌다"는 신호. dmgFloatMs 값 자체는 매 프레임 줄어들기만 해서 크기로는
  // "새로 켜진 순간"을 못 가려내는데, 이 값은 켤 때만 바뀌므로 ui/statusWindow.js가
  // 이 카운터의 변화만 보고 CSS 애니를 재시작(remove→reflow→add)한다.
  state.hitSeq += 1;
}

/**
 * 업로드 바를 즉시 깎는다. 주기 공격, bomb 폭발, 함정 오클릭, 환경 방해(재부팅)가
 * 모두 이걸 쓴다 — 피해는 종류가 몇이든 이 함수 하나만 거친다(그래야 번쩍임·비네트·
 * 수치 표시를 종류마다 따로 챙기지 않아도 자동으로 붙는다).
 * @param {number} pct 깎을 퍼센트 포인트
 * @param {{silent?: boolean, cause?: string}} [opts]
 *   silent — triggerHitFeedback로 그대로 넘긴다(위 주석 참고).
 *   cause  — HUD 피해 캡션 앞에 붙일 원인 이름("재부팅 -15%"). 방해꾼에게 맞은 건
 *            화면에 그 놈이 보이니 원인이 자명하지만, 환경 방해처럼 "무엇 때문에
 *            깎였는지"가 안 보이는 경우엔 이름을 같이 띄워야 납득이 된다.
 *            ★ 진행 "정지" 배지(state.blocked)와는 무관하다 — 여기선 절대 안 건드린다.
 */
export function damageUpload(pct, x, y, opts) {
  if (!state.file) return;

  const before = state.file.progress;
  state.file.progress = clamp(before - pct, 0, 100);
  state.stats.drainedPct += before - state.file.progress;

  const label = `-${Math.round(pct)}%`;
  // 화면에 떠오르는 글씨(addFloat)는 짧아야 읽히므로 수치만, HUD 캡션에만 원인을 붙인다.
  addFloat(label, x, y, false);
  triggerHitFeedback(opts?.cause ? `${opts.cause} ${label}` : label, opts);

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
    setBlocked(false);
    setAttackWarning(false);
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
    // ★ 예전엔 이 결과를 enemy.isBlocking에 얹어뒀다 — ui/renderEnemies.js가
    //   그 놈 주위에 빨간 대시 테두리를 그리려고 읽던 값이다. 그 테두리를 없애면서
    //   읽는 쪽이 사라졌으므로 방해꾼 객체에 플래그를 남길 이유도 없어졌다(매 프레임
    //   다시 정해지는 값을 굳이 객체에 붙여두면 "누가 이걸 읽나"를 매번 다시
    //   확인해야 한다). 아래 blockers 목록이 유일한 소비처다.
    if (enemy.alive && enemy.stopsUpload) blockers.push(enemy.spec.name_kr || enemy.id);
    if (enemy.atkTelegraphRatio > 0) anyTelegraph = true;

    // ★state.uploadDamageDisabled — 스크린세이버가 화면을 완전히 잠가 클릭
    //   자체가 불가능한 동안만 켜진다(core/state.js 주석 참고). 그 사이에도
    //   enemy.pendingAttack은 평소처럼 계속 채워지지만(이 hazard가 방해꾼의
    //   공격 타이머를 건드리지 않는다 — "환경 방해는 업로드를 안 건드린다"는
    //   절대 규칙을 지키려면 방해꾼 쪽 로직도 그대로 둬야 한다), 그 값을 여기서
    //   damageUpload로 옮기지만 않으면 된다 — enemy.update()가 다음 프레임에
    //   pendingAttack을 다시 0으로 리셋하므로(Enemy.js) "밀린 피해가 나중에
    //   한꺼번에 터진다" 같은 빚도 안 생긴다.
    if (enemy.pendingAttack > 0 && !state.uploadDamageDisabled) {
      damageUpload(enemy.pendingAttack * rules.dpsMultiplier, enemy.x, enemy.y);
    }
  }

  setBlocked(blockers.length > 0);
  state.blockedBy = blockers;
  setAttackWarning(anyTelegraph);

  // 피해 피드백 타이머들 감쇠. 전부 triggerHitFeedback()이 켜고 여기서만 줄어든다.
  state.vignetteMs = Math.max(0, state.vignetteMs - dt * 1000);
  state.dmgFloatMs = Math.max(0, state.dmgFloatMs - dt * 1000);
  if (state.dmgFloatMs <= 0) state.dmgFloatText = null;
  state.fileBarGhostMs = Math.max(0, state.fileBarGhostMs - dt * 1000);

  if (state.blocked) state.stats.blockedSec += dt;
  if (!state.file) return;

  // ★튜토리얼 중에는 진행바를 언제 올릴지 튜토리얼이 정한다(state.tutorial.uploadAuto).
  //   1~3단계는 켜둔 채로 실제로 차오르는 걸 보여주고, 상한(config.tutorial.uploadCapPct)에
  //   닿거나 "놔두면 깎인다" 단계에 들어가면 끈다 — 끄는 이유가 둘이다:
  //     · 100%에 닿으면 파일이 완성되며 다음 파일로 넘어가 버린다(설명 도중 화면이 바뀐다)
  //     · 깎이는 걸 보여주는 단계에서 동시에 차오르면 "되돌아간다"가 안 보인다
  //   실전에서는 state.tutorial.active가 false라 이 조건이 통째로 사라진다.
  //   ★상한(천장)은 대본이 아니라 여기서 지킨다 — 대본이 어느 단계에 머물러 있든,
  //     또 사용자가 설명을 얼마나 오래 읽든 100%에 닿는 일 자체가 없어야 한다.
  //     대본의 uploadAuto는 "지금 일부러 멈춘다"(4단계)를 표현할 뿐이다.
  //   ★천장은 조건이 아니라 clamp로 건다 — "넘었으면 그만"으로 쓰면 마지막 한
  //     프레임이 천장을 살짝 넘긴 채로 굳는다(실측 55.05). 값이 정확히 천장에
  //     서야 4단계의 감소분을 눈으로 셀 수 있다.
  const ceilPct = state.tutorial.active ? config.tutorial.uploadCapPct : 100;
  const autoOk = !state.tutorial.active || state.tutorial.uploadAuto;
  if (!state.blocked && autoOk) {
    state.file.progress = clamp(state.file.progress + (100 / state.file.timeSec) * dt, 0, ceilPct);
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
