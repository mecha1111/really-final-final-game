// 이 파일 역할: 환경 방해 F — "모니터 세로모드". XP 디스플레이 설정에서 화면 방향을
// 세로로 바꾼 것처럼 화면 전체가 90° 돌아가고, 8초 뒤 저절로 원래대로 돌아온다.
// 좌하단에는 XP 풍선 도움말이 뜬다.
//
// ★ 이 파일은 좌표 계산을 하지 않는다. 하는 일은 딱 둘이다:
//     1) #stage에 회전 클래스를 붙였다 뗀다(실제로 화면을 돌리는 건 CSS).
//     2) ui/canvasGeometry.js에 "지금 몇 도인지"를 알려준다.
//   회전 역변환은 전부 canvasGeometry 안에서만 일어난다(단일 진실원) — 그래서
//   방해꾼 클릭·popup X버튼·state.pointer(화면 깨짐 드래그)·H키 오버레이가
//   자동으로 따라오고, 여기에도 다른 어디에도 보정 코드가 흩어지지 않는다.
//
// ★ 왜 #stage인가: ui/canvasFit.js가 리사이즈마다 desktop.style.transform을
//   통째로 다시 쓴다. #desktop에 회전을 얹으면 이 방해가 떠 있는 동안 창 크기만
//   바뀌어도 회전이 조용히 지워진다(화면은 원래대로인데 판정만 돌아가 있는,
//   가장 나쁜 상태가 된다). 소유권을 갈라둔다.
//
// ★ 전환(0.4초) 동안은 클릭을 안 받는다 — systems/input.js가
//   canvasGeometry.isRotationSettling()을 보고 막는다. 중간각에서는 화면에 그려진
//   각도와 계산이 한두 프레임 어긋날 수 있어서다(그 파일 주석에 근거).
//
// ★ 접근성: config.hazard.rotationEnabled가 false면 아예 후보에서 빠진다
//   (canFire) — [환경 방해] 토글과 독립된 별도 스위치다(멀미 대비, 설정창).

import { config } from '../../config.js';
import { registerHazard } from '../../systems/hazard.js';
import { setScreenRotation } from '../canvasGeometry.js';
import { playSfx, SFX } from '../../systems/sound.js';
import { icon } from '../icons.js';

/** 회전을 실제로 걸고/푸는 곳 — CSS 클래스와 판정 각도를 항상 같이 바꾼다. */
function applyRotation(on) {
  const c = config.hazard.portrait;
  const stage = document.getElementById('stage');
  const settleMs = c.transitionSec * 1000;

  if (stage) {
    stage.style.setProperty('--rot-deg', `${c.rotateDeg}deg`);
    stage.style.setProperty('--rot-sec', `${c.transitionSec}s`);
    stage.classList.toggle('rot-portrait', on);
  }
  // ★ CSS 클래스와 이 한 줄은 반드시 붙어 있어야 한다 — 떨어뜨리면 "화면은
  //   돌았는데 판정은 안 돌았다"(또는 그 반대)가 조용히 생긴다.
  setScreenRotation(on ? c.rotateDeg : 0, settleMs);
}

registerHazard({
  id: 'portrait',
  get minStage() {
    return config.hazard.portrait.minStage;
  },
  get durationSec() {
    return config.hazard.portrait.durationSec;
  },
  // 해제 조작이 없다 — 방치하면 durationSec 뒤 프레임워크가 'timeout'으로 끝낸다.
  dismiss: 'timeout',

  /** 접근성 토글이 꺼져 있으면 아예 안 나온다(systems/hazard.js의 eligibleHazardIds). */
  canFire() {
    return config.hazard.rotationEnabled !== false;
  },

  mount(inst) {
    const el = document.createElement('div');
    el.className = 'hz-portrait';
    // powersave/driver와 같은 풍선(.hz-balloon, style.css 공용) — 아이콘·문구만 바꾼다.
    el.innerHTML = `
      <div class="hz-balloon">
        <div class="hz-balloon-ico">${icon('monitor', 26)}</div>
        <div class="hz-balloon-txt">
          <b>디스플레이 방향이 변경되었습니다</b>
          <span>세로 모드로 전환되었습니다</span>
        </div>
      </div>
    `;
    inst.el = el;

    applyRotation(true);
    // 전용 소리가 없어 "화면 설정이 바뀐다" 결에 가장 가까운 기존 창 열림음을 쓴다.
    playSfx(SFX.ENTRANCE_WINDOW);
  },

  onEnd() {
    // ★ 어떤 사유(timeout/dismissed/reset)로 끝나든 반드시 되돌린다 — 판이 끝날 때
    //   resetHazards()가 'reset'으로 부르는 경로도 여기로 들어오므로, 회전된 채로
    //   다음 판에 넘어가는 일이 구조적으로 없다.
    applyRotation(false);
    playSfx(SFX.UI_CLOSE);
  },

  // ★전조 — 화면이 살짝 기울었다 돌아온다.
  //   ★진짜 화면을 안 돌린다(회전각은 canvasGeometry가 아는 값이라, 전조가 몰래
  //     돌리면 판정이 그만큼 밀린다). 테두리 한 겹만 기울여 "곧 돌아간다"를 알린다.
  telegraph: {
    mount(t) {
      const el = document.createElement('div');
      el.className = 'hz-tele-tilt';
      el.innerHTML = '<i></i>';
      t.el = el;
    },
  },
});
