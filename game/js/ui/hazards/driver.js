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
// ★ 2026-09-10: 위 점선 원을 "화살표+점선 테두리" 고스트 커서로 바꿨다. 이 방해가
//   버그처럼 읽히는 원인은 안내 문구 크기가 아니라 "화면에 아무 변화가 없는데
//   손만 안 먹히는 것"이라는 지적에 따라, 지연 자체를 그림으로 보여주는 쪽으로
//   방향을 바꿨다:
//     · 실제 위치(state.pointer) = 반투명 흰색 화살표 + 점선 테두리(고스트 커서).
//       화살표 윤곽은 ui/renderEnemies.js의 drawCursorGlyph() 폴백 벡터(끝점이
//       (0,0)인 커서 실루엣)를 1.5배 키워 그대로 재사용한다 — 새 모양을 발명하지
//       않는다. ★ui/icons.js 카탈로그에 안 넣은 이유: 그 카탈로그는 버튼·풍선에
//       쓰는 정적 픽토그램이고, 이건 매 프레임 좌표가 바뀌는 "커서 그 자체"라
//       좌표 갱신 코드(아래 update()) 바로 옆에 인라인으로 두는 편이 두 코드가
//       갈라지지 않게 한다.
//     · 지연된 위치(fakeCursor) = 평소 커서 그대로(ui/render.js가 이미 그리는
//       drawCursorGlyph 호출을 그대로 씀 — 손대지 않았다).
//     · 둘 사이 = 옅은 점선(SVG <line> 하나). CSS transform으로 회전시킨 div가
//       아니라 SVG line을 쓴다 — 회전 div는 길이·각도를 CSS와 JS 양쪽에서 각자
//       계산해야 해서 좌표계가 둘로 갈라지는, 이 저장소가 반복해서 겪은 실수다.
//     · 고스트 옆에 「지연 0.25s」 라벨(config.hazard.driver.delaySec을 그대로
//       문자열로 만든다 — 값이 바뀌면 라벨도 따라간다).
//     · 발동 순간 화면 상단에 XP 풍선 1회(config.hazard.driver.toastSec 동안만).
//   기존 좌하단 풍선·클릭 판정·fakeCursors 배선·hideSystemCursor는 그대로다.
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
// 상단 XP 풍선의 알파를 계단으로 끊는 데 쓴다(powersave.js의 --hz-dim과 같은
// 방식 — config.fx.alphaSteps, 필터 금지·전역 계단 알파 규칙).
import { quantizeStep } from '../draw.js';

/** 화살표 고스트 커서 윤곽. ui/renderEnemies.js의 drawCursorGlyph() 폴백 벡터
 * (끝점이 (0,0)인 손그림 커서 실루엣)를 1.5배 키운 좌표다 — 새 모양을 만들지
 * 않고 이미 있는 커서 실루엣을 그대로 재사용한다(파일 상단 주석 참고). */
const GHOST_ARROW_PATH = 'M0,0 L0,26 L7,20 L11,29 L16,27 L12,18 L20,17 Z';

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
    // 순서 = 그리기 순서(DOM 순서가 곧 쌓이는 순서). 점선을 맨 밑에, 그 위에
    // 고스트 화살표, 풍선들은 맨 위 — 화살표가 점선을 가리고, 풍선은 항상
    // 읽힌다.
    // ★ .hz-driver-link의 <line>은 x1/y1/x2/y2를 update()가 매 프레임 고친다 —
    //   CSS transform 회전 div가 아니라 SVG line 하나로 긋는 이유는 파일 상단
    //   주석 참고(길이·각도 계산이 두 벌로 안 갈리게 하려는 것).
    // ★ .hz-driver-ghost는 화살표(반투명 흰색 + 점선 테두리)와 「지연 Ns」
    //   라벨을 담는다. 라벨 값은 config.hazard.driver.delaySec을 그대로 문자열로
    //   만든다(하드코딩 금지 — 값이 바뀌면 라벨도 따라간다).
    // ★ .hz-driver-toast는 발동 순간 상단에 1회 뜨는 XP 풍선 — 기존 좌하단
    //   .hz-balloon과 같은 마크업(공용 스타일)을 재사용하고 위치·폭만 CSS에서
    //   바꾼다(새 레이아웃을 안 만드는 이 파일의 관례, 텔레그래프 풍선과 같은 방식).
    el.innerHTML = `
      <svg class="hz-driver-link"><line x1="0" y1="0" x2="0" y2="0" /></svg>
      <div class="hz-driver-ghost">
        <svg class="hz-driver-ghost-arrow" viewBox="0 0 20 29" width="20" height="29">
          <path d="${GHOST_ARROW_PATH}" />
        </svg>
        <span class="hz-driver-ghost-label">지연 ${c.delaySec.toFixed(2)}s</span>
      </div>
      <div class="hz-balloon">
        <div class="hz-balloon-ico">${icon('monitor', 26)}</div>
        <div class="hz-balloon-txt">
          <b>디스플레이 드라이버가 응답하지 않습니다</b>
          <span>그래픽 드라이버를 복구하는 중입니다...</span>
        </div>
      </div>
      <div class="hz-balloon hz-driver-toast">
        <div class="hz-balloon-ico">${icon('monitor', 26)}</div>
        <div class="hz-balloon-txt"><b>디스플레이 드라이버 응답 지연</b></div>
      </div>
    `;
    inst.el = el;
    inst.data.ghostEl = el.querySelector('.hz-driver-ghost');
    inst.data.lineEl = el.querySelector('.hz-driver-link line');
    inst.data.toastEl = el.querySelector('.hz-driver-toast');
    // 직전에 실제로 그린 값들 — 안 바뀐 프레임엔 DOM(스타일/SVG 속성)을 또
    // 안 건드린다(예전 realX/realY 최적화와 같은 결).
    inst.data.gx = null;
    inst.data.gy = null;
    inst.data.lx1 = null;
    inst.data.ly1 = null;
    inst.data.lx2 = null;
    inst.data.ly2 = null;
    inst.data.toastAlphaText = null;
    inst.data.toastDone = false; // 상단 풍선 페이드가 끝나면 더 이상 안 건드린다

    // 진짜 커서가 실제로 지나간 궤적을 delaySec 시간차로 재생하는 항목 하나를
    // 배열에 넣는다 — offsetX/Y=0(방사형 흩뿌림 없이 정확히 같은 자리를 늦게
    // 따라간다), life는 durationSec과 맞춰 이 방해가 끝나면 같이 사라지게
    // 한다(아래 onEnd에서 참조로 직접 지우므로 life 자체가 다 닳을 일은 없다).
    // 이 항목이 그대로 "지연된 위치의 평소 커서"다 — ui/render.js가 매 프레임
    // state.fakeCursors를 순회하며 drawCursorGlyph로 그려준다(손 안 댐).
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

  // 좌표계 변환은 이 곱셈 하나뿐이다 — .hz-driver는 #desktop(1920 기준)
  // 안에 inset:0으로 얹혀 있고, 월드 좌표는 config.canvas.width 기준이므로
  // (uiBaseWidth/canvas.width) 배율만 곱하면 #desktop 좌표계로 맞다(다른 hazard가
  // #desktop 좌표계를 그대로 쓰는 것과 같은 관례 — screensaver.js 상단 주석 참고).
  // ★ worldToClient(뷰포트 client px)를 안 쓰는 이유: 그건 #stage에 걸린 canvasFit
  //   배율·회전까지 다 푼 "화면 절대좌표"라, position:fixed로 그리려면 그 자체가
  //   또 다른 transform 조상(canvasFit의 #desktop scale) 안에 들어가 있어 좌표계가
  //   꼬인다(그 조상 밑에서 fixed는 뷰포트가 아니라 그 조상 기준으로 다시 잡힌다).
  //   #desktop 로컬 좌표만 쓰면 그 문제 자체가 없다 — canvasFit/회전 전부 #desktop을
  //   통째로 옮기는 것이라, 로컬 좌표는 그 결과와 무관하게 항상 그대로 맞는다.
  // ★ 이 변환식(s = uiBaseWidth/canvas.width) 하나를 고스트 좌표·점선 양 끝
  //   좌표 전부에 그대로 재사용한다 — 새 좌표 계산을 또 만들지 않는다(요구사항,
  //   이 저장소가 반복해서 데인 지점).
  update(inst) {
    const c = config.hazard.driver;
    const s = config.canvas.uiBaseWidth / config.canvas.width;

    // 고스트 커서(=실제 위치, state.pointer) 좌표.
    const p = state.pointer;
    const gx = Math.round(p.x * s);
    const gy = Math.round(p.y * s);
    if (gx !== inst.data.gx || gy !== inst.data.gy) {
      inst.data.gx = gx;
      inst.data.gy = gy;
      inst.data.ghostEl.style.left = `${gx}px`;
      inst.data.ghostEl.style.top = `${gy}px`;
    }

    // 지연된 위치(평소 커서가 그려지는 자리) 좌표. fakeCursor.x/y는
    // enemies/effects.js의 updateFakeCursors()가 매 프레임 궤적 재생으로 이미
    // 갱신해준다 — 여기서는 같은 배율로 좌표계만 맞춰 읽는다.
    const fc = inst.data.fakeCursor;
    const fx = Math.round(fc.x * s);
    const fy = Math.round(fc.y * s);

    // 둘을 잇는 점선. 좌표가 안 바뀌면 SVG 속성도 안 건드린다.
    if (gx !== inst.data.lx1 || gy !== inst.data.ly1 || fx !== inst.data.lx2 || fy !== inst.data.ly2) {
      inst.data.lx1 = gx;
      inst.data.ly1 = gy;
      inst.data.lx2 = fx;
      inst.data.ly2 = fy;
      inst.data.lineEl.setAttribute('x1', gx);
      inst.data.lineEl.setAttribute('y1', gy);
      inst.data.lineEl.setAttribute('x2', fx);
      inst.data.lineEl.setAttribute('y2', fy);
      // 두 점이 거의 겹칠 때(멈춰 있을 때)는 점선을 안 그린다 — 몇 px짜리 선은
      // 반올림 오차로 프레임마다 각도가 튀어 지저분하게 깜빡인다(요구사항).
      const show = Math.hypot(fx - gx, fy - gy) >= c.linkMinDistPx;
      inst.data.lineEl.style.opacity = show ? '1' : '0';
    }

    // 발동 순간 상단 XP 풍선 — toastSec 동안만 보였다 사라진다(그 뒤로는 손을
    // 뗀다). 알파는 매끄러운 CSS 트랜지션이 아니라 config.fx.alphaSteps
    // 계단으로 끊는다(필터 금지·전역 계단 알파 규칙 — powersave.js의 --hz-dim과
    // 같은 방식, quantizeStep 재사용). inst.age는 프레임워크(systems/hazard.js)가
    // 이 방해가 뜬 순간부터 매 프레임 더해주는 값이라 따로 타이머를 안 둔다.
    if (!inst.data.toastDone) {
      const dur = c.toastSec;
      const t = Math.min(1, inst.age / dur);
      // 앞 20%는 페이드인, 가운데는 유지, 뒤 30%는 페이드아웃.
      let raw;
      if (t < 0.2) raw = t / 0.2;
      else if (t > 0.7) raw = 1 - (t - 0.7) / 0.3;
      else raw = 1;
      const alpha = quantizeStep(raw, config.fx.alphaSteps).toFixed(3);
      if (inst.data.toastAlphaText !== alpha) {
        inst.data.toastAlphaText = alpha;
        inst.data.toastEl.style.setProperty('--hz-driver-toast-a', alpha);
      }
      if (t >= 1) inst.data.toastDone = true;
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
