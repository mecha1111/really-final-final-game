// 이 파일 역할: 환경 방해 B — "스크린세이버". XP 기본 스크린세이버 중 가장 알아보기
// 쉬운 별 필드(비행)를 흉내 낸다. 검은 막이 화면을 덮고 그 위로 중앙에서 별이 사방으로
// 쏟아진다.
//
// ★ 완전 실명이 아니다 — 막의 불투명도를 0.75로 두어 방해꾼이 25%로 비친다
//   (config.hazard.screensaver.dimOpacity). "아무것도 못 보는 8초"는 방해가 아니라
//   그냥 멈춘 시간이라, 흐릿하게라도 판을 읽을 수 있어야 대응할 여지가 남는다.
//
// ★ 해제 클릭이 방해꾼을 잘못 죽이지 않는 이유: 이 막 자체가 pointer-events:auto라
//   (style.css의 .hz-saver) 클릭을 통째로 삼킨다 — 캔버스는 그 이벤트를 아예 못 받는다.
//   프레임워크가 dismiss:'click'을 보고 이 요소에 직접 핸들러를 걸어준다
//   (systems/hazard.js의 triggerHazard 참고).
//
// 별은 캔버스 2D로 그린다. DOM 요소 90개를 매 프레임 옮기는 것보다 훨씬 싸고,
// 이 프로젝트가 이미 캔버스 2D만 쓰는 것과도 결이 같다(ui/baitRender.js 상단 주석).

import { config } from '../../config.js';
import { registerHazard } from '../../systems/hazard.js';
import { playSfx, SFX } from '../../systems/sound.js';

const rand = (min, max) => min + Math.random() * (max - min);

/** 별 하나를 중앙에서 새로 태어나게 한다(방향은 무작위, 시작 거리는 아주 가깝게). */
function spawnStar() {
  const angle = rand(0, Math.PI * 2);
  return {
    // 화면 반지름 대비 거리(0=중앙, 1=가장자리). 0에서 시작하면 전부 한 점에서
    // 동시에 태어나 보이므로 살짝 흩어서 시작한다.
    dist: rand(0.02, 0.12),
    dx: Math.cos(angle),
    dy: Math.sin(angle),
    // 별마다 속도를 조금씩 달리해야 "면"이 아니라 "흐름"으로 보인다.
    speed: rand(0.7, 1.3),
  };
}

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

    // 논리 해상도 그대로 그린다 — 캔버스 크기가 곧 좌표계라 별 위치 계산에 별도
    // 변환이 필요 없다(CSS가 화면 크기에 맞춰 늘려준다).
    const canvas = document.createElement('canvas');
    canvas.width = config.canvas.width;
    canvas.height = config.canvas.height;
    el.appendChild(canvas);

    // 검은 막은 캔버스 배경(CSS)이 맡는다 — 별을 그릴 때마다 매번 칠하지 않아도
    // 되고, 불투명도를 config 한 값으로 CSS 변수에 흘려보내면 끝난다.
    el.style.setProperty('--hz-saver-dim', String(c.dimOpacity));

    inst.data.canvas = canvas;
    inst.data.ctx = canvas.getContext('2d');
    inst.data.stars = Array.from({ length: c.starCount }, spawnStar);

    inst.el = el;
    // 전용 소리가 없어 "숨어있던 게 드러난다" 결의 기존 소리를 재사용한다
    // (화면이 갑자기 검게 덮이는 순간을 귀로도 알린다).
    playSfx(SFX.KILL_HIDDEN);
  },

  update(inst, dt) {
    const c = config.hazard.screensaver;
    const ctx = inst.data.ctx;
    if (!ctx) return;

    const w = inst.data.canvas.width;
    const h = inst.data.canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    // 대각선 절반 — 이 거리를 넘으면 어느 모서리로든 화면을 확실히 벗어난 것이다.
    const radius = Math.hypot(cx, cy);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';

    for (const s of inst.data.stars) {
      s.dist += c.starSpeed * s.speed * dt;
      if (s.dist >= 1) Object.assign(s, spawnStar()); // 화면을 벗어났다 — 중앙에서 다시

      const x = cx + s.dx * s.dist * radius;
      const y = cy + s.dy * s.dist * radius;
      // 가장자리에 가까울수록 굵고 밝게 = 다가오는 느낌
      const size = c.starMinPx + (c.starMaxPx - c.starMinPx) * s.dist;
      ctx.globalAlpha = Math.min(1, 0.25 + s.dist);
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  },
});
