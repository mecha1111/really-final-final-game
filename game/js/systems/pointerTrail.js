// 이 파일 역할: 최근 진짜 마우스 궤적을 기록해둔다. copier의 가짜 커서가 이 궤적을
// 시간차를 두고 따라가서, 절차적으로 흉내내지 않고 실제 손 움직임 그대로 재생한다.

import { config } from '../config.js';

// {x, y, t} 샘플들. t는 시뮬레이션 누적 시간(초) — Date.now() 대신 프레임 dt를
// 더해 나간다(탭 전환 등으로 실제 시계가 튀어도 게임 시간과 항상 맞게).
let samples = [];
let simTime = 0;

/** 매 프레임(플레이 중일 때만) 호출. 지금 커서 위치를 궤적에 남긴다. */
export function recordPointer(pointer, dt) {
  simTime += dt;
  samples.push({ x: pointer.x, y: pointer.y, t: simTime });

  // 가장 긴 delay보다 넉넉히 오래된 샘플은 버린다 — 계속 쌓이면 탐색이 느려진다.
  const keepFrom = simTime - config.cursor.trailMaxAgeSec;
  while (samples.length > 1 && samples[1].t < keepFrom) samples.shift();
}

/**
 * `delaySec` 전(과거)의 궤적 위치를 선형 보간해서 돌려준다.
 * 기록이 그만큼 없으면(게임을 막 시작했을 때 등) 가진 것 중 제일 오래된/최신 값으로 채운다.
 */
export function trailPositionAt(delaySec) {
  if (samples.length === 0) return { x: 0, y: 0 };

  const targetT = simTime - delaySec;
  const first = samples[0];
  if (targetT <= first.t) return { x: first.x, y: first.y };

  const last = samples[samples.length - 1];
  if (targetT >= last.t) return { x: last.x, y: last.y };

  // 뒤에서부터 선형 탐색 — 한 판에 쌓이는 샘플 수가 수백 개 수준이라 충분히 가볍다.
  for (let i = samples.length - 1; i > 0; i--) {
    const a = samples[i - 1];
    const b = samples[i];
    if (targetT >= a.t && targetT <= b.t) {
      const span = b.t - a.t;
      const f = span > 0 ? (targetT - a.t) / span : 0;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
  }
  return { x: last.x, y: last.y };
}

/** 새 판을 시작할 때 호출 — 지난 판의 궤적이 새 판에 섞여 들어가지 않게 한다. */
export function resetTrail() {
  samples = [];
  simTime = 0;
}
