// 이 파일 역할: bait(시선 강탈) 전용 그리기 — 종류별 정지 그림 위에 연출 5종(노이즈
// 디졸브/슬라이드-인 초대형/픽셀 디졸브/글리치 팝/형광등 껌뻑)을 얹는다.
// 다른 방해꾼 그리기(render.js)와 완전히 분리되어 있다.
//
// ★ WebGL 대신 캔버스 2D 픽셀 마스크로 구현했다. 이 프로젝트 전체가 캔버스 2D뿐이라
//   (WebGL 컨텍스트가 어디에도 없다), 이 효과 하나만을 위해 별도 렌더 파이프라인을
//   새로 놓는 건 위험 대비 이득이 작다고 판단했다 — 지시문도 "또는 캔버스 픽셀
//   마스크"로 대안을 열어뒀다.
//
// ★ 글리치/형광등 연출이 "이번 프레임의 흔들림 값"을 뽑을 때 Math.random()이 아니라
//   시드 기반 해시(hash1)를 쓴다. 진짜 난수를 쓰면 같은 age에 두 번 그려도(드물지만
//   디버그 재생 등에서 일어날 수 있다) 결과가 달라져서 그림이 지글거린다 — 해시는
//   같은 입력(seed, age)에 항상 같은 값을 내므로 "그 프레임 동안은 안정적"이면서도
//   프레임이 바뀌면(age가 바뀌면) 다른 값을 낸다. 이 프로젝트가 setInterval 없이
//   단일 시계(now/age)로만 애니를 도는 원칙(sprite/animator.js 상단 주석)과 같은
//   이유다.

import { config } from '../config.js';
import { enemyImages } from '../assets.js';
import { cssColor } from './draw.js';
import { getFrameKey } from '../sprite/animator.js';

const clamp01 = (t) => Math.max(0, Math.min(1, t));

/** 시드+틱으로 결정적 0~1 의사난수를 뽑는다(진짜 Math.random 아님 — 위 파일 상단 주석). */
function hash1(seed) {
  const x = Math.sin(seed) * 43758.5453;
  return x - Math.floor(x);
}

// ── 색수차(글리치 팝) 틴트 캐시 ──────────────────────────────────────────────
// 이미지를 통째로 빨강/시안으로 물들인 오프스크린 캔버스를 (원본 img, 색) 조합별로
// 딱 한 번만 만들어 재사용한다. 매 프레임 새로 만들면 512x512 캔버스를 계속
// 새로 할당하는 낭비다 — bait는 종류가 4개뿐이라 캐시 항목도 최대 8개(4종×2색)로 끝난다.
const tintCache = new Map(); // key: `${img.src}|${color}` -> canvas

function getTinted(img, color) {
  const key = `${img.src}|${color}`;
  let canvas = tintCache.get(key);
  if (canvas) return canvas;

  canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || 512;
  canvas.height = img.naturalHeight || 512;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  // source-in: 이미 그려진 이미지의 알파(실루엣)만 남기고 그 자리를 단색으로 덮는다
  // → "이미지 모양 그대로, 색만 빨강/시안인" 레이어가 된다.
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  tintCache.set(key, canvas);
  return canvas;
}

// ── 노이즈/픽셀 디졸브용 마스크 캔버스 (재사용) ────────────────────────────
// enemy.baitDissolveMap(cols×rows 임계값 격자)을 매 프레임 이 작은 캔버스에
// 그려 넣고, destination-out으로 본체 위에 찍어 "이미 지워진 셀"을 뚫는다.
// 격자가 작아서(가장 곱게 잡아도 수십×수십) 매 프레임 다시 채워도 가볍다.
let maskCanvas = null;
function getMaskCanvas(cols, rows) {
  if (!maskCanvas) maskCanvas = document.createElement('canvas');
  if (maskCanvas.width !== cols || maskCanvas.height !== rows) {
    maskCanvas.width = cols;
    maskCanvas.height = rows;
  }
  return maskCanvas;
}

/** dissolveT(0~1) 시점까지 "지워진" 셀만 검은 불투명으로 채운 마스크를 그린 뒤,
 * destination-out으로 본체에 구멍을 뚫는다. dissolveT<=0이면 아무것도 안 한다. */
function punchDissolveMask(ctx, x, y, w, h, dissolveMap, dissolveT) {
  if (dissolveT <= 0) return;
  const { cols, rows, map } = dissolveMap;
  const mc = getMaskCanvas(cols, rows);
  const mctx = mc.getContext('2d');
  const img = mctx.createImageData(cols, rows);
  for (let i = 0; i < map.length; i++) {
    const erased = map[i] <= dissolveT;
    img.data[i * 4 + 3] = erased ? 255 : 0; // 알파만 쓴다(RGB는 destination-out에서 안 쓰임)
  }
  mctx.putImageData(img, 0, 0);

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.imageSmoothingEnabled = false; // 셀 경계가 또렷해야 "블록 노이즈"로 보인다
  ctx.drawImage(mc, x, y, w, h);
  ctx.restore();
}

/** bait 한 마리를 그린다. enemy.baitEffect에 따라 연출 다섯 가지 중 하나로 분기한다. */
export function drawBaitEnemy(ctx, e, now) {
  const img = enemyImages[getFrameKey(e, now)];
  const x = e.x - e.w / 2;
  const y = e.y - e.h / 2;

  if (!img) {
    ctx.fillStyle = cssColor('--color-enemy-fallback');
    ctx.fillRect(x, y, e.w, e.h);
    return;
  }

  const p = e.baitPhases;
  const age = e.age;

  switch (e.baitEffect) {
    case 'noise':
      drawNoise(ctx, img, e, x, y, age, p);
      break;
    case 'pixelDissolve':
      drawPixelDissolve(ctx, img, e, x, y, age, p);
      break;
    case 'glitchPop':
      drawGlitchPop(ctx, img, e, x, y, age, p);
      break;
    case 'flicker':
      drawFlicker(ctx, img, e, x, y, age, p);
      break;
    case 'slideHuge':
    default:
      // 슬라이드는 위치 자체가 이미 화면 밖→안→밖으로 움직이므로(bait.js) 그림은
      // 그냥 평범하게 그리면 된다 — 연출이 이동 자체에 있다.
      ctx.drawImage(img, x, y, e.w, e.h);
      break;
  }
}

/** 1) 노이즈 위→아래 소멸 [확정·주력]. 등장은 짧게 페이드인, 소멸은 8초짜리 노이즈 디졸브. */
function drawNoise(ctx, img, e, x, y, age, p) {
  const c = config.bait.effects.noise;
  const enterAlpha = p.enterEnd > 0 ? clamp01(age / p.enterEnd) : 1;

  ctx.save();
  ctx.globalAlpha = enterAlpha;
  ctx.drawImage(img, x, y, e.w, e.h);

  const dissolveSpan = p.total - p.dissolveStart;
  const dissolveT = dissolveSpan > 0 ? clamp01((age - p.dissolveStart) / dissolveSpan) : 0;
  punchDissolveMask(ctx, x, y, e.w, e.h, e.baitDissolveMap, dissolveT);

  // 소멸 경계에 밝은 지지직 띠 — verticalBias가 있어 "평균적으로" 이 y축 비율까지
  // 지워졌다고 볼 수 있다(정확한 프론티어가 아니라 근사치지만 눈으로는 자연스럽다).
  if (dissolveT > 0 && dissolveT < 1) {
    const bandH = c.glitchBandPx * (e.h / 512);
    const bandY = y + e.h * dissolveT;
    ctx.globalAlpha = 0.85 * enterAlpha;
    ctx.fillStyle = cssColor('--color-bait-glitch');
    ctx.fillRect(x, bandY - bandH / 2, e.w, bandH);
  }
  ctx.restore();
}

/** 3) 픽셀 디졸브. 모래알처럼 완전 무작위로 흩어지며 사라진다(위→아래 쏠림 없음). */
function drawPixelDissolve(ctx, img, e, x, y, age, p) {
  const enterAlpha = p.enterEnd > 0 ? clamp01(age / p.enterEnd) : 1;

  ctx.save();
  ctx.globalAlpha = enterAlpha;
  ctx.drawImage(img, x, y, e.w, e.h);

  const dissolveSpan = p.total - p.dissolveStart;
  const dissolveT = dissolveSpan > 0 ? clamp01((age - p.dissolveStart) / dissolveSpan) : 0;
  punchDissolveMask(ctx, x, y, e.w, e.h, e.baitDissolveMap, dissolveT);
  ctx.restore();
}

/** 4) 글리치 팝. RGB 색수차 + 지지직 등장/체류중 간헐 지직/퇴장. */
function drawGlitchPop(ctx, img, e, x, y, age, p) {
  const c = config.bait.effects.glitchPop;
  let glitchAmt = 0; // 0=말짱, 1=색수차 최대(rgbSplitPx 그대로)

  if (age < p.enterEnd) {
    // 등장: 글리치가 강했다가 잦아들며 자리를 잡는다
    glitchAmt = p.enterEnd > 0 ? 1 - age / p.enterEnd : 0;
  } else if (age < p.exitStart) {
    // 체류: 평소엔 말짱하다가, idleGlitchIntervalSec마다 짧게(idleGlitchDurSec) 지직
    const cyclePos = (age - p.enterEnd) % c.idleGlitchIntervalSec;
    glitchAmt = cyclePos < c.idleGlitchDurSec ? 1 : 0;
  } else {
    // 퇴장: 다시 글리치가 커지며 사라진다
    const span = p.total - p.exitStart;
    glitchAmt = span > 0 ? clamp01((age - p.exitStart) / span) : 1;
  }

  // 알파는 등장 초반/퇴장 막판에만 살짝 깜빡이고 그 외엔 완전 불투명 — "지지직
  // 등장"이 알파 0에서 시작하지 않고 처음부터 색수차만으로 지직거리게 한다.
  const flicker = glitchAmt > 0.05 ? (hash1(e.baitGlitchSeed + Math.floor(age * 20)) > 0.3 ? 1 : 0.55) : 1;

  const off = Math.round(c.rgbSplitPx * glitchAmt * (e.w / 512));
  ctx.save();
  ctx.globalAlpha = flicker;

  if (off > 0) {
    // 색수차: 빨강/시안 틴트를 좌우로 어긋나게 겹쳐 그린다(lighter로 합성해
    // 어긋난 자리가 밝게 번지는 느낌을 낸다).
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = flicker * 0.75;
    ctx.drawImage(getTinted(img, '#ff2b3d'), x + off, y, e.w, e.h);
    ctx.drawImage(getTinted(img, '#2bdcff'), x - off, y, e.w, e.h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = flicker;
  }
  ctx.drawImage(img, x, y, e.w, e.h);
  ctx.restore();
}

/** 5) 형광등 껌뻑. 켜질 듯 말 듯 몇 번 깜빡이다 켜짐/꺼짐. */
function drawFlicker(ctx, img, e, x, y, age, p) {
  const c = config.bait.effects.flicker;
  let alpha;

  if (age < p.enterEnd) {
    alpha = fluorescentAlpha(p.enterEnd > 0 ? age / p.enterEnd : 1, c.flickerCount, e.baitGlitchSeed, age);
  } else if (age < p.exitStart) {
    alpha = 1;
  } else {
    const span = p.total - p.exitStart;
    const t = span > 0 ? (age - p.exitStart) / span : 1;
    alpha = fluorescentAlpha(1 - t, c.flickerCount, e.baitGlitchSeed, age); // 꺼지는 쪽은 진행을 뒤집는다
  }

  ctx.save();
  ctx.globalAlpha = clamp01(alpha);
  ctx.drawImage(img, x, y, e.w, e.h);
  ctx.restore();
}

/**
 * 형광등 켜짐 진행도(0~1) → 이번 순간의 밝기(0 또는 1에 가까운 값).
 * ratio가 0에 가까울수록(막 켜기 시작) 꺼진 구간이 넓고, 1에 가까울수록(거의 다
 * 켜짐) 켜진 구간이 넓어져서 결국 완전히 안정된다 — 실제 형광등이 깜빡이다
 * 켜지는 느낌의 흔한 근사식이다.
 */
function fluorescentAlpha(ratio, count, seed, age) {
  ratio = clamp01(ratio);
  if (ratio >= 1) return 1;
  const cyclePos = (ratio * count) % 1;
  const onThreshold = 0.25 + 0.65 * ratio; // ratio가 커질수록 "켜진" 구간이 넓어짐
  if (cyclePos >= onThreshold) return 0.08; // 완전히 까맣게 안 하고 살짝 남겨 눈이 덜 아프게
  // 켜진 구간 안에서도 살짝 지직거리게 미세한 흔들림을 얹는다
  return 0.85 + 0.15 * hash1(seed + Math.floor(age * 30));
}
