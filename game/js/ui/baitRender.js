// 이 파일 역할: bait(시선 강탈) 전용 그리기 — 저화질 베이스 위에 위→아래로 원본을 덮어 그리는 화질 복구 연출.
// 다른 방해꾼 그리기(render.js)와 완전히 분리되어 있다.

import { config } from '../config.js';
import { enemyImages } from '../assets.js';
import { cssColor } from './draw.js';
import { getFrameKey } from '../sprite/animator.js';

// id별 저화질(뭉갠) 오프스크린 캔버스를 한 번만 만들어 재사용한다 — 매 프레임
// 새로 만들면 낭비고, 방해꾼 크기가 프레임 중에 안 바뀌므로 캐시해도 안전하다.
const lowResCache = new Map();

function getLowResCanvas(img, w, h) {
  let canvas = lowResCache.get(img);
  if (canvas) return canvas;

  const lw = Math.max(1, Math.round(w * config.bait.lowResScale));
  const lh = Math.max(1, Math.round(h * config.bait.lowResScale));

  canvas = document.createElement('canvas');
  canvas.width = lw;
  canvas.height = lh;
  canvas.getContext('2d').drawImage(img, 0, 0, lw, lh);

  lowResCache.set(img, canvas);
  return canvas;
}

/** bait 한 마리를 그린다. e.baitRevealRatio(0~1)만큼 위에서부터 원본이 드러난다. */
export function drawBaitEnemy(ctx, e, now) {
  // 노랑광고(a)/핑크광고(b) 세트로 계속 루프하는 프레임(sprite/animator.js).
  // 저화질 캐시는 img(=Image 객체)를 키로 쓰므로 프레임이 바뀌어도(같은 세트 안 2장)
  // 각자 따로 캐시돼 안전하다.
  const img = enemyImages[getFrameKey(e, now)];
  const x = e.x - e.w / 2;
  const y = e.y - e.h / 2;

  if (!img) {
    ctx.fillStyle = cssColor('--color-enemy-fallback');
    ctx.fillRect(x, y, e.w, e.h);
    return;
  }

  // 1) 저화질 베이스를 항상 먼저 깐다 — 복구 전 구간은 이게 그대로 보인다.
  const low = getLowResCanvas(img, e.w, e.h);
  ctx.save();
  ctx.imageSmoothingEnabled = false; // 확대해도 부드럽게 안 뭉개지게 — 블록 노이즈 그대로
  ctx.drawImage(low, x, y, e.w, e.h);
  ctx.restore();

  const revealRatio = e.baitRevealRatio ?? 1;
  if (revealRatio <= 0) return;

  // 2) 복구된 만큼(위→아래) 원본을 그 영역만 잘라서 덮어 그린다.
  const revealH = e.h * revealRatio;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, e.w, revealH);
  ctx.clip();
  ctx.drawImage(img, x, y, e.w, e.h);
  ctx.restore();

  // 3) 복구 경계선에 지지직 스캔라인 (다 복구되면 사라진다)
  if (revealRatio < 1) {
    const glitchH = config.bait.scanGlitchHeight * e.scaleFactor;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = cssColor('--color-bait-glitch');
    ctx.fillRect(x, y + revealH - glitchH / 2, e.w, glitchH);
    ctx.restore();
  }
}
