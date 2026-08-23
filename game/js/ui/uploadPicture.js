// 이 파일 역할: .exe 창 안 그림 자리(#up-thumb, 이제 <canvas>)에 "업데이트 중"인 그림을
// 진행률에 따라 모자이크(픽셀화)→원본으로 점점 선명하게 그린다.
// 캔버스 2D만 쓴다(이 프로젝트 전역 규칙 — WebGL 없음). bait 소멸 연출과 같은 계열의
// "작은 캔버스로 축소→확대" 방식이지만, 그쪽은 알파 마스크로 지우는 것이고 이쪽은
// 해상도 자체를 계단으로 낮췄다 올리는 것이라 코드는 따로 둔다.
//
// ★ 레이어 규칙: 이 캔버스는 #win-upload(.layer-win, z-index 4) 안의 평범한 HTML
//   요소다. 방해꾼을 그리는 #game-canvas(z-index 5)보다 자동으로 아래에 깔리므로
//   별도 z-index 조정이 필요 없다 — "그림은 창 콘텐츠라 방해꾼보다 아래" 요구사항이
//   DOM 구조만으로 만족된다.

import { config } from '../config.js';

let canvas = null;
let ctx = null;
let mosaicCanvas = null; // 오프스크린 축소 버퍼(1회 생성 후 재사용, 매 프레임 새로 안 만든다)
let mosaicCtx = null;

// 마지막으로 실제로 그린 "그림+블록단계" 조합. 같으면 다시 안 그린다 —
// 진행률이 프레임마다 미세하게 바뀌어도 계단(steps)이 안 바뀌면 그리기를 건너뛴다.
let lastKey = null;

// "완료!" 연출을 마지막으로 재생시킨 seq. hitSeq와 같은 패턴 — 값 자체가 아니라
// "바뀌었는지"만 본다.
let lastCompleteSeq = 0;

/** 최초 1회. config.fileComplete 값을 --file-complete-* CSS 변수로 흘려보낸다 —
 * style.css의 @keyframes가 이 변수를 읽는다(durationMs를 CSS 변수로 보내는
 * ui/crtTransition.js의 initCrtTransition()과 같은 패턴). 라벨 텍스트도 여기서
 * DOM에 반영해 config 한 곳만 보면 되게 한다. */
export function initUploadPicture() {
  const root = document.documentElement.style;
  const cfg = config.fileComplete;
  root.setProperty('--file-complete-flash-ms', `${cfg.flashMs}ms`);
  root.setProperty('--file-complete-pop-ms', `${cfg.popMs}ms`);
  root.setProperty('--file-complete-pop-scale', cfg.popScale);
  root.setProperty('--file-complete-label-ms', `${cfg.labelMs}ms`);

  const label = document.getElementById('file-complete-label');
  if (label) label.textContent = cfg.labelText;
}

function ensureCanvas() {
  if (canvas) return canvas;
  canvas = document.getElementById('up-thumb');
  if (!canvas) return null;

  canvas.width = config.filePicture.canvasPx;
  canvas.height = config.filePicture.canvasPx;
  ctx = canvas.getContext('2d');

  mosaicCanvas = document.createElement('canvas');
  mosaicCtx = mosaicCanvas.getContext('2d');
  return canvas;
}

/** object-fit:contain — 원본 비율을 지키며 boxW×boxH 안에 잘림 없이 들어갈 사각형(중앙 정렬). */
function containRect(imgW, imgH, boxW, boxH) {
  const scale = Math.min(boxW / imgW, boxH / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

/** progress(0~100) → 블록 한 변(px, 캔버스 내부 해상도 기준). steps 단계로 스냅.
 * ★ 마지막 단계(원본)는 일부러 progress===100보다 한 단계 일찍(steps-1에서) 도달하게
 *   한다. systems/upload.js가 progress>=100인 바로 그 프레임에 completeFile()을 불러
 *   state.file을 다음 파일로 통째로 바꿔버리므로, "블록 크기가 100%에서만 원본"으로
 *   짜면 원본이 그려지는 순간과 파일이 넘어가는 순간이 같은 프레임이라 화면에 단 한
 *   프레임도 안 비친다(실측 스샷으로 확인 — 100%를 찍었더니 이미 다음 파일의 굵은
 *   모자이크가 찍혀 있었다). 마지막 계단을 한 칸 당겨서 완료 직전 구간에는 확실히
 *   원본이 몇 프레임이고 눈에 보이게 한다. */
function blockPxFor(progress) {
  const cfg = config.filePicture;
  const stepIndex = Math.max(0, Math.min(cfg.steps, Math.floor((progress / 100) * cfg.steps)));
  const t = Math.min(1, stepIndex / (cfg.steps - 1)); // 0(=0%, 최대 픽셀화) ~ 1(steps-1번째 계단부터 원본)
  return Math.round(cfg.maxBlockPx + (cfg.minBlockPx - cfg.maxBlockPx) * t);
}

/** 매 프레임 호출. 그림이 없거나(로딩 중) 파일이 없으면 캔버스를 비워 CSS 배경색
 * (베이지, style.css의 .frame .img)이 그대로 비치게 한다. */
export function updateUploadPicture(state) {
  if (!ensureCanvas()) return;

  // 파일 100% 완성 "해냈다" 연출 — systems/file.js의 completeFile()이 세운
  // fileCompleteSeq가 바뀌면(=방금 새로 완성됐으면) .frame의 .file-complete를
  // remove→reflow→add로 재시작시킨다(다른 hitSeq류 트리거와 같은 패턴,
  // ui/statusWindow.js의 hitSeq 소비부 참고 — 그냥 클래스만 add하면 이미
  // 재생 중인 애니가 재시작을 안 해서 파일을 연달아 빨리 끝내면 두 번째부턴
  // 연출이 안 보인다).
  if (state.fileCompleteSeq !== lastCompleteSeq) {
    lastCompleteSeq = state.fileCompleteSeq;
    const frame = document.querySelector('#win-upload .frame');
    if (frame) {
      frame.classList.remove('file-complete');
      void frame.offsetWidth;
      frame.classList.add('file-complete');
    }
  }

  const file = state.file;
  if (!file || !file.pictureImg) {
    if (lastKey !== null) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      lastKey = null;
    }
    return;
  }

  const blockPx = blockPxFor(file.progress);
  const key = `${file.pictureSrc}:${blockPx}`;
  if (key === lastKey) return;
  lastKey = key;

  const img = file.pictureImg;
  const box = canvas.width; // 정사각 캔버스라 width===height

  if (blockPx <= config.filePicture.minBlockPx) {
    // 마지막 계단 — 모자이크 왕복 없이 원본을 바로, 매끈하게 그린다.
    ctx.clearRect(0, 0, box, box);
    ctx.imageSmoothingEnabled = true;
    const r = containRect(img.naturalWidth, img.naturalHeight, box, box);
    ctx.drawImage(img, r.x, r.y, r.w, r.h);
    return;
  }

  // 모자이크 2단계 기법: ① 원본을 아주 작은 오프스크린 캔버스(칸 수 = box/blockPx)에
  // 축소해 담는다(smoothing on = 칸마다 주변 색이 뭉뚱그려 평균난다). ② 그 작은
  // 캔버스를 다시 원래 크기로 확대해 그린다(smoothing off = 계단진 큰 블록으로
  // 보인다 — 여기가 "계단 픽셀 유지"의 핵심).
  const cellsPerSide = Math.max(1, Math.round(box / blockPx));
  mosaicCanvas.width = cellsPerSide;
  mosaicCanvas.height = cellsPerSide;
  mosaicCtx.imageSmoothingEnabled = true;
  mosaicCtx.clearRect(0, 0, cellsPerSide, cellsPerSide);
  const r = containRect(img.naturalWidth, img.naturalHeight, cellsPerSide, cellsPerSide);
  mosaicCtx.drawImage(img, r.x, r.y, r.w, r.h);

  ctx.clearRect(0, 0, box, box);
  ctx.imageSmoothingEnabled = false; // ★ 이걸 안 끄면 그냥 흐릿해질 뿐 계단이 안 보인다
  ctx.drawImage(mosaicCanvas, 0, 0, cellsPerSide, cellsPerSide, 0, 0, box, box);
}
