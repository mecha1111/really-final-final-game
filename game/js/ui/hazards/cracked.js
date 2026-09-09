// 이 파일 역할: 환경 방해 E — "화면 깨짐". ★CRT 신호가 찢어진 화면이다.
//
// ── 2026-09-10 재작업: 왜 갈아엎었나 ────────────────────────────────────────
// 예전 구현은 화면에서 "흰 네모 블럭"으로 읽혔다. 폭 때문이 아니었다(그때도
// 3~8px로 이미 얇았다) — 원인은 셋이었고 전부 색과 움직임 쪽이었다:
//   1) kind 'stuck'이 순백(#ffffff)이라, 밝은 XP 배경 위에서는 "고장"이 아니라
//      그냥 흰 막대로 보였다(강제 stuck 스크린샷으로 재현 확인).
//   2) 열 하나가 위아래를 같은 색으로 관통했다 — 신호가 깨진 게 아니라
//      누가 그려 넣은 막대처럼 보인다.
//   3) 수평 밀림이 없었다. "찢어진 신호"라는 어휘의 핵심이 통째로 빠져 있었다.
// 그래서 지금은 ①단색 흰색을 아예 안 쓰고(아래 KINDS 3종) ②열을 세로로 2~5조각
// 으로 끊어 조각마다 좌우로 밀고 ③그 밀림을 offsetIntervalSec마다 다시 뽑는다.
//
// ── 파훼법: 없다(자동 복구) ─────────────────────────────────────────────────
// ★ 2026-09-10: "드래그로 문질러 지우기"를 걷어냈다. 그 해제법 때문에 window에
//   pointerdown/up 리스너를 직접 걸고(레이어가 pointer-events:none이라 자기
//   요소로는 드래그를 못 받는다) 선분-열 교차 판정까지 들고 있었는데, 그 전부가
//   사라졌다. 지금 이 방해는 durationSec(4.5초) 뒤 저절로 복구되는 것 하나뿐이다.
//
// ★ 시야만 가리고 클릭은 통과 — 이 방해의 DOM(.hz-cracked)이 pointer-events:none
//   이라, 이 위 어디를 눌러도 이벤트가 캔버스(z5)로 그대로 내려가 방해꾼 판정이
//   평소와 똑같다(systems/hazard.js 상단의 pointer-events 규칙).
//
// ── 왜 캔버스가 두 장인가(색 반전 전용) ─────────────────────────────────────
// KINDS의 'invert'는 "뒤에 있는 화면색의 보색"이라, 이 캔버스 안의 픽셀만 봐서는
// 만들 수 없다(뒤 화면은 다른 DOM 레이어다 — 캔버스의 globalCompositeOperation은
// 같은 캔버스 안에서만 합성한다). 그래서 반전 열만 별도 캔버스에 흰색으로 그리고,
// 그 캔버스에 mix-blend-mode:difference를 건다 — 흰색과의 difference가 곧 보색이다.
// ★ filter/backdrop-filter 금지 규칙과는 다른 이야기다: 그 금지는 "흐릿하게
//   번지는 효과"를 막는 것이고, 여기 blend는 흐림이 전혀 없는 채널 반전이다.
//   같은 결과를 낼 다른 방법이 없기도 하다.
//
// ★★ 그 캔버스만 .layer-hazard 밖(#desktop 직계)에 붙인다 — 실측으로 잡은 함정.
//   mix-blend-mode는 "가장 가까운 스택 문맥" 안에서만 뒤와 섞인다. .layer-hazard는
//   z-index:7이라 그 자체가 스택 문맥이고, 그 안에 두면 섞을 뒤 화면이 그 레이어
//   내부(=아무것도 없음)뿐이라 반전이 아니라 ★납작한 회색 막대로 그려진다
//   (before (213,210,190)·(16,81,182) 어느 배경이든 after가 (213,213,213)으로
//   똑같이 나오는 걸 스크린샷 픽셀로 확인했다 — 없애려던 "흰 블럭"이 그대로
//   되살아난 셈이다). #desktop 직계로 옮기면 그 문맥의 z<7 전부(배경·창·게임
//   캔버스·작업표시줄)가 섞을 대상이 되어 진짜 보색이 나온다.
//   ★그 대신 이 캔버스는 프레임워크의 el.remove() 청소를 못 받는다 —
//   반드시 onEnd()에서 직접 지운다(어떤 사유로 끝나든 onEnd는 항상 불린다).

import { config } from '../../config.js';
import { registerHazard } from '../../systems/hazard.js';
import { playSfx, SFX } from '../../systems/sound.js';
import { icon } from '../icons.js';

const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));

/**
 * 열의 성격 3종. ★순백 단색은 없다(위 재작업 주석).
 *   rgb    — RGB 분리. 적/녹/청 중 한 채널만 남은 색띠.
 *   scan   — 스캔 결손. 신호가 아예 안 온 검은 띠.
 *   invert — 색 반전. 뒤 화면색의 보색(전용 캔버스 + difference).
 */
const KINDS = ['rgb', 'scan', 'invert'];

/** 알파/밝기를 계단으로 끊는다(config.fx.alphaSteps) — 이 프로젝트 전역 규칙. */
function stepped01() {
  const steps = config.fx.alphaSteps;
  return Math.round(Math.random() * steps) / steps;
}

/**
 * 열 하나를 세로로 2~5조각으로 끊는다. ★경계는 균등분할이 아니라 난수다 —
 * 균등하면 그 규칙성 자체가 무늬로 읽혀서 "찢어졌다"가 안 된다.
 * dx(좌우 밀림)는 여기서 정하지 않는다 — reshuffleOffsets()가 주기마다 다시 뽑는다.
 */
function makeSegments(c) {
  const H = config.canvas.height;
  const n = randInt(c.segMin, c.segMax);

  const cuts = [0];
  for (let i = 1; i < n; i++) cuts.push(Math.random());
  cuts.push(1);
  cuts.sort((a, b) => a - b);

  const segs = [];
  for (let i = 0; i < n; i++) {
    segs.push({
      y0: Math.round(cuts[i] * H),
      y1: Math.round(cuts[i + 1] * H),
      shade: stepped01(), // 조각마다 밝기가 달라야 한 열 안에서도 들쭉날쭉해진다
      dx: 0,
    });
  }
  return segs;
}

/**
 * 열 목록. ★총 점유폭 예산(maxOccupancyRatio)을 넘기려 하면 거기서 멈춘다 —
 * 개수를 늘려도 화면이 통째로 가려지는 일이 구조적으로 없다.
 */
function makeColumns(c) {
  const W = config.canvas.width;
  const budget = W * c.maxOccupancyRatio;
  const want = randInt(c.colCountMin, c.colCountMax);

  const cols = [];
  let used = 0;
  for (let i = 0; i < want; i++) {
    const w = Math.round(rand(c.colWidthMin, c.colWidthMax));
    if (used + w > budget) break;
    used += w;
    cols.push({
      x: Math.round(rand(20, Math.max(21, W - 40))),
      w,
      kind: KINDS[Math.floor(Math.random() * KINDS.length)],
      channel: Math.floor(Math.random() * 3), // rgb 열이 남길 채널(0=R,1=G,2=B)
      segs: makeSegments(c),
    });
  }
  return cols;
}

/** 조각마다 좌우 밀림을 다시 뽑는다. ★보간 없음 — 이 순간 값이 통째로 바뀐다. */
function reshuffleOffsets(cols, c) {
  for (const col of cols) {
    for (const s of col.segs) {
      const mag = Math.round(rand(c.offsetMinPx, c.offsetMaxPx));
      s.dx = Math.random() < 0.5 ? -mag : mag;
    }
  }
}

/** 조각 하나의 색. 흰 단색은 어디에도 없다(invert 캔버스의 흰색은 blend 재료다). */
function segFill(col, s) {
  if (col.kind === 'scan') {
    // 스캔 결손 — 검은 띠. 조각마다 농도만 다르다.
    return `rgba(0,0,0,${(0.7 + s.shade * 0.3).toFixed(2)})`;
  }
  if (col.kind === 'invert') {
    // 이 캔버스는 difference로 합성된다 — 흰색이 곧 "완전 반전"이고,
    // 알파를 낮추면 그만큼 덜 반전된다.
    return `rgba(255,255,255,${(0.5 + s.shade * 0.5).toFixed(2)})`;
  }
  // RGB 분리 — 한 채널만 남긴다.
  const v = Math.round(120 + s.shade * 135);
  if (col.channel === 0) return `rgb(${v},0,0)`;
  if (col.channel === 1) return `rgb(0,${v},0)`;
  return `rgb(0,0,${v})`;
}

function draw(mainCtx, invCtx, cols, c) {
  const W = config.canvas.width;
  const H = config.canvas.height;
  mainCtx.clearRect(0, 0, W, H);
  invCtx.clearRect(0, 0, W, H);

  for (const col of cols) {
    const ctx = col.kind === 'invert' ? invCtx : mainCtx;

    for (const s of col.segs) {
      ctx.fillStyle = segFill(col, s);
      ctx.fillRect(col.x + s.dx, s.y0, col.w, s.y1 - s.y0);
    }

    // ★열 위/아래 끝의 1px 밝은 선 — CRT 라인 마감. 밀린 조각을 따라가야
    //   "그 열이 밀렸다"가 되므로 첫/마지막 조각의 dx를 그대로 쓴다.
    const first = col.segs[0];
    const last = col.segs[col.segs.length - 1];
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillRect(col.x + first.dx, 0, col.w, c.capLinePx);
    ctx.fillRect(col.x + last.dx, H - c.capLinePx, col.w, c.capLinePx);
  }

  // 수평 지직 밴드 — 가끔만. 늘 있으면 세로 열이 주인공이 아니게 된다.
  if (Math.random() < c.bandChance) {
    mainCtx.fillStyle = 'rgba(255,255,255,.16)';
    mainCtx.fillRect(0, Math.floor(Math.random() * H), W, 3);
  }
}

/** 논리 해상도 캔버스 한 장. 화면에 맞춰 늘리는 건 style.css가 한다. */
function makeCanvas(className) {
  const el = document.createElement('canvas');
  el.className = className;
  el.width = config.canvas.width;
  el.height = config.canvas.height;
  return el;
}

registerHazard({
  id: 'cracked',
  get minStage() {
    return config.hazard.cracked.minStage;
  },
  get durationSec() {
    return config.hazard.cracked.durationSec;
  },
  // 해제 조작이 없다 — 방치하면 durationSec 뒤 프레임워크가 'timeout'으로 끝낸다.
  dismiss: 'timeout',

  mount(inst) {
    const c = config.hazard.cracked;

    const el = document.createElement('div');
    el.className = 'hz-cracked';
    const main = makeCanvas('hz-cracked-main');
    el.appendChild(main);
    inst.el = el;

    // ★반전 캔버스만 #desktop 직계로 — 이유는 파일 상단 주석(스택 문맥과 blend).
    const invert = makeCanvas('hz-cracked-invert');
    document.getElementById('desktop')?.appendChild(invert);
    inst.data.invertEl = invert;

    inst.data.mainCtx = main.getContext('2d');
    inst.data.invCtx = invert.getContext('2d');
    inst.data.cols = makeColumns(c);
    inst.data.timer = 0; // 첫 프레임에 바로 한 번 그린다
    reshuffleOffsets(inst.data.cols, c);

    // 전용 소리가 없어 화면이 지지직거리며 손상되는 느낌의 기존 소리를 재사용한다.
    playSfx(SFX.OVERLOAD_START);
  },

  update(inst, dt) {
    const c = config.hazard.cracked;
    // ★offsetIntervalSec마다만 — 밀림 재추첨과 다시 그리기가 같은 시계를 쓴다.
    //   매 프레임 clearRect + fillRect를 도는 건 순수한 낭비이고(예전 구현이
    //   그랬다) 눈에도 발작 유발 수준으로 어지럽다.
    inst.data.timer -= dt;
    if (inst.data.timer > 0) return;
    inst.data.timer = c.offsetIntervalSec;

    reshuffleOffsets(inst.data.cols, c);
    draw(inst.data.mainCtx, inst.data.invCtx, inst.data.cols, c);
  },

  onEnd(inst) {
    // ★반전 캔버스는 .layer-hazard 밖(#desktop 직계)에 있어서 프레임워크의
    //   el.remove()가 못 치운다 — 어떤 사유(timeout/dismissed/reset)로 끝나든
    //   여기서 반드시 직접 지운다. 안 지우면 판이 끝난 화면에 반전 막대가 남는다.
    inst.data.invertEl?.remove();
    playSfx(SFX.OVERLOAD_END);
  },

  // ★전조 — 세로선 하나가 잠깐 번쩍했다 사라진다(참조 문서의 crackTelegraph()).
  //   본 효과가 "세로 열 고장"이라 그중 한 줄만 미리 보여주는 축소판이다.
  //   x는 매번 다르게 — 같은 자리면 "저기 온다"를 외워버려 전조가 아니라 예고가 된다.
  //
  // ★ 2026-09-09(승인분) — 트레이 XP 풍선 도움말로 "무엇이 오는지" 이름을 밝힌다
  //   (전조 규격 통일, config.hazard.telegraphSec 주석 참고).
  telegraph: {
    mount(t) {
      const el = document.createElement('div');
      el.className = 'hz-tele-col';
      const line = document.createElement('i');
      line.style.left = `${8 + Math.random() * 84}%`;
      el.appendChild(line);
      const balloon = document.createElement('div');
      balloon.className = 'hz-balloon hz-tele-balloon';
      balloon.innerHTML = `
        <div class="hz-balloon-ico">${icon('warning', 26)}</div>
        <div class="hz-balloon-txt"><b>화면 출력에 오류가 있습니다</b></div>
      `;
      el.appendChild(balloon);
      t.el = el;
    },
  },
});
