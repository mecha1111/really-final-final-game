// 이 파일 역할: 환경 방해 D — "드라이버 오류". XP "디스플레이 드라이버가 응답하지
// 않다가 복구됨" 알림을 흉내 낸다. 보이는 커서만 delaySec(0.25초)만큼 늦게
// 따라오고, 좌하단에 XP 풍선 도움말이 뜬다.
//
// ★ 2026-09-09(승인분): 실제 커서 위치에 옅은 점선 원을 하나 더 그린다. 이 방해는
//   "판정은 그대로, 화면만 늦게 보인다"가 규칙이라 원래도 불공정하지 않지만, 늦게
//   따라오는 잔상만 보고 있으면 지금 실제로 어디를 누르게 될지 감이 잘 안 잡힌다는
//   피드백이 있었다. 점선을 옅게 두는 이유는 그대로 답을 주면(진하게 그리면) 이
//   방해의 핵심("화면과 판정의 분리를 체감하게 한다")이 사라지기 때문 — 있는지도
//   모르고 지나칠 수 있을 만큼만 존재감을 준다.
//
// ★ 새 추종 로직을 만들지 않는다 — copier가 이미 갖고 있는 걸 그대로 쓴다:
//   state.fakeCursors 배열에 항목 하나를 넣어두면 core/enemies/effects.js의
//   updateFakeCursors()가 매 프레임(플레이 중이면 항상 돈다, copier 발동 여부와
//   무관하게) systems/pointerTrail.js의 실제 커서 궤적을 delay만큼 시간차로
//   재생해 위치를 갱신해준다 — 이 파일은 그 배열에 항목을 넣고 빼는 것 말고는
//   아무 좌표 계산도 하지 않는다.
//
// ★ copier의 위장(state.cursorDisguise)을 그대로 못 쓰는 이유: 그건 "진짜 위치에도
//   가짜와 똑같은 커서를 하나 더 그려서" 헷갈리게 하는 연출이라(ui/render.js가
//   cursorDisguise>0이면 state.pointer 자리에도 글자를 그린다), 그대로 켜면 화면에
//   커서가 두 개(진짜 위치 하나 + 늦게 따라오는 것 하나) 보인다. driver는 "진짜
//   위치엔 아무것도 안 보이고 늦게 따라오는 것 하나만" 보여야 하므로, 시스템
//   커서를 숨기는 것만 떼어낸 state.hideSystemCursor를 대신 쓴다(state.js/
//   ui/render.js 주석 참고) — cursorDisguise의 "진짜 자리에도 그리기" 부작용 없이
//   ui/render.js가 이미 하고 있던 fakeCursors 배열 순회 그리기(`for (const c of
//   state.fakeCursors) drawCursorGlyph(...)`)만 그대로 타게 한다.
//
// ★ 클릭 판정은 손대지 않는다 — systems/input.js는 애초에 state.pointer(실시간
//   실제 위치)만 보고 판정하므로, 여기서 뭘 하든 판정에 영향이 없다. "보이는
//   커서만 늦고 판정은 실제 위치"가 이미 구조적으로 보장된다.

import { config } from '../../config.js';
import { registerHazard } from '../../systems/hazard.js';
import { state } from '../../core/state.js';
import { playSfx, SFX } from '../../systems/sound.js';
import { icon } from '../icons.js';

/** config.hazard.driver.delaySec 주석의 안전장치 — config.cursor.fakeDelayMax로
 * 한 번 더 누른다(그 값 자체가 trailMaxAgeSec보다 항상 작게 설계돼 있다). */
function safeDelaySec(delaySec) {
  return Math.min(delaySec, config.cursor.fakeDelayMax);
}

registerHazard({
  id: 'driver',
  get minStage() {
    return config.hazard.driver.minStage;
  },
  // 해제 조작이 따로 없다 — 방치하면 durationSec 뒤 프레임워크가 'timeout'으로
  // 끝내준다(요구사항의 "6초 경과"). 그래서 dismiss는 표기용으로 'timeout'.
  get durationSec() {
    return config.hazard.driver.durationSec;
  },
  dismiss: 'timeout',

  mount(inst) {
    const c = config.hazard.driver;

    const el = document.createElement('div');
    el.className = 'hz-driver';
    // powersave와 같은 풍선 마크업(.hz-balloon, style.css가 공용으로 스타일링) —
    // 새 레이아웃을 안 만들고 아이콘·문구만 바꿔 재사용한다.
    // .hz-driver-real은 실제 커서 위치를 따라가는 옅은 점선 마커(update 참고).
    el.innerHTML = `
      <div class="hz-balloon">
        <div class="hz-balloon-ico">${icon('monitor', 26)}</div>
        <div class="hz-balloon-txt">
          <b>디스플레이 드라이버가 응답하지 않습니다</b>
          <span>그래픽 드라이버를 복구하는 중입니다...</span>
        </div>
      </div>
      <div class="hz-driver-real"></div>
    `;
    inst.el = el;
    inst.data.realEl = el.querySelector('.hz-driver-real');
    inst.data.realX = null; // 직전에 실제로 그린 좌표 — 안 바뀐 프레임엔 DOM을 또 안 건드린다
    inst.data.realY = null;

    // 진짜 커서가 실제로 지나간 궤적을 delaySec 시간차로 재생하는 항목 하나를
    // 배열에 넣는다 — offsetX/Y=0(방사형 흩뿌림 없이 정확히 같은 자리를 늦게
    // 따라간다), life는 durationSec과 맞춰 이 방해가 끝나면 같이 사라지게
    // 한다(아래 onEnd에서 참조로 직접 지우므로 life 자체가 다 닳을 일은 없다).
    const p = state.pointer;
    inst.data.fakeCursor = {
      offsetX: 0, offsetY: 0,
      delay: safeDelaySec(c.delaySec),
      jitterSeed: 0, jitterPhase: 0,
      life: c.durationSec,
      x: p.x, y: p.y,
    };
    state.fakeCursors.push(inst.data.fakeCursor);
    state.hideSystemCursor = true;

    // 전용 소리가 없어 "고장/버벅거림" 결에 가장 가까운 기존 소리를 재사용한다.
    playSfx(SFX.OVERLOAD_START);
  },

  // 실제 커서 위치(state.pointer, 월드 좌표)를 매 프레임 .hz-driver-real로
  // 옮긴다. 좌표계 변환은 이 곱셈 하나뿐이다 — .hz-driver는 #desktop(1920 기준)
  // 안에 inset:0으로 얹혀 있고, 월드 좌표는 config.canvas.width 기준이므로
  // (uiBaseWidth/canvas.width) 배율만 곱하면 #desktop 좌표계로 맞다(다른 hazard가
  // #desktop 좌표계를 그대로 쓰는 것과 같은 관례 — screensaver.js 상단 주석 참고).
  // ★ worldToClient(뷰포트 client px)를 안 쓰는 이유: 그건 #stage에 걸린 canvasFit
  //   배율·회전까지 다 푼 "화면 절대좌표"라, position:fixed로 그리려면 그 자체가
  //   또 다른 transform 조상(canvasFit의 #desktop scale) 안에 들어가 있어 좌표계가
  //   꼬인다(그 조상 밑에서 fixed는 뷰포트가 아니라 그 조상 기준으로 다시 잡힌다).
  //   #desktop 로컬 좌표만 쓰면 그 문제 자체가 없다 — canvasFit/회전 전부 #desktop을
  //   통째로 옮기는 것이라, 로컬 좌표는 그 결과와 무관하게 항상 그대로 맞는다.
  update(inst) {
    const s = config.canvas.uiBaseWidth / config.canvas.width;
    const p = state.pointer;
    const x = Math.round(p.x * s);
    const y = Math.round(p.y * s);
    if (x !== inst.data.realX || y !== inst.data.realY) {
      inst.data.realX = x;
      inst.data.realY = y;
      inst.data.realEl.style.left = `${x}px`;
      inst.data.realEl.style.top = `${y}px`;
    }
  },

  onEnd(inst) {
    state.fakeCursors = state.fakeCursors.filter((c) => c !== inst.data.fakeCursor);
    state.hideSystemCursor = false;
    playSfx(SFX.OVERLOAD_END); // "드라이버가 복구되었습니다"에 대응하는 복구음
  },

  // ★전조 — 커서가 한 번 튀고 화면이 짧게 지직한다. 본 효과가 "보이는 커서만
  //   늦게 따라온다"이므로, 그 지연을 아주 짧게 한 번만 맛보여 주는 축소판이다.
  //
  // ★커서 튐은 본 효과와 같은 장치(state.fakeCursors + 궤적 재생)를 쓴다 —
  //   전조용 커서 로직을 따로 만들면 둘이 조용히 갈라진다. 다만 ★진짜 커서를
  //   숨기지는 않는다(state.hideSystemCursor를 안 건드린다): 전조 동안 조준을
  //   빼앗으면 "짧아서 못 막는다"가 아니라 "전조 때문에 손해를 본다"가 된다.
  //
  // ★ 2026-09-09(승인분) — 트레이 XP 풍선 도움말로 "무엇이 오는지" 이름을 밝힌다
  //   (전조 규격 통일, config.hazard.telegraphSec 주석 참고). 본 효과의 풍선과
  //   같은 아이콘(monitor)을 써서 "같은 방해의 예고"임을 알아보게 한다.
  telegraph: {
    mount(t) {
      const el = document.createElement('div');
      el.className = 'hz-tele-glitch';
      el.innerHTML = `
        <i></i>
        <div class="hz-balloon hz-tele-balloon">
          <div class="hz-balloon-ico">${icon('monitor', 26)}</div>
          <div class="hz-balloon-txt"><b>디스플레이 드라이버에 문제가 있습니다</b></div>
        </div>
      `;
      t.el = el;

      const p = state.pointer;
      t.data.fakeCursor = {
        offsetX: 0, offsetY: 0,
        delay: safeDelaySec(config.hazard.driver.delaySec),
        jitterSeed: 0, jitterPhase: 0,
        life: config.hazard.telegraphSec,
        x: p.x, y: p.y,
      };
      state.fakeCursors.push(t.data.fakeCursor);
    },
    unmount(t) {
      // 수명(life)이 다 닳아 스스로 빠졌을 수도 있으므로 참조로 한 번 더 지운다 —
      // 남으면 본 효과가 켜질 때 커서가 두 개로 보인다.
      state.fakeCursors = state.fakeCursors.filter((c) => c !== t.data.fakeCursor);
    },
  },
});
