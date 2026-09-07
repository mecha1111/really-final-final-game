// 이 파일 역할: 환경 방해 C — "절전 모드". XP 전원관리를 흉내 낸다. 가만히 두면
// 화면이 서서히 꺼지고(3초에 걸쳐 암전), 마우스를 움직이면 다시 밝아진다.
// 좌하단에는 XP 풍선 도움말이 뜬다.
//
// ★ 앞의 둘과 성격이 다르다: 재부팅·스크린세이버는 "한 번 해제하면 끝"이지만
//   이건 계속 움직여야 유지된다 — 멈추면 다시 어두워진다. 조준하려면 손을 멈춰야
//   하는데 멈추면 안 보이는, 그 충돌 자체가 이 방해의 본체다.
//
// ★ 이 막은 pointer-events:none이다(style.css의 .hz-powersave). 해제가 "클릭"이
//   아니라 "이동"이라 클릭을 받을 이유가 없고, 오히려 받으면 안 된다 — 어두운
//   동안에도 방해꾼은 평소처럼 눌려야 한다(막이 클릭을 삼키면 그 시간이 통째로
//   조작 불능이 되어버려 "보기 힘들게"가 아니라 "못 하게"가 된다).
//
// 해제 판정은 프레임워크가 매 프레임 넣어주는 inst.pointerDelta(이번 프레임 커서
// 이동 거리)를 읽어서 직접 한다 — dismiss:'move'는 "무엇으로 푸는 놈인지" 표기이고,
// 실제 판단은 방해마다 다르므로(여기선 즉시 해제가 아니라 밝기 회복) 여기서 한다.

import { config } from '../../config.js';
import { registerHazard } from '../../systems/hazard.js';
import { playSfx, SFX } from '../../systems/sound.js';
import { icon } from '../icons.js';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

registerHazard({
  id: 'powersave',
  get minStage() {
    return config.hazard.powersave.minStage;
  },
  get durationSec() {
    return config.hazard.powersave.durationSec;
  },
  dismiss: 'move',

  mount(inst) {
    const el = document.createElement('div');
    el.className = 'hz-powersave';
    // 풍선 도움말은 막 안에 같이 둔다 — 막이 어두워질수록 같이 묻히면 안 되므로
    // 불투명도는 막(--hz-dim)에만 걸고 풍선은 자기 불투명도를 따로 갖는다.
    el.innerHTML = `
      <div class="hz-dim"></div>
      <div class="hz-balloon">
        <div class="hz-balloon-ico">${icon('plug', 26)}</div>
        <div class="hz-balloon-txt">
          <b>절전 모드</b>
          <span>디스플레이 전원을 절약하는 중입니다</span>
        </div>
      </div>
    `;

    inst.data.dimEl = el.querySelector('.hz-dim');
    inst.data.dim = 0; // 지금 막의 불투명도(0=밝음)

    inst.el = el;
    // 전용 소리가 없어 "전원이 내려간다" 결에 가장 가까운 기존 소리를 재사용한다.
    playSfx(SFX.UNPLUG_STOP);
  },

  update(inst, dt) {
    const c = config.hazard.powersave;

    // 움직이는 중이면 밝아지고(회복), 멈춰 있으면 계속 어두워진다.
    // ★ 해제(dismissHazard)를 부르지 않는다 — 이 방해는 "풀고 끝"이 아니라
    //   움직이는 동안만 밝은 상태를 유지하는 것이라, 끝은 durationSec이 낸다.
    const awake = inst.pointerDelta >= c.wakeDeltaPx;
    const speed = awake ? -c.wakeRecoverPerSec : c.maxOpacity / c.dimInSec;
    inst.data.dim = clamp(inst.data.dim + speed * dt, 0, c.maxOpacity);

    // ★알파를 5단계로 끊는다(config.fx.alphaSteps) — 이 프로젝트는 매끄러운 연속
    //   페이드를 전역으로 금지한다(손그림 톤에서 "흐릿하게 번지는" 인상이 되고,
    //   CRT가 꺼지는 느낌과도 어긋난다). 예전엔 toFixed(3)로 소수 셋째 자리까지
    //   흘려보내 사실상 연속이었다.
    // 계단으로 끊으면 값이 바뀌는 프레임 자체가 확 줄어, 아래 "바뀐 프레임에만
    // 스타일을 쓴다"는 최적화도 같이 더 잘 듣는다.
    const steps = config.fx.alphaSteps;
    const next = (Math.round((inst.data.dim / c.maxOpacity) * steps) / steps * c.maxOpacity).toFixed(3);
    if (inst.data.dimText !== next) {
      inst.data.dimText = next;
      inst.data.dimEl?.style.setProperty('--hz-dim', next);
    }
  },

  // ★전조 — CRT 붕괴. 화면 상하가 살짝 수축했다 펴지며 한 번 깜빡인다.
  //   실물 CRT 전원이 나갈 때 정확히 이렇게 보이고, 이 방해가 "화면이 꺼진다"는
  //   것이므로 그 효과의 축소판으로 딱 맞는다.
  //   ★진짜 화면(#stage)을 scaleY 하지 않는다 — 좌표계를 건드리면 전조 중 클릭이
  //     밀린다. 위아래에서 조여드는 검은 띠 두 장으로 그린다(style.css).
  telegraph: {
    mount(t) {
      const el = document.createElement('div');
      el.className = 'hz-tele-crt';
      el.innerHTML = '<i class="t"></i><i class="b"></i><b></b>';
      t.el = el;
    },
  },
});
