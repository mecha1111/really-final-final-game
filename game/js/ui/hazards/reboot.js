// 이 파일 역할: 환경 방해 A — "재부팅 카운트다운". XP 자동 업데이트의 재시작 알림
// (시스템 설정 변경 대화상자)을 그대로 흉내 낸다. 화면 한가운데를 차지해서 그 아래
// 방해꾼을 가리는 게 이 방해의 본체다.
//
// 생김새는 기존 XP 창 스타일을 그대로 재사용한다(.win/.tbar/.ico/.t, 버튼은
// .settings-btn) — 설정 팝업(.layer-settings)이 이미 쓰는 방식과 같다. 새 회색조
// 팔레트를 또 만들지 않는다.
//
// ── ★ 단일 정착 가드 (이 방해에만 있는 문제) ────────────────────────────────
// 해제 경로가 셋이고 그중 둘이 벌칙을 부른다:
//   [지금 다시 시작] → 즉시 -15% (함정 버튼)
//   [나중에]        → 벌칙 없음 (유일한 안전한 선택)
//   방치(카운트다운 만료) → -15%
// 버튼 클릭(DOM 이벤트)과 만료(rAF 갱신 루프)는 서로 다른 태스크라, 거의 동시에
// 일어나면 "벌칙이 두 번" 또는 "이미 닫힌 창에 뒤늦게 벌칙"이 될 수 있다. 그래서
// 벌칙을 버튼 핸들러에 두지 않고 onEnd() 한 곳으로 모으고, 거기에 settled 빗장을
// 건다 — 셋 중 먼저 도착한 경로 하나만 반영된다.
// (프레임워크의 endHazard도 이미 인스턴스를 배열에서 빼며 중복 호출을 막지만,
//  벌칙 같은 되돌릴 수 없는 효과는 그 성질에 기대지 않고 여기서 한 번 더 못박는다.)

import { config } from '../../config.js';
import { fileIcon } from '../fileIcons.js';
import { registerHazard, dismissHazard } from '../../systems/hazard.js';
import { damageUpload } from '../../systems/upload.js';
import { playSfx, SFX } from '../../systems/sound.js';
import { icon } from '../icons.js';

/** 남은 초 → XP 대화상자 표기("00:09"). */
function mmss(totalSec) {
  const s = Math.max(0, Math.ceil(totalSec));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/** 벌칙을 부르는 해제 사유. 나머지(나중에/판 리셋/설정 끄기)는 아무 일도 안 한다. */
const PENALTY_REASONS = new Set(['timeout', 'restart']);

registerHazard({
  id: 'reboot',
  get minStage() {
    return config.hazard.reboot.minStage;
  },
  // 방치 = 카운트다운 만료. 프레임워크가 이 시간에 'timeout'으로 끝내준다.
  get durationSec() {
    return config.hazard.reboot.countdownSec;
  },
  dismiss: 'button',

  mount(inst) {
    const c = config.hazard.reboot;

    const root = document.createElement('div');
    root.className = 'hz-center';

    // 창 자체만 pointer-events:auto(style.css) — 이 창 바깥을 누른 클릭은 평소처럼
    // 캔버스의 방해꾼 판정으로 그대로 내려간다.
    root.innerHTML = `
      <div class="win hz-win hz-reboot">
        <div class="tbar">
          <div class="ico">!</div>
          <div class="t">시스템 설정 변경</div>
        </div>
        <div class="hz-body">
          <div class="hz-row">
            <div class="hz-shield">${icon('shield', 46)}</div>
            <div class="hz-msg">
              <p>업데이트를 완료하려면 컴퓨터를 다시 시작해야 합니다.</p>
              <p class="hz-sub">다시 시작하기까지 남은 시간:</p>
              <p class="hz-count">${mmss(c.countdownSec)}</p>
            </div>
          </div>
          <div class="hz-foot">
            <button type="button" class="settings-btn settings-btn-primary hz-restart">지금 다시 시작</button>
            <button type="button" class="settings-btn hz-later">나중에</button>
          </div>
        </div>
      </div>
    `;

    inst.data.countEl = root.querySelector('.hz-count');
    // ★ 벌칙은 여기서 직접 주지 않는다 — 사유만 붙여 해제하고, 실제 효과는 onEnd가
    //   settled 빗장 뒤에서 딱 한 번 준다(위 단일 정착 가드 주석).
    root.querySelector('.hz-restart').addEventListener('click', () => dismissHazard(inst, 'restart'));
    root.querySelector('.hz-later').addEventListener('click', () => dismissHazard(inst, 'later'));

    inst.el = root;
    playSfx(SFX.ENTRANCE_WINDOW); // XP 창이 열리는 그 소리를 그대로 재사용
  },

  update(inst) {
    const left = this.durationSec - inst.age;
    const next = mmss(left);
    // 값이 바뀐 초에만 DOM을 건드린다(매 프레임 textContent 대입은 낭비).
    if (inst.data.countText !== next) {
      inst.data.countText = next;
      if (inst.data.countEl) inst.data.countEl.textContent = next;
    }
  },

  onEnd(inst, reason) {
    if (inst.data.settled) return; // ★ 단일 정착 — 먼저 온 경로 하나만 반영
    inst.data.settled = true;
    if (!PENALTY_REASONS.has(reason)) return;

    const c = config.hazard.reboot;
    // 피해는 반드시 damageUpload → triggerHitFeedback 한 줄기로만 보낸다
    // (번쩍임·비네트·"-15%" 표시가 자동으로 따라온다). cause를 넘겨 HUD 캡션에
    // "재부팅 -15%"로 원인을 밝힌다 — 진행 정지 배지(state.blocked)는 안 건드린다.
    damageUpload(c.penaltyPct, config.canvas.width / 2, config.canvas.height / 2, {
      cause: c.penaltyCause,
    });
  },

  // ★전조 — 실물 XP 자동업데이트가 그랬듯 트레이에 방패가 먼저 뜬다.
  //   "곧 재시작 알림이 온다"만 알려주고 막을 수단은 주지 않는다(전조의 원칙).
  //   아이콘은 0번 커밋에서 만든 파일 아이콘 카탈로그의 shield를 그대로 쓴다 —
  //   UI 크롬용 icons.js의 단색 방패가 아니라 다색 아이소메트릭 쪽이라야
  //   "실물 XP 트레이"로 읽힌다.
  //
  // ★ 2026-09-09(승인분) — 트레이 XP 풍선 도움말로 "무엇이 오는지" 이름을 밝힌다
  //   (전조 규격 통일, config.hazard.telegraphSec 주석 참고). 방패 아이콘(오른쪽
  //   아래 트레이)과 풍선(왼쪽 아래)이 자리가 달라 wrapper 하나로 같이 묶는다 —
  //   .hz-tele-shield 혼자는 30x30짜리 자기 위치(right/bottom)만 있는 상자라,
  //   그 안에 .hz-balloon(자기 left/bottom을 쓰는 요소)을 그냥 넣으면 그 30x30
  //   상자를 기준으로 다시 밀려서 자리가 어긋난다 — wrapper를 inset:0으로 둬서
  //   두 자식 모두 화면 전체를 기준으로 자기 위치를 잡게 한다(style.css의
  //   .hz-tele-reboot).
  telegraph: {
    mount(t) {
      const el = document.createElement('div');
      el.className = 'hz-tele-reboot';
      el.innerHTML = `
        <div class="hz-tele-shield">${fileIcon('shield', 22)}</div>
        <div class="hz-balloon hz-tele-balloon">
          <div class="hz-balloon-ico">${icon('shield', 26)}</div>
          <div class="hz-balloon-txt"><b>재시작 알림이 표시됩니다</b></div>
        </div>
      `;
      t.el = el;
      playSfx(SFX.UI_OPEN, { ui: true });
    },
  },
});
