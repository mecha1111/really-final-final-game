// 이 파일 역할: 방해꾼 PNG를 미리 읽어 "키"로 꺼내 쓸 수 있게 보관한다.
// 키는 두 가지 형태다:
//   - 폴더 없는 종류(copier/fake_btn/hidden): enemies 시트의 id 그대로 (basic → assets/enemies/copier.png)
//   - 프레임 폴더가 있는 종류(basic/bomb/unplug/popup/bait/ransom/clone + 소품 cursor):
//     sprite/animator.js가 만들어주는 상대경로 (예: 'basic/1_alive' → assets/enemies/basic/1_alive.png)
// 어느 쪽이든 loadImage()가 똑같이 개별 PNG를 하나씩 읽는다 — 나중에 스프라이트시트로
// 바꿀 때도 이 함수 안쪽만 갈아 끼우면 되게 감싸 놓았다.
// 로드에 실패한 키는 그냥 비어있고, ui가 그때만 색 사각형으로 대신 그린다 —
// 이미지 하나 없다고 게임이 멈추지 않는다.

const ENEMY_DIR = './assets/enemies/';

/** 키(id 또는 'basic/1_alive' 같은 상대경로) -> HTMLImageElement (로드 실패 시 해당 키는 없음) */
export const enemyImages = {};

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * 주어진 키 목록의 PNG를 병렬로 읽는다. 실패해도 reject하지 않는다.
 * 이미 읽어둔 키는 건너뛰므로 리로드 후 다시 불러도 낭비가 없다.
 * (main.js가 sprite/animator.js의 buildAssetKeys()로 이 목록을 만들어 넘긴다.)
 */
export async function loadEnemyImages(keys) {
  const pending = keys.filter((key) => !enemyImages[key]);

  const results = await Promise.all(
    pending.map(async (key) => ({ key, img: await loadImage(`${ENEMY_DIR}${key}.png`) })),
  );

  const missing = [];
  for (const { key, img } of results) {
    if (img) enemyImages[key] = img;
    else missing.push(key);
  }

  if (missing.length) {
    console.warn(`[assets] PNG를 못 읽어 색 사각형으로 대체: ${missing.join(', ')}`);
  }
  return enemyImages;
}
