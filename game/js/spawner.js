// spawner.js
// 방해꾼 스폰 타이밍과 난이도 곡선을 관리. 숫자는 config.js에서만 가져온다.

import { config } from './config.js';
import { Enemy } from './enemies.js';

export class Spawner {
  constructor() {
    this.elapsed = 0;
    this.nextSpawnAt = config.spawner.initialDelaySec;
  }

  /**
   * 경과 시간(elapsedSec)을 기준으로 현재 스폰 간격을 계산한다.
   * 시간이 지날수록 config.spawner.intervalRampPerSec만큼 줄어들다가
   * config.spawner.minIntervalSec에서 멈춘다.
   */
  currentInterval(elapsedSec) {
    const raw = config.spawner.baseIntervalSec - elapsedSec * config.spawner.intervalRampPerSec;
    return Math.max(raw, config.spawner.minIntervalSec);
  }

  update(dt, canvasWidth) {
    this.elapsed += dt;
    const spawned = [];

    if (this.elapsed >= this.nextSpawnAt) {
      // TODO: 다음 단계에서 실제 스폰 위치/패턴 구현
      const x = Math.random() * canvasWidth;
      spawned.push(new Enemy(x, -config.enemy.size));
      this.nextSpawnAt = this.elapsed + this.currentInterval(this.elapsed);
    }

    return spawned;
  }
}
