// 이 파일 역할: 방해꾼 PNG를 미리 읽어 id로 꺼내 쓸 수 있게 보관한다.
// 파일명은 enemies 시트의 id와 1:1로 맞춰져 있다
// (basic → assets/enemies/basic.png). 로드에 실패한 이미지는 null로 남고,
// ui.js가 그때만 색 사각형으로 대신 그린다 — 이미지 하나 없다고 게임이 멈추지 않는다.

const ENEMY_DIR = './assets/enemies/';

/** id -> HTMLImageElement (로드 실패 시 해당 키는 없음) */
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
 * 주어진 id 목록의 PNG를 병렬로 읽는다. 실패해도 reject하지 않는다.
 * 이미 읽어둔 id는 건너뛰므로 리로드 후 다시 불러도 낭비가 없다.
 */
export async function loadEnemyImages(ids) {
  const pending = ids.filter((id) => !enemyImages[id]);

  const results = await Promise.all(
    pending.map(async (id) => ({ id, img: await loadImage(`${ENEMY_DIR}${id}.png`) })),
  );

  const missing = [];
  for (const { id, img } of results) {
    if (img) enemyImages[id] = img;
    else missing.push(id);
  }

  if (missing.length) {
    console.warn(`[assets] PNG를 못 읽어 색 사각형으로 대체: ${missing.join(', ')}`);
  }
  return enemyImages;
}
