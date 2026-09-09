// 이 파일 역할: 환경 방해 C — "절전 모드". XP 전원관리를 흉내 낸다. 가만히 두면
// 화면이 서서히 꺼지고(3초에 걸쳐 암전), 마우스를 계속 움직이는 동안만 같은
// 속도로 다시 밝아진다. 좌하단에는 XP 풍선 도움말이 뜬다.
//
// ★ 2026-09-09: 밝아지는 속도를 어두워지는 속도와 같게 맞췄다(config의
//   wakeRecoverSec). 예전엔 회복이 5.6배 빨라서 조금만 움직여도 즉시 100%로
//   돌아왔고, 그래서 "서서히 어두워진다"는 연출을 볼 일 자체가 없었다.
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
    inst.data.speed = 0; // 커서 속도의 짧은 창 이동평균(월드 px/초) — update() 주석 참고

    inst.el = el;
    // 전용 소리가 없어 "전원이 내려간다" 결에 가장 가까운 기존 소리를 재사용한다.
    playSfx(SFX.UNPLUG_STOP);
  },

  update(inst, dt) {
    const c = config.hazard.powersave;

    // 움직이는 중이면 밝아지고(회복), 멈춰 있으면 계속 어두워진다.
    // ★ 해제(dismissHazard)를 부르지 않는다 — 이 방해는 "풀고 끝"이 아니라
    //   움직이는 동안만 밝은 상태를 유지하는 것이라, 끝은 durationSec이 낸다.
    //
    // ★ 판정을 "이번 프레임에 몇 px 움직였나"가 아니라 "초당 몇 px인가"로 본다 —
    //   pointerDelta는 프레임당 거리라 그대로 문턱값과 비교하면 같은 손놀림이
    //   120Hz에서 60Hz의 절반으로 잡힌다(config의 wakePxPerSec 주석 참고).
    //   dt가 0인 첫 프레임은 나눗셈이 Infinity가 되므로 아예 "안 움직였다"로 친다.
    const pxPerSec = dt > 0 ? inst.pointerDelta / dt : 0;
    // 그 순간값을 그대로 쓰지 않고 wakeWindowSec 길이의 이동평균으로 본다 —
    // 마우스 보고 주기와 프레임 주기가 어긋나면 손이 일정하게 움직여도 어떤
    // 프레임은 0으로 잡히기 때문이다(config의 wakeWindowSec 주석에 실측 근거).
    // 시간 기반 지수 이동평균이라 프레임 간격이 들쭉날쭉해도 가중치가 맞는다.
    const alpha = dt > 0 ? 1 - Math.exp(-dt / c.wakeWindowSec) : 0;
    inst.data.speed += (pxPerSec - inst.data.speed) * alpha;
    const awake = inst.data.speed >= c.wakePxPerSec;
    // ★ 회복과 감쇠가 대칭이다(둘 다 maxOpacity를 각자의 시간으로 나눈 속도) —
    //   그래서 손을 멈추는 순간 밝아지던 것과 같은 속도로 곧장 어두워진다.
    const speed = awake ? -(c.maxOpacity / c.wakeRecoverSec) : c.maxOpacity / c.dimInSec;
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
  //
  // ★ 2026-09-09(승인분) — 트레이 XP 풍선 도움말로 "무엇이 오는지" 이름을 밝힌다
  //   (전조 규격 통일, config.hazard.telegraphSec 주석 참고). 본 효과의 풍선과
  //   같은 아이콘(plug)을 쓴다.
  telegraph: {
    mount(t) {
      const el = document.createElement('div');
      el.className = 'hz-tele-crt';
      el.innerHTML = `
        <i class="t"></i><i class="b"></i><b></b>
        <div class="hz-balloon hz-tele-balloon">
          <div class="hz-balloon-ico">${icon('plug', 26)}</div>
          <div class="hz-balloon-txt"><b>절전 모드로 전환됩니다</b></div>
        </div>
      `;
      t.el = el;
    },
  },
});
