// 이 파일 역할: 환경 방해 B — "스크린세이버". ★XP 기본 스크린세이버 Mystify를
// 흉내 낸다. 검은 막이 화면을 덮고, 그 위로 꼭짓점 4~5개짜리 다각형 2개가 벽에
// 튕기며 떠다니면서 지나온 자취를 여러 겹 남긴다(그 겹침이 Mystify의 정체다).
//
// ★ 별 필드에서 갈아엎은 이유: 별은 "점"이라 검은 막 위에서 밋밋했다. 그리고
//   XP를 아는 사람이 그 이름을 들었을 때 가장 먼저 떠올리는 화면이 Mystify다.
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
// 선은 캔버스 2D로 그린다. DOM을 매 프레임 옮기는 것보다 훨씬 싸고, 이 프로젝트가
// 이미 캔버스 2D만 쓰는 것과도 결이 같다(ui/baitRender.js 상단 주석).
// ★채움 없이 선만 그린다 — 채우면 그 아래 방해꾼이 통째로 가려져 "흐릿하게 비친다"는
//   위 설계가 무너진다.

import { config } from '../../config.js';
import { registerHazard } from '../../systems/hazard.js';
import { playSfx, SFX } from '../../systems/sound.js';

const rand = (min, max) => min + Math.random() * (max - min);

/** 다각형 하나 — 꼭짓점마다 자기 속도로 벽을 튕긴다(그래서 모양이 계속 일그러진다). */
function makeShape(c, w, h) {
  const n = Math.floor(rand(c.vertexMin, c.vertexMax + 1));
  return {
    pts: Array.from({ length: n }, () => {
      const a = rand(0, Math.PI * 2);
      const sp = rand(c.vertexSpeedMin, c.vertexSpeedMax);
      return { x: rand(w * 0.2, w * 0.8), y: rand(h * 0.2, h * 0.8), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp };
    }),
    // 지나온 모양을 겹으로 쌓아둔다. 앞이 오래된 것 — 그릴 때 옅게 나간다.
    trail: [],
  };
}

/** 꼭짓점을 한 프레임 옮기고 벽에서 튕긴다. */
function stepShape(shape, dt, w, h) {
  for (const p of shape.pts) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx); }
    else if (p.x > w) { p.x = w; p.vx = -Math.abs(p.vx); }
    if (p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy); }
    else if (p.y > h) { p.y = h; p.vy = -Math.abs(p.vy); }
  }
}

/** 지금 모양을 잔상 목록 끝에 한 겹 넣는다(오래된 건 앞에서 버린다). */
function pushTrail(shape, maxLen) {
  shape.trail.push(shape.pts.map((p) => ({ x: p.x, y: p.y })));
  while (shape.trail.length > maxLen) shape.trail.shift();
}

function strokePoly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.stroke();
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

    // 논리 해상도 그대로 그린다 — 캔버스 크기가 곧 좌표계라 별도 변환이 필요 없다
    // (CSS가 화면 크기에 맞춰 늘려준다).
    const canvas = document.createElement('canvas');
    canvas.width = config.canvas.width;
    canvas.height = config.canvas.height;
    el.appendChild(canvas);

    // 검은 막은 캔버스 배경(CSS)이 맡는다 — 선을 그릴 때마다 매번 칠하지 않아도
    // 되고, 불투명도를 config 한 값으로 CSS 변수에 흘려보내면 끝난다.
    el.style.setProperty('--hz-saver-dim', String(c.dimOpacity));

    inst.data.canvas = canvas;
    inst.data.ctx = canvas.getContext('2d');
    inst.data.shapes = Array.from({ length: c.shapeCount }, () => makeShape(c, canvas.width, canvas.height));
    inst.data.trailTimer = 0;
    inst.data.t = 0;

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
    inst.data.t += dt;

    for (const shape of inst.data.shapes) stepShape(shape, dt, w, h);

    // 잔상은 시간 간격으로만 쌓는다 — 매 프레임 쌓으면 프레임레이트에 따라 꼬리
    // 길이가 달라지고(120Hz에서 두 배로 촘촘해진다) 겹이 붙어 뭉갠다.
    inst.data.trailTimer -= dt;
    if (inst.data.trailTimer <= 0) {
      inst.data.trailTimer = c.trailIntervalSec;
      for (const shape of inst.data.shapes) pushTrail(shape, c.trailLength);
    }

    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = c.lineWidth;
    ctx.lineJoin = 'round';

    const baseHue = (inst.data.t / c.hueCycleSec) * 360;
    inst.data.shapes.forEach((shape, si) => {
      const hue = (baseHue + si * c.hueOffsetDeg) % 360;
      // 오래된 겹일수록 옅게. ★알파는 5단계로 끊는다(config.fx.alphaSteps와 같은
      //   규칙) — 연속 페이드는 이 프로젝트가 전역으로 금지한 어휘다.
      const total = shape.trail.length;
      shape.trail.forEach((pts, i) => {
        const t = total > 1 ? i / (total - 1) : 1;
        const step = Math.round(t * config.fx.alphaSteps) / config.fx.alphaSteps;
        ctx.strokeStyle = `hsla(${hue}, 90%, 62%, ${step * 0.75})`;
        strokePoly(ctx, pts);
      });
      // 지금 모양은 제일 진하게
      ctx.strokeStyle = `hsl(${hue}, 95%, 70%)`;
      strokePoly(ctx, shape.pts);
    });
  },

  // ★전조 — 본 효과의 축소판 그대로: 화면이 아주 짧게 한 번 어두워졌다 돌아온다.
  //   본 효과가 "검은 막 + 별"이라 그중 검은 막만 아주 잠깐 보여주는 셈이다.
  telegraph: {
    mount(t) {
      const el = document.createElement('div');
      el.className = 'hz-tele-dim';
      t.el = el;
    },
  },
});
