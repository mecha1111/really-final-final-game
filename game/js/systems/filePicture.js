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

const TIERS = ['small', 'medium', 'large'];

/**
 * 이 게임에 존재하는 완성 그림 src 전체 목록 — 등급 순서 고정(소→중→대, 각 등급
 * 안에서는 번호순), 총 countPerTier×3장(현재 12×3=36).
 *
 * ★ 파일 스캔이 아니다. config.filePicture.countPerTier와 위 명명 규칙(폴더/
 *   접두사)의 조합으로 "있어야 할" 경로를 만드는 것뿐이다 — 브라우저는 폴더
 *   목록을 못 읽으므로 실제 개수와 다르면 없는 파일을 가리키게 된다(config.js의
 *   countPerTier 주석과 같은 함정).
 *
 * ★ 단일 진실원: 갤러리(ui/galleryPanel.js)가 36칸을 그릴 때도 이 함수를 그대로
 *   쓴다. randomSrc()도 매번 새로 조합하지 않고 이 함수가 만든 목록에서 골라
 *   쓰도록 바꿨다 — 목록을 만드는 규칙이 두 곳으로 갈리면 언젠가 반드시
 *   어긋난다(갤러리엔 있는데 실제로는 안 뽑히는 그림, 혹은 그 반대).
 */
export function allPictureSrcs() {
  const cfg = config.filePicture;
  const list = [];
  for (const tier of TIERS) {
    const folder = FOLDER_BY_TIER[tier];
    const prefix = PREFIX_BY_TIER[tier];
    for (let n = 1; n <= cfg.countPerTier; n++) {
      list.push(`${cfg.dir}${folder}/${prefix}${String(n).padStart(2, '0')}.png`);
    }
  }
  return list;
}

const TIER_LABEL_KR = { small: '소', medium: '중', large: '대' };

/**
 * src(경로) → 갤러리 확대 팝업에 띄우는 표시 이름("소_07"). 2026-09-07 신설
 * (갤러리 확대 팝업). ★allPictureSrcs()와 같은 FOLDER_BY_TIER를 그대로 다시
 * 써서 폴더명→등급 한글을 뒤집어 찾는다 — 명명 규칙을 여기 따로 안 박는 게
 * 목적이라(위 allPictureSrcs 주석의 "단일 진실원" 원칙과 같은 이유), 이 함수가
 * 어긋난 이름을 낼 일이 구조적으로 없다.
 */
export function pictureLabel(src) {
  const m = src.match(/\/(small|medium|large)\/\D*(\d+)\.png$/);
  if (!m) return src; // 형식이 안 맞는 src(테스트용 등) — 원본을 그대로 보여준다
  const [, tier, num] = m;
  return `${TIER_LABEL_KR[tier]}_${num}`;
}

function randomSrc(tierKey) {
  const folder = FOLDER_BY_TIER[tierKey] ?? FOLDER_BY_TIER.small;
  // allPictureSrcs()가 만든 전체 목록에서 이 등급 폴더에 해당하는 것만 추려 그중
  // 하나를 고른다 — 매 호출마다 36개를 다시 만들지만(문자열 조합뿐이라 비용은
  // 무시할 만하다), 목록을 만드는 코드가 정확히 한 곳(allPictureSrcs)뿐이라는
  // 이득이 그보다 크다.
  const tierList = allPictureSrcs().filter((src) => src.includes(`/${folder}/`));
  if (tierList.length === 0) return allPictureSrcs()[0]; // 설정이 깨진 극단적인 경우의 안전망
  return tierList[Math.floor(Math.random() * tierList.length)];
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
