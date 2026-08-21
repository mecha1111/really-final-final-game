// enemies.js
// 방해꾼(적) 클래스. 숫자는 절대 여기 하드코딩하지 않고 config.js에서 받는다.

import { config } from './config.js';

export class Enemy {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.size = config.enemy.size;
    this.speed = config.enemy.baseSpeed;
    this.alive = true;
  }

  update(dt) {
    // TODO: 다음 단계에서 실제 이동/충돌 로직 구현
    this.y += this.speed * dt;
  }

  draw(ctx) {
    // TODO: 다음 단계에서 실제 렌더링 구현 (색은 style.css의 --color-danger 사용 예정)
  }
}
