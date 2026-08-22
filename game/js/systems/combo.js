// 이 파일 역할: 콤보(연속 정확 처치) 카운터와 그 보상인 "처치 MB" 지급.
//
// 콤보는 점수가 아니다 — 오직 처치 MB의 배율로만 쓰인다. 방해꾼을 클릭으로 잡을
// 때마다 config.combo.killMb를 주고, 콤보가 높을수록 거기 곱하는 배율이 커진다.
// 그래서 "정확하게 연속으로 잡는 실력"이 곧 할당량을 빨리 채우는 길이 된다.
//
// ★ 쌓임/끊김 규칙은 systems/input.js의 클릭 판정 한 곳에서만 부른다. 클릭 하나가
//   곧 콤보 사건 하나이므로, 판정하는 그 자리에서 바로 부르는 게 순서를 정확히
//   지키는 유일한 방법이다 — 예를 들어 core/stageManager.js의 processDeaths(죽은
//   놈 뒤처리, stats.killed를 세는 곳)에서 대신 세면 "잡은 클릭"과 "허공 클릭"이
//   프레임 경계를 사이에 두고 뒤바뀔 수 있다(잡고 나서 바로 헛클릭하면 처치가
//   다음 프레임에 처리돼 콤보가 0이 아니라 1이 된다).

import { config } from '../config.js';
import { state } from '../core/state.js';
import { addFloat } from './floats.js';

/**
 * 지금 콤보에서 나오는 MB 배율. config.combo.tiers에서 조건(combo >= min)을
 * 만족하는 **마지막** 칸이 이긴다 — 표가 min 오름차순이라는 전제다(config 주석).
 * 표의 마지막 칸이 곧 상한이라 콤보가 아무리 올라도 그 위로는 안 간다.
 */
export function comboMultiplier(combo = state.combo) {
  let mult = 1;
  for (const tier of config.combo.tiers) {
    if (combo >= tier.min) mult = tier.mult;
  }
  return mult;
}

/**
 * 방해꾼을 클릭으로 잡았다. 콤보를 올리고 그만큼의 MB를 지급한다.
 *
 * MB는 state.uploaded(누적 업로드 용량)에 직접 더한다 — 파일 완료 보상
 * (systems/file.js의 completeFile)이 쓰는 것과 **같은 그릇**이라, 할당량 바
 * (상태.dat의 st-quotabar)와 승리 판정(core/stageManager.js의 checkWinLose)에
 * 자동으로 함께 반영된다. 별도의 "콤보 게이지" 같은 걸 두지 않는 이유다.
 *
 * ★ 지금 올리는 중인 파일의 진행률(file.progress, %)은 안 건드린다. 그건 "이
 *   파일이 얼마나 올라갔나"라서 처치와 무관하고, 여기서 밀어주면 파일이 저절로
 *   완성되며 completeFile의 보상까지 중복으로 나간다.
 *
 * @param {number} x 잡힌 자리(월드 좌표) — "+0.45MB" 글씨를 그 자리에 띄운다
 */
export function registerKill(x, y) {
  const before = comboMultiplier();

  state.combo += 1;
  state.comboPopSeq += 1;
  state.comboBreakMs = 0; // 끊김 연출이 남아있었다면 새 콤보가 덮는다
  if (state.combo > state.stats.comboBest) state.stats.comboBest = state.combo;

  const mult = comboMultiplier();
  const mb = config.combo.killMb * mult;
  state.uploaded += mb;
  state.stats.killMb += mb;
  addFloat(`+${mb.toFixed(2)}MB`, x, y, true);

  // 배율 계단을 새로 밟은 순간에만 "x1.5!" 강조를 띄운다. 값이 실제로 바뀌었을
  // 때만이라 x1.5에 도달한 뒤 계속 잡아도 다시 뜨지 않는다.
  if (mult !== before) {
    state.comboTierText = `x${mult}!`;
    state.comboTierMs = config.combo.tierFlashMs;
    state.comboTierSeq += 1;
  }
}

/**
 * 콤보가 끊긴다. 부르는 쪽은 systems/input.js뿐이고, 끊기는 조건은 "허공 클릭"
 * 하나뿐이다 — 아무 방해꾼도 없는 자리를 눌렀을 때.
 *
 * ★ bait(가짜)를 눌러도 끊긴다. 별도 분기가 있어서가 아니라, bait는 시트에서
 *   hit_w/hit_h가 0이라 클릭 판정 자체가 없어서 그 클릭이 곧 허공 클릭이기
 *   때문이다 — "가짜에 속으면 손을 낭비한다"는 bait의 존재 이유가 판정 구조에
 *   이미 들어있는 셈이다. 나중에 bait에 히트박스를 주게 되면 이 성질이 조용히
 *   사라지므로, 그때는 여기서 명시적으로 끊어야 한다.
 *
 * ★ 끊기지 **않는** 것들과 그 이유:
 *   - 피격(방해꾼에게 얻어맞음): 이미 진행도가 깎인다. 콤보까지 뺏으면 한 번의
 *     실수에 벌이 두 번 나가는 셈이라 안 끊는다.
 *   - 함정(fake_btn) 오클릭: 마찬가지로 이미 진행도가 깎인다(-10%). 위와 같은 이유.
 *   - 안 죽는 유효타(ransom처럼 hp가 여러 개라 아직 안 죽은 클릭): 빗맞힌 게
 *     아니라 제대로 맞힌 것이다. 콤보가 안 오를 뿐 끊길 이유는 없다.
 *   - popup 몸통 클릭(X가 아닌 곳): 방해꾼을 누르긴 눌렀고 흔들림으로 이미
 *     "여기가 아니다"라고 알려준다.
 *
 * 이미 0이면 아무 일도 안 한다 — 안 그러면 빈 화면을 연타할 때마다 끊김 연출이
 * 계속 다시 재생된다.
 */
export function registerMiss() {
  if (state.combo <= 0) return;
  state.combo = 0;
  state.comboBreakMs = config.combo.breakMs;
  state.comboBreakSeq += 1;
  state.comboTierMs = 0;
  state.comboTierText = null;
}

/** 매 프레임. 연출 타이머만 깎는다(콤보 값 자체는 시간으로 안 줄어든다). */
export function updateCombo(dt) {
  if (state.comboBreakMs > 0) state.comboBreakMs = Math.max(0, state.comboBreakMs - dt * 1000);
  if (state.comboTierMs > 0) {
    state.comboTierMs = Math.max(0, state.comboTierMs - dt * 1000);
    if (state.comboTierMs <= 0) state.comboTierText = null;
  }
}

/** 새 판이 시작될 때(core/stageManager.js의 startGame). 연출 잔여까지 확실히 끊는다. */
export function clearCombo() {
  state.combo = 0;
  state.comboBreakMs = 0;
  state.comboTierMs = 0;
  state.comboTierText = null;
}
