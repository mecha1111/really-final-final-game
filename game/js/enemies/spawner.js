// 이 파일 역할: 언제 / 무엇을 / 어디에 스폰할지 결정한다.
// 간격·동시 수는 difficulty 시트, 등장 조건은 enemies 시트(weight, min_stage),
// 겹침 방지는 stage 시트(min_gap)에서 온다.

import { config, getScaleFactor } from '../config.js';
import { Enemy } from './Enemy.js';

export class Spawner {
  constructor() {
    this.timer = 0;
  }

  /**
   * 판이 시작될 때 호출. 첫 방해꾼도 다른 스폰과 똑같이 spawn_interval을
   * 기다렸다 나온다 — 0으로 두면 시작하자마자 A타입이 튀어나와
   * 손 쓸 새도 없이 업로드가 멈춰버린다.
   */
  reset(rules) {
    this.timer = rules.spawnInterval;
  }

  /**
   * @param {number} dt
   * @param {object} world { rules, playArea, enemies, pool, pointer }
   *   pool: 이번 판에 등장 가능한 spec 목록(min_stage로 이미 걸러진 것)
   *   pointer: copier가 진짜 커서 근처에 스폰되기 위해 필요
   * @returns {Enemy[]} 이번 프레임에 새로 생긴 방해꾼
   */
  update(dt, world) {
    const { rules, enemies, pool } = world;
    if (pool.length === 0) return [];

    this.timer -= dt;
    if (this.timer > 0) return [];

    // 간격은 매번 다시 읽는다 — 디버그 패널에서 실시간으로 바꿔도 바로 먹힌다.
    this.timer = rules.spawnInterval;

    // 살아있는 수가 상한이면 이번 차례는 건너뛴다.
    if (enemies.length >= rules.maxAlive) return [];

    // 종류별 동시 등장 상한(config.enemy.maxConcurrentById) — 이번 차례에 뽑을
    // 후보에서 이미 상한에 닿은 종류를 미리 걸러낸다. 그러니까 "대체"다: copier가
    // 상한(1마리)에 걸려 있으면 이번 굴림은 나머지 pool 중에서만 골라지고, 굴릴
    // 후보가 아예 없으면(전부 상한) 스폰 자체를 건너뛴다.
    const spawnable = filterByConcurrencyCap(pool, enemies);
    if (spawnable.length === 0) return [];

    const spec = pickWeighted(spawnable);
    if (!spec) return [];

    return [this.spawnOne(spec, world)];
  }

  spawnOne(spec, world) {
    const { rules, playArea, enemies, pointer } = world;
    const pos = findSpawnPos(spec, enemies, playArea, rules);
    // ★ 2026-09-07: 여기 있던 bait/popup "첫 등장 팁"(showTip) 두 줄을 걷어냈다.
    //   방해꾼이 날뛰는 와중에 화면 구석에서 뜨는 안내는 아무도 안 읽어서 튜토리얼로
    //   기능하지 못했다. 조작 설명은 이제 게임 시작 전 도우미 튜토리얼
    //   (ui/gameOpening.js, 2026-09-08 전에는 ui/intro.js였다)이 통째로 맡는다 —
    //   그리고 bait/popup은 ★일부러 안 알려준다. 직접 눌러보고 알아내는 게 이
    //   게임의 재미다(그 튜토리얼 대본에도 없다).
    return new Enemy(spec, { x: pos.x, y: pos.y, rules, playArea, pointer });
  }
}

/**
 * 이번 일차(stage)에 등장할 수 있는 방해꾼만 남긴다.
 * config.enemy.disabledIds에 올라온 종류는 시트에 있어도 스폰하지 않는다 —
 * 지금은 비어있다(bait는 그림 4종이 도착해 2026-08-22부로 되살렸다).
 * 디버그 소환(__game.spawn)은 이 목록을 안 거치므로 테스트는 그대로 된다.
 */
export function buildPool(specs, stage) {
  const disabled = config.enemy.disabledIds;
  return specs.filter((s) => (s.min_stage ?? 1) <= stage && !disabled.includes(s.id));
}

/**
 * config.enemy.maxConcurrentById에 상한이 걸린 종류는, 지금 살아있는 수가 그
 * 상한에 이미 닿았으면 이번 굴림 후보에서 뺀다. 표에 없는 종류는 무제한(기존과
 * 동일) — copier처럼 "한 번에 하나만 쫓아와야 압박이 산다" 싶은 종류만 여기 올린다.
 * ★ corpseTimer로 잠깐 화면에 남는 시체는 안 센다(enemy.countsForConcurrency가
 *   기본은 .alive만 본다) — "지금 실제로 쫓아오는 놈"이 몇 마리인지가 기준이지,
 *   막 죽어가는 잔상까지 포함하면 다음 한 마리가 나올 타이밍이 부당하게 늦어진다.
 *   단, zombie는 부활 대기 중에도 셈에 포함된다(그 게터 주석 참고) — 그래야
 *   부활을 기다리는 동안 새 zombie가 상한 없이 계속 채워지지 않는다.
 */
function filterByConcurrencyCap(pool, enemies) {
  const limits = config.enemy.maxConcurrentById;
  if (!limits) return pool;

  return pool.filter((spec) => {
    const cap = limits[spec.id];
    if (cap == null) return true;
    const aliveCount = enemies.reduce((n, e) => n + (e.countsForConcurrency && e.id === spec.id ? 1 : 0), 0);
    return aliveCount < cap;
  });
}

/** weight 칸을 가중치로 써서 하나 고른다. weight가 클수록 자주 나온다. */
export function pickWeighted(pool) {
  const total = pool.reduce((sum, s) => sum + Math.max(0, s.weight ?? 0), 0);
  if (total <= 0) return pool[Math.floor(Math.random() * pool.length)] ?? null;

  let roll = Math.random() * total;
  for (const spec of pool) {
    roll -= Math.max(0, spec.weight ?? 0);
    if (roll <= 0) return spec;
  }
  return pool[pool.length - 1];
}

/**
 * 기존 방해꾼들과 min_gap 이상 떨어진 자리를 찾는다.
 * 정해진 횟수 안에 못 찾으면 "그나마 가장 널널한" 자리를 쓴다
 * (스폰을 거르는 것보다 겹치더라도 나오는 편이 난이도 예측에 낫다).
 */
function findSpawnPos(spec, enemies, playArea, rules) {
  // spec.size_w/h는 기준 해상도 값이라, 실제로 놓일 스케일된 크기로 변환해서
  // 계산해야 이미 배치된(스케일된) 방해꾼들과 간격이 맞는다. 여기서 안 맞추면
  // 화면이 커졌을 때 가장자리에 방해꾼이 반쯤 잘려 나오게 된다.
  const scaleFactor = getScaleFactor();
  const halfW = ((spec.size_w || 60) * scaleFactor) / 2;
  const halfH = ((spec.size_h || 60) * scaleFactor) / 2;
  const minGap = rules.minGap * scaleFactor;

  const minX = playArea.x + halfW;
  const maxX = playArea.x + playArea.w - halfW;
  const minY = playArea.y + halfH;
  const maxY = playArea.y + playArea.h - halfH;

  let best = null;
  let bestGap = -Infinity;

  for (let i = 0; i < config.enemy.spawnTries; i++) {
    const x = minX + Math.random() * Math.max(0, maxX - minX);
    const y = minY + Math.random() * Math.max(0, maxY - minY);

    const gap = nearestGap(x, y, halfW, halfH, enemies);
    if (gap >= minGap) return { x, y };

    if (gap > bestGap) {
      bestGap = gap;
      best = { x, y };
    }
  }

  return best ?? { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/** (x,y)에 놓을 때 가장 가까운 방해꾼과의 사각형 간격(px). 겹치면 음수. */
function nearestGap(x, y, halfW, halfH, enemies) {
  let nearest = Infinity;

  for (const e of enemies) {
    const dx = Math.abs(x - e.x) - (halfW + e.w / 2);
    const dy = Math.abs(y - e.y) - (halfH + e.h / 2);
    // 두 축 중 하나라도 떨어져 있으면 그만큼이 간격이다
    const gap = Math.max(dx, dy);
    if (gap < nearest) nearest = gap;
  }

  return nearest;
}
