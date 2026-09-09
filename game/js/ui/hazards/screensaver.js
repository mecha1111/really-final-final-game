// 이 파일 역할: 환경 방해 B — "스크린세이버". ★XP 기본 텍스트 마퀴 화면 보호기를
// 그대로 흉내 낸다. 순수 검정 화면 위에 흰 글자 "화면을 보호하고 있습니다"가
// 오른쪽에서 왼쪽으로 흐르다 화면 밖으로 나가면 반대편에서 다시 들어온다.
//
// ★ 2026-09-09 재설계 — 예전엔 Mystify(다각형+잔상)였다. 그건 화려해서 오히려
//   "장식 연출"로 읽혔다 — 순수 검정 + 흰 글자 하나뿐인 이 화면이 훨씬 "진짜로
//   화면이 잠겼다"는 느낌을 준다. 완전 암전이라(예전의 --hz-saver-dim으로
//   방해꾼을 살짝 비치게 하던 타협을 버렸다) 방해꾼이 전혀 안 비친다 — 이건
//   실수가 아니라 XP 실물 마퀴를 그대로 재현하는 선택이다.
//
// ★ 해제 클릭이 방해꾼을 잘못 죽이지 않는 이유: 이 막 자체가 pointer-events:auto라
//   (style.css의 .hz-saver) 클릭을 통째로 삼킨다 — 캔버스는 그 이벤트를 아예 못 받는다.
//   프레임워크가 dismiss:'click'을 보고 이 요소에 직접 핸들러를 걸어준다
//   (systems/hazard.js의 triggerHazard 참고).
//
// ★ 잠긴 동안 업로드가 깎이면 안 된다 — 클릭이 전부 이 막에 먹혀서 방해꾼을
//   손쓸 방법이 없는 유일한 hazard라, 그 사이 적의 주기 공격까지 그대로
//   맞으면 "못 하는데 맞기만" 하게 된다. state.uploadDamageDisabled를 켜고 끄는
//   것으로 막는다(systems/upload.js가 읽는다, core/state.js 주석 참고).
//
// ★ 마퀴는 텍스트라 캔버스 2D가 아니라 DOM으로 그린다 — 다른 hazard 풍선
//   (.hz-balloon)과 같은 결이고, 특히 이 게임의 DGM 픽셀폰트는 캔버스에 그리면
//   래스터라이즈가 브라우저마다 갈릴 수 있어(이 프로젝트의 반복된 함정) 진짜
//   텍스트 노드로 두는 쪽이 안전하다.
//
// ★ 좌표계 — #desktop의 1920×1080 기준 그대로다. .hz-saver는 .layer-hazard와
//   같은 inset:0이라 그 자식(마퀴 텍스트)의 offsetWidth/offsetLeft는 곧
//   #desktop 좌표계 값이다(다른 hazard가 이미 쓰는 관례 — offsetLeft 사슬이
//   transform 배율의 영향을 안 받는다, ui/tutorialSpotlight.js 상단 주석에
//   더 자세한 근거가 있다). 그래서 rect를 잴 필요도, 배율을 나눌 필요도 없다.
//
// ★ 움직임은 부드럽게 흘리지 않는다 — 8px(config.stepPx) 단위로 끊어 이동한다
//   (기준서의 계단식 원칙). setTimeout/CSS transition을 안 쓰고 dt를 누적해
//   "몇 단계째인가"만 계산한다 — 값이 실제로 바뀐 프레임에만 style.left를 쓴다.

import { config } from '../../config.js';
import { registerHazard } from '../../systems/hazard.js';
import { state } from '../../core/state.js';
import { playSfx, SFX } from '../../systems/sound.js';
import { icon } from '../icons.js';

const REF_W = config.canvas.uiBaseWidth; // #desktop 좌표계 폭(1920) — 다른 hazard와 같은 기준

registerHazard({
  id: 'screensaver',
  get minStage() {
    return config.hazard.screensaver.minStage;
  },
  get durationSec() {
    return config.hazard.screensaver.durationSec;
  },
  // 아무 데나 클릭 1회 — 프레임워크가 이 요소에 직접 배선한다(위 주석).
  dismiss: 'click',

  mount(inst) {
    const c = config.hazard.screensaver;

    const el = document.createElement('div');
    el.className = 'hz-saver';
    el.innerHTML = `
      <div class="hz-saver-text"></div>
      <div class="hz-saver-hint">아무 곳이나 클릭하면 돌아갑니다</div>
    `;
    el.style.setProperty('--hz-saver-font-px', `${c.fontSizePx}px`);
    el.style.setProperty('--hz-saver-hint-font-px', `${c.hintFontSizePx}px`);
    el.style.setProperty('--hz-saver-hint-bottom-px', `${c.hintBottomPx}px`);

    const textEl = el.querySelector('.hz-saver-text');
    textEl.textContent = '화면을 보호하고 있습니다';

    inst.data.textEl = textEl;
    inst.data.hintEl = el.querySelector('.hz-saver-hint');
    // ★텍스트 폭은 마운트 시점엔 못 잰다 — 이 el이 아직 문서에 안 붙어 있어서
    //   (프레임워크가 mount() 리턴 뒤에 appendChild한다) offsetWidth가 0으로
    //   나온다. 첫 update() 프레임에서 잰다(그때는 이미 붙어 있다).
    inst.data.measured = false;
    inst.data.traveled = 0; // 이번 횡단에서 흐른 거리(desktop px, 연속값)
    inst.data.distance = 0; // 한 바퀴 총 거리 = REF_W + 텍스트 폭
    inst.data.speed = 0; // desktop px/초
    inst.data.lastStepX = null; // 직전에 실제로 그린 x — 같으면 DOM을 또 안 건드린다
    inst.data.hintShown = false;

    inst.el = el;
    // ★클릭이 이 막에 전부 먹혀 방해꾼을 손쓸 수 없는 동안, 적의 주기 공격이
    //   대신 업로드를 깎지 못하게 막는다(위 파일 머리 주석·core/state.js 참고).
    //   onEnd에서 반드시 false로 되돌린다 — 사유가 무엇이든 onEnd는 항상 불린다.
    state.uploadDamageDisabled = true;
    playSfx(SFX.KILL_HIDDEN);
  },

  update(inst, dt) {
    const c = config.hazard.screensaver;
    const textEl = inst.data.textEl;

    if (!inst.data.measured) {
      // ★1회 횡단 = "화면 밖 오른쪽"에서 "화면 밖 왼쪽"까지, 텍스트 폭까지 합친
      //   전체 이동거리다(고전 마퀴의 정의 그대로) — 화면 폭만 놓고 재면 텍스트가
      //   길수록 실제 체감 속도가 빨라져 traverseSec이 거짓말이 된다.
      const textW = textEl.offsetWidth;
      inst.data.distance = REF_W + textW;
      inst.data.speed = inst.data.distance / c.traverseSec;
      inst.data.measured = true;
      // 시작 자리 — 텍스트 왼쪽 끝이 화면 오른쪽 바깥에 걸쳐 있다(완전히 안 보임).
      textEl.style.left = `${REF_W}px`;
      inst.data.lastStepX = REF_W;
      return; // 이 프레임은 위치만 잡고, 실제 이동은 다음 프레임부터.
    }

    inst.data.traveled += inst.data.speed * dt;
    // ★화면 밖으로 완전히 나가면(왼쪽 끝까지) 그 자리에서 반대편(오른쪽 밖)으로
    //   다시 진입한다 — 순간이동처럼 보이지 않는 이유는 그 순간 텍스트가 이미
    //   화면 양쪽 다 벗어난 상태라 아무것도 안 보이기 때문이다.
    if (inst.data.traveled >= inst.data.distance) inst.data.traveled -= inst.data.distance;

    // ★계단식 — 연속값(traveled)은 내부적으로만 쓰고, 화면에는 stepPx의 배수로
    //   내림한 값만 반영한다. dt가 프레임마다 들쭉날쭉해도(60/120Hz 등) 누적값
    //   자체는 시간에 정확히 비례하므로 "6초에 한 바퀴"는 프레임레이트와 무관하다.
    const stepped = Math.floor(inst.data.traveled / c.stepPx) * c.stepPx;
    const x = REF_W - stepped;
    if (x !== inst.data.lastStepX) {
      inst.data.lastStepX = x;
      textEl.style.left = `${x}px`;
    }

    if (!inst.data.hintShown && inst.age >= c.hintDelaySec) {
      inst.data.hintShown = true;
      // ★hidden 속성이 아니라 클래스 — 이 프로젝트가 두 번 겪은 함정(display가
      //   박힌 규칙에 [hidden]이 특이도로 밀린다)을 피한다.
      inst.data.hintEl.classList.add('on');
    }
  },

  onEnd() {
    // ★사유(클릭 해제/시간 만료/판 리셋) 무관하게 항상 끈다 — 판이 끝나는 순간
    //   이 값이 true로 굳으면 다음 판 첫 공격부터 피해가 조용히 안 들어간다.
    state.uploadDamageDisabled = false;
    // ★요구사항: 해제음 없음. 실제 XP 화면 보호기도 클릭으로 깨어날 때 별도
    //   효과음이 없다 — 조용히 원래 화면으로 돌아가는 것 자체가 "정상으로
    //   복귀했다"는 신호다.
  },

  // ★전조 — 본 효과의 축소판 그대로: 화면이 아주 짧게 한 번 어두워졌다 돌아온다.
  //
  // ★ 2026-09-09(승인분) — 트레이 XP 풍선 도움말로 "무엇이 오는지" 이름을 밝힌다
  //   (전조 규격 통일, config.hazard.telegraphSec 주석 참고). 아이콘은 lock —
  //   "화면이 잠긴다"는 이 방해의 본질과 맞는다.
  telegraph: {
    mount(t) {
      const el = document.createElement('div');
      el.className = 'hz-tele-dim';
      el.innerHTML = `
        <div class="hz-balloon hz-tele-balloon">
          <div class="hz-balloon-ico">${icon('lock', 26)}</div>
          <div class="hz-balloon-txt"><b>화면 보호기가 실행됩니다</b></div>
        </div>
      `;
      t.el = el;
    },
  },
});
