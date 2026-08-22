// 이 파일 역할: .exe 창에 표시할 "업데이트 중" 그림을 등급 폴더에서 랜덤으로 고르고 미리 읽는다.
// 실제로 캔버스에 그리는(모자이크→원본) 쪽은 ui/uploadPicture.js가 맡는다 — 여긴 "무슨
// 그림을 쓸지"만 정한다.

import { config } from '../config.js';

const FOLDER_BY_TIER = { small: 'small', medium: 'medium', large: 'large' };
const PREFIX_BY_TIER = { small: 'char_s_', medium: 'char_m_', large: 'char_l_' };

/** src(경로) -> HTMLImageElement. 로드 실패 시 그 src는 안 들어간다.
 * 같은 그림이 나중에 다시 뽑혀도(폴더가 작으면 흔하다) 다시 읽지 않게 캐싱한다. */
const imageCache = {};

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      imageCache[src] = img;
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function randomSrc(tierKey) {
  const cfg = config.filePicture;
  const folder = FOLDER_BY_TIER[tierKey] ?? FOLDER_BY_TIER.small;
  const prefix = PREFIX_BY_TIER[tierKey] ?? PREFIX_BY_TIER.small;
  const n = 1 + Math.floor(Math.random() * cfg.countPerTier);
  return `${cfg.dir}${folder}/${prefix}${String(n).padStart(2, '0')}.png`;
}

/**
 * tierKey('small'|'medium'|'large')에 맞는 폴더에서 그림을 랜덤 1장 고르고 미리 읽는다.
 * @param {string} tierKey
 * @param {string|null} excludeSrc 직전 그림 경로 — 폴더에 2장 이상 있으면 이거 말고 다른
 *   걸 고르려 몇 번 다시 뽑는다(운 나쁘게 계속 같은 게 나오면 포기하고 그냥 쓴다 —
 *   무한루프 방지, countPerTier가 1이면 애초에 재시도할 이유가 없다).
 * @returns {Promise<{src: string, img: HTMLImageElement|null}>}
 */
export async function pickFilePicture(tierKey, excludeSrc) {
  const cfg = config.filePicture;
  let src = randomSrc(tierKey);
  for (let tries = 0; tries < 5 && cfg.countPerTier > 1 && src === excludeSrc; tries++) {
    src = randomSrc(tierKey);
  }

  const img = imageCache[src] ?? (await loadImage(src));
  if (!img) console.warn(`[filePicture] 그림을 못 읽음: ${src}`);
  return { src, img };
}
