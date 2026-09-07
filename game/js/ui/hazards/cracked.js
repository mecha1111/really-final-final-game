// 이 파일 역할: 환경 방해 E — "화면 깨짐". ★세로 픽셀 열 고장이다.
//
// ── 왜 노이즈 블록에서 갈아엎었나 ────────────────────────────────────────────
// 예전엔 화면 여기저기에 노이즈 사각 블록 3~5개를 띄웠는데, 그건 "고장난 모니터"가
// 아니라 그냥 노이즈다. ★실물 패널 고장은 세로로 한 줄이 통째로 죽거나 색이 튄다 —
// 그래서 화면을 위아래로 관통하는 얇은 열 2~4개로 바꿨다(정본: docs/xp-icons-crack.html §5).
//   · 죽은 열(dead)  — 검정. 아예 신호가 안 온다.
//   · 박힌 열(stuck) — 흰색. 한 값에 붙어버렸다.
//   · 색 튀는 열(rgb) — 빨/초/파가 계속 바뀐다.
// ★열 안에서도 세로 토막마다 다르게 튄다. 균일하면 그냥 막대로 보인다.
// 여기에 CRT 어휘를 얹는다: 열 가장자리 흰 번짐(형광 잔상)과 가끔 스치는 수평 지직 밴드.
//
// ★ 시야만 가리고 클릭을 안 막는 핵심 트릭(그대로 유지): 이 방해의 DOM(.hz-cracked)이
//   pointer-events:none이다 — 그래서 이 위 어디를 눌러도 이벤트가 캔버스(z5)로 그대로
//   통과해 방해꾼 판정이 평소와 똑같다(systems/hazard.js 상단의 pointer-events 규칙).
//   문제는 그러면 이 요소 자신은 마우스 이벤트를 못 받는다는 것 — "드래그로 문질러
//   지운다"를 pointer-events:auto 없이 구현해야 한다. 그래서 window에 pointerdown/up만
//   곁다리로 걸어 "지금 눌려있나"만 추적하고, 실제 위치는 이미 매 프레임 갱신되는
//   state.pointer(systems/input.js)를 그대로 읽는다. 좌표 변환을 또 하지 않는다.
//
// ★ 드래그 판정은 "점"이 아니라 ★"선분"이다. 참조 구현을 실제로 문질러 보니
//   포인터 이동 보폭이 52px일 때 폭 6px짜리 열을 그대로 건너뛰어 "안 지워진다"가
//   됐다(실측). 프레임당 이전 위치 → 현재 위치 구간을 통째로 검사한다.
//
// 그림은 캔버스 2D로 그린다(screensaver와 같은 방식 — DOM에 <canvas> 하나를 얹고
// 논리 해상도로 그린다). ★매 프레임 다시 그리지 않는다(아래 flickerIntervalSec).

import { config } from '../../config.js';
import { registerHazard, dismissHazard } from '../../systems/hazard.js';
import { state } from '../../core/state.js';
import { playSfx, SFX } from '../../systems/sound.js';

const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));

/** 열의 성격 3종. 이 셋이 섞여 있어야 "패널 고장"으로 읽힌다(전부 검정이면 그냥 가림막). */
const KINDS = ['dead', 'stuck', 'rgb'];

/** 열 하나 — 화면을 세로로 관통한다(y 범위가 따로 없는 이유). */
function makeColumn(c) {
  const w = Math.round(rand(c.colWidthMin, c.colWidthMax));
  return {
    x: Math.round(rand(20, Math.max(21, config.canvas.width - 40))),
    w,
    kind: KINDS[Math.floor(Math.random() * KINDS.length)],
    // ★토막마다 다른 난수 — 이게 있어야 한 열 안에서도 밝기가 들쭉날쭉해진다.
    segs: Array.from({ length: c.segments }, () => Math.random()),
  };
}

/** 토막 하나의 색. t는 흐른 시간(초) — rgb 열만 이 값으로 색이 순환한다. */
function segColor(col, s, t) {
  if (col.kind === 'dead') return s > 0.25 ? '#000000' : '#141414';
  if (col.kind === 'stuck') return s > 0.3 ? '#ffffff' : '#c8c8c8';
  return ['#ff2020', '#20ff40', '#3050ff'][((s * 3 + t) | 0) % 3];
}

function drawColumns(ctx, cols, t, c) {
  const W = config.canvas.width;
  const H = config.canvas.height;
  ctx.clearRect(0, 0, W, H);

  for (const col of cols) {
    const n = col.segs.length;
    const sh = H / n;
    for (let j = 0; j < n; j++) {
      const s = col.segs[j];
      if (s < c.segmentSkip) continue; // 군데군데 멀쩡한 토막
      ctx.fillStyle = segColor(col, s, t + j * 0.3);
      ctx.fillRect(col.x, Math.round(j * sh), col.w, Math.ceil(sh));
    }
    // ★열 가장자리 흰 번짐 — CRT 형광 잔상. 이 1px 두 줄이 "화면 고장"의 결을 만든다.
    ctx.fillStyle = 'rgba(255,255,255,.25)';
    ctx.fillRect(col.x - 1, 0, 1, H);
    ctx.fillRect(col.x + col.w, 0, 1, H);
  }

  // 수평 지직 밴드 — 가끔만. 늘 있으면 세로 열이 주인공이 아니게 된다.
  if (Math.random() < c.bandChance) {
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    ctx.fillRect(0, Math.floor(Math.random() * H), W, 3);
  }
}

/**
 * 이전 위치 → 현재 위치 선분이 이 열을 스쳤는가.
 * ★점 하나만 보면 빠르게 문질렀을 때 얇은 열을 그대로 건너뛴다(실측: 보폭 52px 대
 *   폭 6px). 열은 세로로 화면을 관통하므로 x 구간이 겹치는지만 보면 된다.
 */
function sweepHitsColumn(col, x0, x1, pad) {
  const lo = Math.min(x0, x1) - pad;
  const hi = Math.max(x0, x1) + pad;
  return hi >= col.x && lo <= col.x + col.w;
}

registerHazard({
  id: 'cracked',
  get minStage() {
    return config.hazard.cracked.minStage;
  },
  get durationSec() {
    return config.hazard.cracked.durationSec;
  },
  dismiss: 'drag',

  mount(inst) {
    const c = config.hazard.cracked;

    const el = document.createElement('div');
    el.className = 'hz-cracked';
    const canvas = document.createElement('canvas');
    canvas.width = config.canvas.width;
    canvas.height = config.canvas.height;
    el.appendChild(canvas);
    inst.el = el;

    inst.data.ctx = canvas.getContext('2d');
    inst.data.cols = Array.from({ length: randInt(c.colCountMin, c.colCountMax) }, () => makeColumn(c));
    inst.data.flickerTimer = 0; // 첫 프레임에 바로 한 번 그린다
    inst.data.t = 0;
    inst.data.dragging = false;
    inst.data.prev = null; // 직전 프레임 포인터 위치(선분 판정용)

    // ★ 위 파일 상단 주석 참고 — .hz-cracked는 pointer-events:none이라 이 요소로는
    //   드래그를 못 받는다. window에 곁다리로 걸어 "지금 눌려있나"만 본다
    //   (preventDefault/stopPropagation 없음 — 캔버스의 기존 클릭 판정과 무관).
    inst.data.onDown = () => {
      inst.data.dragging = true;
      inst.data.prev = null; // 누른 그 순간부터 새 획이다(직전 획 끝과 이어붙지 않게)
    };
    inst.data.onUp = () => { inst.data.dragging = false; };
    window.addEventListener('pointerdown', inst.data.onDown);
    window.addEventListener('pointerup', inst.data.onUp);

    // 전용 소리가 없어 화면이 지지직거리며 손상되는 느낌의 기존 소리를 재사용한다.
    playSfx(SFX.OVERLOAD_START);
  },

  update(inst, dt) {
    const c = config.hazard.cracked;
    inst.data.t += dt;

    // ── 드래그로 열 단위 제거 ──────────────────────────────────────────────
    if (inst.data.dragging && inst.data.cols.length) {
      const p = state.pointer;
      const prev = inst.data.prev ?? p;
      const before = inst.data.cols.length;
      inst.data.cols = inst.data.cols.filter((col) => !sweepHitsColumn(col, prev.x, p.x, c.wipePad));
      if (inst.data.cols.length < before) {
        playSfx(SFX.KILL_SOFT); // 문질러 지운 손맛
        inst.data.flickerTimer = 0; // 열이 사라졌다 — 이번 프레임에 다시 그린다
      }
      if (inst.data.cols.length === 0) {
        dismissHazard(inst, 'dismissed'); // 전부 지웠다 — 즉시 종료
        return;
      }
      inst.data.prev = { x: p.x, y: p.y };
    } else {
      inst.data.prev = null;
    }

    // ── 다시 그리기 ────────────────────────────────────────────────────────
    // ★flickerIntervalSec마다만. 매 프레임 clearRect + fillRect를 도는 건 순수한
    //   낭비이고(예전 구현이 그랬다) 눈에도 발작 유발 수준으로 어지럽다.
    inst.data.flickerTimer -= dt;
    if (inst.data.flickerTimer > 0) return;
    inst.data.flickerTimer = c.flickerIntervalSec;
    drawColumns(inst.data.ctx, inst.data.cols, inst.data.t, c);
  },

  onEnd(inst) {
    window.removeEventListener('pointerdown', inst.data.onDown);
    window.removeEventListener('pointerup', inst.data.onUp);
    playSfx(SFX.OVERLOAD_END);
  },

  // ★전조 — 세로선 하나가 잠깐 번쩍했다 사라진다(참조 문서의 crackTelegraph()).
  //   본 효과가 "세로 열 고장"이라 그중 한 줄만 미리 보여주는 축소판이다.
  //   x는 매번 다르게 — 같은 자리면 "저기 온다"를 외워버려 전조가 아니라 예고가 된다.
  telegraph: {
    mount(t) {
      const el = document.createElement('div');
      el.className = 'hz-tele-col';
      const line = document.createElement('i');
      line.style.left = `${8 + Math.random() * 84}%`;
      el.appendChild(line);
      t.el = el;
    },
  },
});
