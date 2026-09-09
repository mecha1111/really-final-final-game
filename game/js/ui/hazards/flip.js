// 이 파일 역할: 환경 방해 F — "상하반전". 화면 전체가 180° 돌아가고,
// config.hazard.flip.durationSec(3초) 뒤 저절로 원래대로 돌아온다.
// 좌하단에는 XP 풍선 도움말이 뜬다.
//
// ── 왜 90° 세로모드에서 바꿨나 ──────────────────────────────────────────────
// 세로모드는 폭/높이가 통째로 뒤바뀐다. 그래서 화면을 축소해 끼워 맞춰야 했고
// (--rot-fit), 8초 동안 놀이 영역의 비율이 딴판이 되어 "방해"라기보다 그냥 못
// 하는 시간이었다. 180°는 외접 사각형이 그대로라 축소가 필요 없고, 판이 계속
// 성립한 채로 "읽기만 어려워진다" — 환경 방해가 노리는 바로 그 상태다.
//
// ── ★rotate(180deg) vs scale(1,-1) — 왜 회전인가 ───────────────────────────
// 좌표 역변환이 압도적으로 단순해서다.
//   · rotate(180deg)는 ui/canvasGeometry.js가 이미 가진 회전 역변환에 각도만
//     180으로 넘기면 끝난다. 새 코드가 한 줄도 안 든다. 게다가 180°는
//     ★자기 자신이 역함수인 대칭(중심점 대칭)이고, 외접 사각형이 회전 전과
//     같아서 원점 보정(getCanvasGeometry의 bbox 중심 복원)이 자명하게 맞는다.
//   · scale(1,-1)은 회전이 아니라 반사라 rotationRad로 표현할 수 없다.
//     clientToWorld/worldToClient 양쪽에 "뒤집힘" 분기를 새로 하나씩 더 내야
//     하고, 그 순간 좌표 보정이 두 갈래로 흩어진다 — 이 프로젝트가 가장 여러 번
//     데인 사고 부류다(단일 진실원 원칙).
//   덤: 실물 모니터를 뒤집으면 글씨가 거울상이 아니라 거꾸로 보인다. 180° 쪽이
//   흉내 내려는 현상과도 맞다.
//
// ★ 이 파일은 좌표 계산을 하지 않는다. 하는 일은 딱 둘이다:
//     1) #stage에 반전 클래스를 붙였다 뗀다(실제로 화면을 돌리는 건 CSS).
//     2) ui/canvasGeometry.js에 "지금 몇 도인지"를 알려준다.
//   역변환은 전부 canvasGeometry 안에서만 일어난다(단일 진실원) — 그래서
//   방해꾼 클릭·popup X버튼·state.pointer(화면 깨짐 드래그)·H키 오버레이가
//   자동으로 따라오고, 여기에도 다른 어디에도 보정 코드가 흩어지지 않는다.
//
// ★ 왜 #stage인가: ui/canvasFit.js가 리사이즈마다 desktop.style.transform을
//   통째로 다시 쓴다. #desktop에 반전을 얹으면 이 방해가 떠 있는 동안 창 크기만
//   바뀌어도 반전이 조용히 지워진다(화면은 원래대로인데 판정만 뒤집힌, 가장
//   나쁜 상태가 된다). 소유권을 갈라둔다.
//
// ★ 전환(0.4초) 동안은 클릭을 안 받는다 — systems/input.js가
//   canvasGeometry.isRotationSettling()을 보고 막는다. 중간각에서는 화면에 그려진
//   각도와 계산이 한두 프레임 어긋날 수 있어서다(그 파일 주석에 근거).
//
// ★ 2026-09-09: 예전엔 [화면 상하반전]이라는 별도 접근성 토글이 있어서 이 방해만
//   따로 끌 수 있었다(canFire로 후보에서 뺐다). 그 토글을 걷어내면서 여기도 같이
//   지웠다 — 지금은 [환경 방해] 토글이 다른 방해들과 함께 켜고 끈다.

import { config } from '../../config.js';
import { registerHazard } from '../../systems/hazard.js';
import { setScreenRotation } from '../canvasGeometry.js';
import { playSfx, SFX } from '../../systems/sound.js';
import { icon } from '../icons.js';

/** 반전을 실제로 걸고/푸는 곳 — CSS 클래스와 판정 각도를 항상 같이 바꾼다. */
function applyFlip(on) {
  const c = config.hazard.flip;
  const stage = document.getElementById('stage');
  const settleMs = c.transitionSec * 1000;

  if (stage) {
    stage.style.setProperty('--rot-deg', `${c.rotateDeg}deg`);
    stage.style.setProperty('--rot-sec', `${c.transitionSec}s`);
    stage.classList.toggle('rot-flip', on);
  }
  // ★ CSS 클래스와 이 한 줄은 반드시 붙어 있어야 한다 — 떨어뜨리면 "화면은
  //   뒤집혔는데 판정은 안 뒤집혔다"(또는 그 반대)가 조용히 생긴다.
  setScreenRotation(on ? c.rotateDeg : 0, settleMs);
}

registerHazard({
  id: 'flip',
  get minStage() {
    return config.hazard.flip.minStage;
  },
  get durationSec() {
    return config.hazard.flip.durationSec;
  },
  // 해제 조작이 없다 — 방치하면 durationSec 뒤 프레임워크가 'timeout'으로 끝낸다.
  dismiss: 'timeout',

  mount(inst) {
    const el = document.createElement('div');
    el.className = 'hz-flip';
    // powersave/driver와 같은 풍선(.hz-balloon, style.css 공용) — 아이콘·문구만 바꾼다.
    el.innerHTML = `
      <div class="hz-balloon">
        <div class="hz-balloon-ico">${icon('monitor', 26)}</div>
        <div class="hz-balloon-txt">
          <b>디스플레이 방향이 변경되었습니다</b>
          <span>화면이 상하 반전되었습니다</span>
        </div>
      </div>
    `;
    inst.el = el;

    applyFlip(true);
    // 전용 소리가 없어 "화면 설정이 바뀐다" 결에 가장 가까운 기존 창 열림음을 쓴다.
    playSfx(SFX.ENTRANCE_WINDOW);
  },

  onEnd() {
    // ★ 어떤 사유(timeout/dismissed/reset)로 끝나든 반드시 되돌린다 — 판이 끝날 때
    //   resetHazards()가 'reset'으로 부르는 경로도 여기로 들어오므로, 뒤집힌 채로
    //   다음 화면에 넘어가는 일이 구조적으로 없다.
    applyFlip(false);
    playSfx(SFX.UI_CLOSE);
  },

  // ★전조 — 화면이 살짝 기울었다 돌아온다.
  //   ★진짜 화면을 안 돌린다(회전각은 canvasGeometry가 아는 값이라, 전조가 몰래
  //     돌리면 판정이 그만큼 밀린다). 테두리 한 겹만 기울여 "곧 뒤집힌다"를 알린다.
  telegraph: {
    mount(t) {
      const el = document.createElement('div');
      el.className = 'hz-tele-tilt';
      el.innerHTML = '<i></i>';
      t.el = el;
    },
  },
});
