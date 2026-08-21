// 이 파일 역할: 방해꾼의 클릭 판정 사각형 계산. Enemy는 이 결과를 그대로 쓰고, ui는 디버그 표시에 쓴다.

import { config } from '../config.js';

/**
 * 클릭 판정 사각형. popup처럼 hit_h가 그림보다 작으면 제목표시줄에 해당하는
 * 위쪽에 붙인다(시트 note: "히트박스는 제목표시줄만"). 판정이 없으면 null.
 */
export function hitRect(e) {
  if (!e.hasHitbox) return null;

  const topAligned = e.hitH < e.h;
  const cy = topAligned ? e.y - e.h / 2 + e.hitH / 2 : e.y;

  return { x: e.x - e.hitW / 2, y: cy - e.hitH / 2, w: e.hitW, h: e.hitH };
}

/** 그림 전체 사각형. closeButton형 몸통 판정에 쓴다. */
export function bodyRect(e) {
  return { x: e.x - e.w / 2, y: e.y - e.h / 2, w: e.w, h: e.h };
}

/**
 * popup류의 X 버튼 히트박스. 스프라이트의 수학적 "모서리"가 아니라 그림에
 * 실제로 그려진 X 아이콘 위치(config의 offset 비율 — 픽셀을 재서 넣은 값)를
 * 중심으로 잡는다. popup.png가 캔버스 전체를 안 채우고 안쪽에 여백을 두고
 * 그려져 있어서, 모서리 기준으로 잡으면 실제 X에서 한참 벗어난다.
 * closeButton형이 아니면 null.
 */
export function closeButtonRect(e) {
  if (!e.closeButton) return null;

  // closeButtonSize는 기준 해상도 값이라 e.scaleFactor를 곱한다. 오프셋 비율은
  // 이미 스케일된 e.w/e.h에 곱하는 상대값이라 따로 손댈 필요가 없다.
  const size = config.enemy.closeButtonSize * e.scaleFactor;
  const cx = e.x + e.w * config.enemy.closeButtonOffsetXRatio;
  const cy = e.y + e.h * config.enemy.closeButtonOffsetYRatio;

  return { x: cx - size / 2, y: cy - size / 2, w: size, h: size };
}

export function rectContains(r, px, py) {
  if (!r) return false;
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}
