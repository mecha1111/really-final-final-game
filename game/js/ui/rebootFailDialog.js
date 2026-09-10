// 이 파일 역할: 재부팅 카운트다운 오답(재시작 버튼)/방치(만료) 실패 피드백 —
// XP 시스템 대화상자 한 장(ui/hazards/reboot.js의 onEnd가 부른다).
//
// 왜 필요했나: 기존엔 공통 피해 연출(번쩍임·비네트·"-8%")만 뜨고 끝나서
// "내가 뭘 잘못했는지"가 안 보였다 — trapDialog.js(fake_btn 함정)가 겪었던
// 문제와 정확히 같다.
//
// ★ trapDialog.js와 완전히 같은 성격의 물건이다: 게임 상태를 안 건드리는
//   순수 UI 토스트, pointer-events:none, setTimeout으로 스스로 닫힌다. 새
//   파일로 따로 둔 이유도 ui/infiniteBanner.js 상단 주석과 같다 — 메시지가
//   재사용 대상(trapDialog)과 달라서, 그 파일을 매번 다시 조립하게 고치느니
//   같은 패턴을 그대로 복제하는 쪽이 더 단순하다.
// ★ trapDialog.js와 다른 점 하나: 이쪽은 오답/방치 두 경로가 서로 다른 첫
//   줄을 쓴다. 그래서 고정 innerHTML 한 번으로 안 끝나고, 메시지 <p> 요소만
//   미리 잡아둔 뒤 show() 때마다 textContent만 새로 넣는다(reboot.js의
//   hz-count가 매 프레임 textContent만 바꾸는 것과 같은 이유 — 구조는 고정,
//   내용만 갱신).
// ★ sfx는 이 파일이 직접 안 낸다 — fake_btn 쪽(systems/input.js)이 "sfx →
//   damageUpload(silent) → showTrapDialog" 순서로 호출부에서 직접 조합하는
//   것과 같은 자리(ui/hazards/reboot.js의 onEnd)에서 같이 맞춘다.

import { config } from '../config.js';
import { onPhaseChange } from '../core/state.js';
import { icon } from './icons.js';

const MESSAGE_HEAD = {
  restart: '다시 시작을 눌렀습니다',
  timeout: '응답하지 않아 재시작되었습니다',
};

let layerEl = null;
let msgEl = null;
let hideTimer = 0;

/** 최초 1회(main.js). 레이어를 잡아두고 고정 뼈대를 한 번만 만든다. */
export function initRebootFailDialog() {
  layerEl = document.getElementById('layer-rebootfail');
  if (!layerEl) return;

  const winEl = document.createElement('div');
  winEl.className = 'win reboot-fail-dlg';
  // 본문 뼈대는 trapDialog.js의 .trap-dlg-body/-ico/-msg/-sub/-foot을 그대로
  // 물려쓴다(클래스 이름이 fake_btn 전용이 아니라 이미 범용이라 CSS를 새로
  // 안 만들어도 된다) — .reboot-fail-dlg 자신은 위치(가운데 정렬 방식이
  // trap-dlg와 다르다, style.css 주석 참고)만 따로 갖는다.
  winEl.innerHTML = `
    <div class="tbar">
      <div class="ico">!</div>
      <div class="t">시스템</div>
    </div>
    <div class="trap-dlg-body">
      <div class="trap-dlg-ico">${icon('warning', 40)}</div>
      <div class="trap-dlg-msg">
        <p class="reboot-fail-msg"></p>
        <p class="trap-dlg-sub">「나중에」가 정답이었습니다.</p>
      </div>
    </div>
    <div class="trap-dlg-foot">
      <button type="button" class="settings-btn settings-btn-primary" tabindex="-1">확인</button>
    </div>
  `;
  layerEl.appendChild(winEl);
  msgEl = winEl.querySelector('.reboot-fail-msg');

  // 판이 'playing'을 벗어나면 즉시 치운다(trapDialog.js와 같은 이유·같은 자리).
  onPhaseChange((next) => {
    if (next !== 'playing') hideRebootFailDialog();
  });
}

/**
 * reboot.js의 onEnd(inst, reason)가 부른다. reason은 PENALTY_REASONS에 걸린
 * 'restart' | 'timeout' 둘 중 하나만 온다(그 외 사유는 onEnd가 애초에 여기까지
 * 안 부른다).
 */
export function showRebootFailDialog(reason) {
  if (!layerEl || !msgEl) return;
  const head = MESSAGE_HEAD[reason] ?? MESSAGE_HEAD.timeout;
  msgEl.textContent = `${head} — 업데이트 ${config.hazard.reboot.penaltyPct}% 손실`;
  layerEl.classList.add('open');

  clearTimeout(hideTimer);
  hideTimer = setTimeout(hideRebootFailDialog, config.hazard.reboot.failDialogHoldMs);
}

export function hideRebootFailDialog() {
  clearTimeout(hideTimer);
  hideTimer = 0;
  layerEl?.classList.remove('open');
}
