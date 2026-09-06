// 이 파일 역할: 방해꾼 스프라이트 애니메이션의 "프레임 정의"와 "지금 몇 번째 프레임인지" 계산.
// 잎 모듈이다 — config.js만 본다(Enemy/렌더/스포너 등 다른 모듈이 이 모듈을 보되, 이 모듈은
// 그것들을 몰라야 순환참조가 안 생긴다). 방해꾼 렌더(ui/renderEnemies.js, ui/baitRender.js)는
// "지금 그릴 이미지 키가 뭐야?"만 이 모듈에 묻고, 실제 시간 계산(now 기준)은 여기 한 곳에서만 한다
// — 렌더루프가 넘겨주는 단일 시계(now, requestAnimationFrame의 timestamp)를 그대로 쓰므로
// setInterval을 따로 두지 않는다.
//
// PNG는 개별 파일로 그대로 쓰지만(assets.js의 loadImage), 나중에 스프라이트시트로 바꾸더라도
// 이 모듈이 내보내는 함수 이름/의미(getFrameKey 등)는 그대로 유지할 수 있게 프레임 "키"(경로
// 문자열)만 주고받는다 — 호출부는 실제 로드 방식을 몰라도 된다.

import { config } from '../config.js';

/**
 * 종류별 프레임 정의. 여기 적힌 배열의 "길이"가 곧 frameCount다 — 렌더 로직에
 * 숫자를 따로 하드코딩하지 않고 전부 이 표에서 읽는다.
 * 폴더가 없는 종류(copier/hidden)는 여기 없다 — enemyAssetKeys/getFrameKey가
 * 자동으로 "낱개 png(id 그대로)"로 폴백한다.
 */
export const FRAME_SETS = {
  // 잡몹 3종 × 생존/죽음. 스폰 시 variant를 하나 골라 그 세트로 계속 루프하다가
  // 죽으면 같은 variant의 dead 한 장으로 바뀐다.
  basic: {
    variants: ['1', '2', '3'],
    alive: (v) => [`basic/${v}_alive`],
    dead: (v) => `basic/${v}_dead`,
  },
  bomb: { loop: ['bomb/1', 'bomb/2'] },
  unplug: { loop: ['unplug/1', 'unplug/2', 'unplug/3'] },
  // 팝업 광고창. 노랑(a)/핑크(b) 중 스폰 시 하나를 골라 그 세트로 계속 루프한다.
  // ★ a와 b는 X 버튼 위치가 서로 다르다(a=상단 팻말, b=우하단) — 클릭 판정도
  //   variant별로 갈라진다(config.enemy.artHitbox의 'popup:a' / 'popup:b').
  popup: {
    sets: { a: ['popup/a_1', 'popup/a_2'], b: ['popup/b_1', 'popup/b_2'] },
  },
  // 함정 "확인" 창. 2프레임 루프(확인 버튼 초록칠이 번갈아 짙어져 깜빡이는
  // 느낌 — 2026-08-22 그림 교체, 예전엔 3프레임이었다). 누르면 안 되는
  // 놈이라 죽지 않고 벌칙만 준다.
  fake_btn: { loop: ['fake_btn/fake_btn_1', 'fake_btn/fake_btn_2'] },
  // 시선강탈. 2프레임 애니(a/b)가 아니라 종류별 512x512 정지 그림 4장 —
  // 스폰 시 enemies/bait.js가 하나를 골라 enemy.baitKind에 고정하고, 그 뒤로는
  // (다른 종류처럼 루프하지 않고) 항상 같은 그림 한 장을 계속 그린다. 실제 연출
  // (등장/소멸)은 ui/baitRender.js가 이 정지 그림 위에 얹는다.
  // 파일 위치: assets/enemies/bait/bait_<kind>.png
  bait: {
    kinds: ['nobubble', 'bubble', 'julgeopda', 'gyaru'],
  },
  // 탱커. 체력 비율로 s1(건강)→s2→s3(위태) 단계를 고르고, 각 단계는 2장 루프.
  // 피격 직후엔 잠깐 hit 한 장을 끼워 보여준다.
  ransom: {
    stage: {
      1: ['ransom/s1_1', 'ransom/s1_2'],
      2: ['ransom/s2_1', 'ransom/s2_2'],
      3: ['ransom/s3_1', 'ransom/s3_2'],
    },
    hit: 'ransom/hit',
  },
  // 분열 벌레. 루프 애니가 아니라 tier(0=대/1=중/2=소)로 정적 프레임을 고른다.
  clone: { tier: ['clone/big', 'clone/mid', 'clone/small'] },
  // 모래시계 함정. 루프 없이 정지 그림 한 장.
  hourglass: { single: 'hourglass/hourglass_1' },
  // copier가 안착 시 뿌리는 가짜 커서. 방해꾼(enemies 시트)이 아니라 effects.js가
  // 직접 그리는 소품이라 enemyAssetKeys 대신 EXTRA_ASSET_KEYS로 미리 불러둔다.
  cursor: { single: 'cursor/cursor' },
};

/** 루프 애니 한 장 고르기. now(ms)/frameDuration(ms) 기준 — setInterval 없이 렌더루프 시계로만 정한다. */
function pickLoopFrame(frames, now) {
  const frameMs = config.anim.frameDurationMs;
  const i = Math.floor(now / frameMs) % frames.length;
  return frames[i];
}

/** 체력 비율로 랜섬 단계(1~3)를 고른다. hp/maxHp 셋 다 시트 값 그대로 — 새 임계값을 만들지 않고
 * hp를 3등분해서 재사용한다(예: maxHp=3이면 hp=3→1단계, 2→2단계, 1→3단계와 정확히 맞아떨어진다). */
function ransomStage(enemy) {
  const ratio = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 0;
  if (ratio > 2 / 3) return 1;
  if (ratio > 1 / 3) return 2;
  return 3;
}

/** 스폰 시 1회. basic이 어떤 잡몹(1/2/3) 얼굴로 나올지 고른다. */
export function pickBasicVariant() {
  const variants = FRAME_SETS.basic.variants;
  return variants[Math.floor(Math.random() * variants.length)];
}

/** 스폰 시 1회. a/b 두 종류 그림 중 하나를 고른다(popup의 노랑/핑크 광고, 훗날 bait도). */
export function pickAbVariant() {
  return Math.random() < 0.5 ? 'a' : 'b';
}

/**
 * 지금 이 방해꾼을 그릴 프레임 키(확장자 없는 상대 경로, assets.js의 enemyImages 키와 같다).
 * now는 렌더루프의 단일 시계(ms) — ui/render.js가 requestAnimationFrame timestamp를 그대로 내려준다.
 */
export function getFrameKey(enemy, now) {
  const id = enemy.id;

  if (id === 'basic') {
    const v = enemy.basicVariant ?? FRAME_SETS.basic.variants[0];
    if (!enemy.alive) return FRAME_SETS.basic.dead(v);
    return pickLoopFrame(FRAME_SETS.basic.alive(v), now);
  }

  if (id === 'ransom') {
    if (enemy.hitFrameTimer > 0) return FRAME_SETS.ransom.hit;
    return pickLoopFrame(FRAME_SETS.ransom.stage[ransomStage(enemy)], now);
  }

  if (id === 'clone') {
    const tiers = FRAME_SETS.clone.tier;
    return tiers[Math.min(enemy.tier, tiers.length - 1)];
  }

  if (id === 'bait') {
    // 스폰 시 enemies/bait.js가 고른 종류로 고정 — 루프 없이 정지 그림 한 장.
    const kind = enemy.baitKind ?? FRAME_SETS.bait.kinds[0];
    return `bait/bait_${kind}`;
  }

  const set = FRAME_SETS[id];

  // a/b 두 벌을 가진 종류(popup의 노랑/핑크 광고). 스폰 때 고른 쪽으로 계속 루프한다.
  if (set?.sets) {
    const frames = set.sets[enemy.abVariant ?? 'a'];
    // 에셋 대기 중인 종류(bait)는 세트가 비어있다 — 그리기 폴백(색 사각형)으로 넘긴다.
    if (!frames || frames.length === 0) return id;
    return pickLoopFrame(frames, now);
  }

  if (set?.loop) return pickLoopFrame(set.loop, now);
  if (set?.single) return set.single;

  // 폴더 없는 종류(copier/hidden) — 낱개 png를 id 그대로 쓴다.
  return id;
}

/** 이 spec(enemies 시트 한 행)이 미리 읽어야 할 이미지 키 전부. 폴더 정의가 없으면 [id] 하나뿐이다. */
export function enemyAssetKeys(spec) {
  const set = FRAME_SETS[spec.id];
  if (!set) return [spec.id];

  const keys = new Set();
  if (set.loop) set.loop.forEach((k) => keys.add(k));
  if (set.single) keys.add(set.single);
  if (set.hit) keys.add(set.hit);
  if (set.tier) set.tier.forEach((k) => keys.add(k));
  if (set.variants) {
    for (const v of set.variants) {
      set.alive(v).forEach((k) => keys.add(k));
      keys.add(set.dead(v));
    }
  }
  if (set.sets) Object.values(set.sets).forEach((arr) => arr.forEach((k) => keys.add(k)));
  if (set.stage) Object.values(set.stage).forEach((arr) => arr.forEach((k) => keys.add(k)));
  if (set.kinds) set.kinds.forEach((k) => keys.add(`bait/bait_${k}`));

  return [...keys];
}

// enemies 시트에는 없지만(스폰 가능한 적이 아니라 소품) 항상 미리 읽어둬야 하는 이미지.
// cursor/cursor는 copier의 가짜 커서(enemies/effects.js → ui/renderEnemies.js drawCursorGlyph)가 쓴다.
export const EXTRA_ASSET_KEYS = enemyAssetKeys({ id: 'cursor' });

/** main.js가 loadEnemyImages에 넘길 전체 키 목록. gameData.enemies(시트 행들) + 소품 몫까지 합친다. */
export function buildAssetKeys(specs) {
  const keys = new Set(EXTRA_ASSET_KEYS);
  for (const spec of specs) enemyAssetKeys(spec).forEach((k) => keys.add(k));
  return [...keys];
}
