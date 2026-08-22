// 이 파일 역할: "이대로면 실패한다"를 게임 중 실시간으로 알리는 긴박 경고.
//
// 지금까지는 클리어/게임오버 화면이 떠야 비로소 "성공했는지 실패했는지"를 알았다
// — 클릭이 바쁜 게임이라 정작 게임 중엔 "구간 전체 할당량 대비 얼마나 왔나"를
// 볼 여유가 없었던 탓이다. 여기는 남은 시간이 얼마 없는데 할당량이 한참 못
// 미치면 그 사실 자체를 화면·소리로 밀어붙인다 — "지금 위험하다"를 계산해서
// state.urgent 하나에 담아두면, ui/statusWindow.js는 그 값만 보고 CSS 클래스를
// 토글하면 된다(값 자체의 계산은 전부 여기 한 곳에서 끝난다).

import { config } from '../config.js';
import { state } from '../core/state.js';
import { playSfx, SFX } from './sound.js';

// 긴박/거의다옴 상태의 "직전 프레임" 기억 — 둘 다 매 프레임 다시 계산되는
// 값이라, 그대로 소리를 걸면 상태가 이어지는 내내 울린다. false→true로 넘어가는
// 그 한 프레임에만 소리를 낸다(systems/upload.js의 setBlocked와 같은 엣지 패턴).
let wasUrgent = false;
let wasNearGoal = false;

/** 새 판이 시작될 때(core/stageManager.js의 startGame). 지난 판의 엣지 기억을 끊는다. */
export function resetUrgencyEdges() {
  wasUrgent = false;
  wasNearGoal = false;
}

/**
 * 매 프레임(core/stageManager.js의 update, phase==='playing'일 때만). state.urgent/
 * state.nearGoal을 다시 계산해 넣는다 — 둘 다 ui/statusWindow.js가 읽어서 CSS
 * 클래스만 토글하므로, 시각 연출 자체는 style.css의 @keyframes에 전부 있다.
 * @param {object} rules 이번 판 규칙(quota를 읽는다)
 */
export function updateUrgency(rules) {
  const c = config.urgency;
  const quotaRatio = rules.quota > 0 ? state.uploaded / rules.quota : 0;

  // 시간이 다 돼서(<=0) 이미 checkWinLose가 이번 프레임에 판을 끝낼 상황이면
  // urgent를 새로 켤 이유가 없다 — 어차피 다음 프레임엔 이 함수 자체가 안 불린다
  // (update()가 phase!=='playing'에서 막힌다). 0 이하를 명시적으로 걸러 그 찰나의
  // 프레임에 "위험!"이 잘못 반짝이지 않게 한다.
  const urgent = state.timeLeft > 0 && state.timeLeft <= c.timeThresholdSec && quotaRatio < c.quotaRatioThreshold;
  if (urgent && !wasUrgent) playSfx(SFX.TIME_TICK); // 엣지: 위험 상태 진입 순간 1회
  wasUrgent = urgent;
  state.urgent = urgent;

  // 긍정 신호(선택 요구사항) — quotaRatio가 1을 넘는(막 완료를 스친) 프레임까지
  // 켜질 이유는 없으니 위쪽도 막아둔다. urgent와 동시에 켜질 수 없게 임계를
  // 넉넉히 띄워뒀다(config.urgency 주석 참고) — 그래도 이론상 겹치면 style.css가
  // urgent 쪽 색을 우선하도록 클래스 순서를 잡아뒀다.
  const nearGoal = quotaRatio >= c.nearGoalRatio && quotaRatio < 1;
  if (nearGoal && !wasNearGoal) playSfx(SFX.COMBO_TIER); // 엣지: 진입 순간만, 짧고 밝은 상승음 재사용
  wasNearGoal = nearGoal;
  state.nearGoal = nearGoal;
}
