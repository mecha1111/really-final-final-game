// 이 파일 역할: 언제 / 무엇을 / 어디에 스폰할지 결정한다.
// 간격·동시 수는 difficulty 시트, 등장 조건은 enemies 시트(weight, min_stage),
// 겹침 방지는 stage 시트(min_gap)에서 온다.

import { config, getScaleFactor } from '../config.js';
import { gameData } from '../balance/loader.js';
import { Enemy } from './Enemy.js';

export class Spawner {
  constructor() {
    this.timer = 0;
    // 이번 구간에서 새로 해금된 종류의 id 목록(등장 순서대로) — reset()이 채우고
    // update()가 하나씩 빼 쓴다. config.enemy.soloIntroSec 주석 참고.
    this.soloQueue = [];
  }

  /**
   * 판이 시작될 때 호출. 첫 방해꾼도 다른 스폰과 똑같이 spawn_interval을
   * 기다렸다 나온다 — 0으로 두면 시작하자마자 A타입이 튀어나와
   * 손 쓸 새도 없이 업로드가 멈춰버린다.
   *
   * ★ 2026-09-10: soloQueue도 여기서 같이 잡는다 — 이번 rules.stage에서
   *   min_stage가 "정확히" 이번 구간과 같은 것만 신규다(그 전 구간에서 이미
   *   해금된 건 min_stage가 더 작으므로 안 걸린다). buildPool을 다시 부르는
   *   이유: update()가 받는 world.pool은 첫 프레임이 되어야 stageManager가
   *   만들어 넘겨주는데, 그 전에(이 reset 시점에) 큐를 먼저 정해둬야 첫
   *   프레임부터 곧바로 단독 등장 로직을 탈 수 있다.
   */
  reset(rules) {
    this.timer = rules.spawnInterval;
    const pool = buildPool(gameData.enemies, rules.stage);
    this.soloQueue = pool.filter((s) => (s.min_stage ?? 1) === rules.stage).map((s) => s.id);
  }

  /**
   * @param {number} dt
   * @param {object} world { rules, playArea, enemies, pool, pointer, elapsed }
   *   pool: 이번 판에 등장 가능한 spec 목록(min_stage로 이미 걸러진 것)
   *   pointer: copier가 진짜 커서 근처에 스폰되기 위해 필요
   *   elapsed: 이번 구간이 시작된 뒤 흐른 시간(초) — 단독 등장 마감 판정용
   * @returns {Enemy[]} 이번 프레임에 새로 생긴 방해꾼
   */
  update(dt, world) {
    const { rules, enemies, pool } = world;
    if (pool.length === 0) return [];

    // ── 신규 종류 단독 등장(config.enemy.soloIntroSec) ─────────────────────
    // 큐가 비어있지 않은 동안은 정상 스폰을 통째로 쉰다 — 그래야 "화면이
    // 비었다"가 이 대기 중에 다른 스폰으로 다시 채워지지 않고 그대로 유지된다.
    // 화면이 실제로 비었거나 마감 시각이 되면 큐의 맨 앞을 그 자리에서 낸다.
    if (this.soloQueue.length > 0) {
      const elapsed = world.elapsed ?? 0;
      const screenEmpty = enemies.every((e) => !e.alive);
      if (!screenEmpty && elapsed < config.enemy.soloIntroSec) return [];

      const id = this.soloQueue.shift();
      this.timer = rules.spawnInterval; // 정상 스폰 타이머도 이 순간부터 다시 잰다
      const spec = pool.find((s) => s.id === id);
      // 방어적 분기 — pool은 soloQueue와 같은 stage 필터를 거치므로 이론상
      // 항상 찾는다. 못 찾아도(시트가 판 중간에 바뀌는 등의 극단적 상황) 게임이
      // 죽지 않고 그 항목만 조용히 건너뛴다.
      return spec ? [this.spawnOne(spec, world)] : [];
    }

    this.timer -= dt;
    if (this.timer > 0) return [];

    // 간격은 매번 다시 읽는다 — 디버그 패널에서 실시간으로 바꿔도 바로 먹힌다.
    this.timer = rules.spawnInterval;

    // 살아있는 수가 상한이면 이번 차례는 건너뛴다.
    // ★ 2026-09-10: enemies.length(배열 전체 길이)가 아니라 aliveHeadcount로
    //   센다 — 배열 길이를 그대로 쓰면 시체가 사라지는 동안 슬롯이 이유 없이
    //   막힌다. core/stageManager.js의 분열 쪽 클램프(buildSplitCap)도 이 함수를
    //   그대로 가져다 쓴다 — 같은 상한을 두 곳이 다르게 읽지 않도록.
    //   ★ 같은 날 다시 추가: 그렇다고 시체를 "전혀" 안 세면 처치 직후 바로 다음
    //     놈이 그 자리를 채워버려 1구간 초심자가 숨 돌릴 틈이 없어졌다(43%→17%).
    //     그래서 killSlotHoldTimer로 아주 짧게만(config.enemy.killSlotHoldSec)
    //     자리를 붙든다 — countsForConcurrency 게터 주석 참고.
    if (aliveHeadcount(enemies) >= rules.maxAlive) return [];

    // 종류별 동시 등장 상한(config.enemy.maxConcurrentById) — 이번 차례에 뽑을
    // 후보에서 이미 상한에 닿은 종류를 미리 걸러낸다. 그러니까 "대체"다: copier가
    // 상한(1마리)에 걸려 있으면 이번 굴림은 나머지 pool 중에서만 골라지고, 굴릴
    // 후보가 아예 없으면(전부 상한) 스폰 자체를 건너뛴다.
    const capped = filterByConcurrencyCap(pool, enemies);
    if (capped.length === 0) return [];

    // 상호배제 그룹(config.enemy.exclusiveGroups) — 위 상한을 통과했더라도,
    // 같은 그룹의 다른 종류가 이미 살아있으면 이번 굴림 후보에서 뺀다.
    const spawnable = filterByExclusiveGroups(capped, enemies);
    if (spawnable.length === 0) return [];

    // 동시 화면 "종류 수" 상한(rules.typeCap, 마릿수 상한과 별개 축) — 이미
    // 화면에 떠 있는 종류 가짓수가 상한에 닿았으면, 아직 화면에 없는 새 종류를
    // 후보에서 뺀다(이미 떠 있는 종류를 한 마리 더 늘리는 건 막지 않는다).
    const typeCapped = filterByTypeCap(spawnable, enemies, rules.typeCap);
    if (typeCapped.length === 0) return [];

    const spec = pickWeighted(typeCapped);
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
 * 지금 "자리를 차지하고" 있는 놈이 몇 마리인지 센다. countsForConcurrency
 * 기준이다 — 살아있는 놈은 당연히 포함하고, 부활을 기다리는 zombie도
 * 포함한다(그 게터 주석 참고 — 곧 되살아날 자리라 비워두면 안 된다). 방금
 * 처치된 놈도 killSlotHoldTimer가 남아있는 동안은 포함한다(config.enemy.
 * killSlotHoldSec — corpseTimer와는 독립된 별개 타이머다, 그 주석 참고). 두
 * 타이머가 모두 닳은 순수 시각용 잔상만 안 센다. "동시 마릿수" 상한
 * (rules.maxAlive)이 묻는 질문이 정확히 이것이다.
 *
 * ★ 이 게임에서 "동시 몇 마리인가"(rules.maxAlive 상한)를 묻는 자리는 전부
 *   이 함수 하나로 답한다 — 스폰 게이트(위 update())와 분열 자식의 상한
 *   클램프(core/stageManager.js의 buildSplitCap)가 각자 다시 세면 기준이
 *   조용히 갈라진다(실제로 그랬다 — update()의 마릿수 게이트가 예전엔
 *   enemies.length를, 분열 쪽은 처음부터 .alive를 써서 서로 달랐다).
 * ★ 2026-09-10 — 처음엔 .alive만 봤다("살아있는 놈만 센다"). 그런데 그러면
 *   부활 대기 zombie가 이 게이트에서 자리를 못 지켜서, 대기 중에 다른 종류가
 *   그 자리를 채웠다가 부활 순간 상한을 넘길 수 있었다 — filterByConcurrencyCap·
 *   filterByExclusiveGroups가 진작부터 countsForConcurrency를 쓰는 것과 같은
 *   이유로, 여기도 같은 기준으로 맞춘다. "시체 제외"와 "부활 대기 포함"은
 *   서로 다른 축이다: 전자는 죽어서 다시 안 돌아올 놈(corpseTimer만 남았다),
 *   후자는 잠깐 안 보일 뿐 곧 돌아올 놈이다.
 */
export function aliveHeadcount(enemies) {
  return enemies.filter((e) => e.countsForConcurrency).length;
}

/**
 * 지금 화면에 "보이는" 종류 집합. 위 aliveHeadcount와 같은 .alive 기준이다 —
 * 아래 filterByTypeCap과 core/stageManager.js의 분열 쪽 종류 상한
 * (buildSplitCap)이 이 함수 하나를 같이 쓴다.
 */
export function aliveTypeSet(enemies) {
  return new Set(enemies.filter((e) => e.alive).map((e) => e.id));
}

/**
 * config.enemy.maxConcurrentById에 상한이 걸린 종류는, 지금 살아있는 수가 그
 * 상한에 이미 닿았으면 이번 굴림 후보에서 뺀다. 표에 없는 종류는 무제한(기존과
 * 동일) — copier처럼 "한 번에 하나만 쫓아와야 압박이 산다" 싶은 종류만 여기 올린다.
 * ★ aliveHeadcount와 같은 countsForConcurrency 기준이라, 방금 처치된 놈도
 *   killSlotHoldTimer가 남아있는 짧은 동안은 같이 센다(config.enemy.
 *   killSlotHoldSec) — 그 시간이 지나 순수 시각용 잔상(corpseTimer)만 남으면
 *   더는 안 센다. zombie는 부활 대기 중에도 셈에 포함된다(그 게터 주석 참고) —
 *   그래야 부활을 기다리는 동안 새 zombie가 상한 없이 계속 채워지지 않는다.
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

/**
 * config.enemy.exclusiveGroups에 올라온 그룹 중 하나라도 이미 살아있으면, 같은
 * 그룹의 나머지 종류를 이번 굴림 후보에서 뺀다. 개별 상한(filterByConcurrencyCap)만
 * 으로는 "copier 1마리 + hourglass 1마리 + fake_btn 1마리"가 동시에 떠 있는 걸
 * 못 막는다 — 셋 다 손을 뺏거나 오조작을 유도하는 계열이라 이렇게 겹치면 개별
 * 상한을 지켜도 화면이 막혀서 진행이 안 된다(2026-09-10, config.js 주석 참고).
 * ★ "살아있는가" 판정은 filterByConcurrencyCap과 반드시 같은 기준
 *   (enemy.countsForConcurrency)을 쓴다 — 두 필터가 시체·부활 대기 처리를
 *   다르게 하면 "상한엔 안 걸렸는데 상호배제엔 걸린다" 같은 조용한 불일치가 생긴다.
 * 후보가 전부 걸러지면(그룹 셋이 이미 다 살아있는 등) 빈 배열을 반환하고,
 * 호출부(update)는 기존과 같이 이번 차례 스폰을 건너뛴다.
 */
function filterByExclusiveGroups(pool, enemies) {
  const groups = config.enemy.exclusiveGroups;
  if (!groups || groups.length === 0) return pool;

  return pool.filter((spec) => {
    for (const group of groups) {
      if (!group.includes(spec.id)) continue;
      const groupHasAlive = enemies.some(
        (e) => e.countsForConcurrency && group.includes(e.id) && e.id !== spec.id,
      );
      if (groupHasAlive) return false;
    }
    return true;
  });
}

/**
 * rules.typeCap(동시 화면 "종류" 수 상한, 2026-09-10 신설 — balance/rules.js·
 * progression.js의 FINITE_TYPE_CAP 주석 참고)에 이미 닿았으면, 지금 화면에 없는
 * 새 종류를 후보에서 뺀다. 이미 화면에 떠 있는 종류를 한 마리 더 늘리는 건(그
 * 종류의 개별 상한이 허용하는 한) 막지 않는다 — "몇 가지가 보이는가"만 제한하지
 * "몇 마리인가"는 다른 필터(마릿수 상한·개별 상한)의 일이다.
 * ★ "살아있는가" 판정은 위 두 필터와 일부러 다르게 뒀다 — 여기는 .alive만 본다
 *   (countsForConcurrency처럼 zombie의 부활 대기까지 포함하지 않는다). 종류
 *   상한은 "지금 화면에 실제로 보이는 그림 가짓수"를 세는 것이라, 잠깐 죽어
 *   corpseTimer로 남은 시체나 부활을 기다리는 동안의 zombie까지 "보인다"고
 *   치면 정작 화면엔 없는데 다른 신규 종류가 못 들어오는 조용한 과잉규제가 된다.
 * cap이 Infinity(무한모드)면 비교가 항상 거짓이라 그대로 통과시킨다.
 */
function filterByTypeCap(pool, enemies, cap) {
  const aliveTypes = aliveTypeSet(enemies);
  if (aliveTypes.size < cap) return pool;
  return pool.filter((spec) => aliveTypes.has(spec.id));
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
