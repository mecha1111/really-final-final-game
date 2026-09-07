// 이 파일 역할: 환경 방해 D — "드라이버 오류". XP "디스플레이 드라이버가 응답하지
// 않다가 복구됨" 알림을 흉내 낸다. 보이는 커서만 delaySec(0.25초)만큼 늦게
// 따라오고, 좌하단에 XP 풍선 도움말이 뜬다.
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
    el.innerHTML = `
      <div class="hz-balloon">
        <div class="hz-balloon-ico">${icon('monitor', 26)}</div>
        <div class="hz-balloon-txt">
          <b>디스플레이 드라이버가 응답하지 않습니다</b>
          <span>그래픽 드라이버를 복구하는 중입니다...</span>
        </div>
      </div>
    `;
    inst.el = el;

    // 진짜 커서가 실제로 지나간 궤적을 delaySec 시간차로 재생하는 항목 하나를
    // 배열에 넣는다 — offsetX/Y=0(방사형 흩뿌림 없이 정확히 같은 자리를 늦게
    // 따라간다), life는 durationSec과 맞춰 이 방해가 끝나면 같이 사라지게
    // 한다(아래 onEnd에서 참조로 직접 지우므로 life 자체가 다 닳을 일은 없다).
    const p = state.pointer;
    inst.data.fakeCursor = {
      offsetX: 0, offsetY: 0,
      delay: c.delaySec,
      jitterSeed: 0, jitterPhase: 0,
      life: c.durationSec,
      x: p.x, y: p.y,
    };
    state.fakeCursors.push(inst.data.fakeCursor);
    state.hideSystemCursor = true;

    // 전용 소리가 없어 "고장/버벅거림" 결에 가장 가까운 기존 소리를 재사용한다.
    playSfx(SFX.OVERLOAD_START);
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
  telegraph: {
    mount(t) {
      const el = document.createElement('div');
      el.className = 'hz-tele-glitch';
      el.innerHTML = '<i></i>';
      t.el = el;

      const p = state.pointer;
      t.data.fakeCursor = {
        offsetX: 0, offsetY: 0,
        delay: config.hazard.driver.delaySec,
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
