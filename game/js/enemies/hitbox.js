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
 * 그림에 실제로 그려진 클릭 대상의 사각형(config.enemy.artHitbox 표 기준).
 * 표에 없는 종류는 null → 부르는 쪽이 시트 값(hitRect)으로 폴백한다.
 *
 * 표의 값은 원본 png 캔버스 좌상단 기준 비율이라, 스프라이트가 실제로 몇 px로
 * 그려지든(e.w/e.h) 그림 위 같은 자리를 가리킨다 — 렌더 스케일이나 시트의
 * size_w/size_h를 바꿔도 다시 잴 필요가 없다.
 */
export function artRect(e) {
  const box = config.enemy.artHitbox[e.artHitboxKey];
  if (!box) return null;

  const pad = config.enemy.artHitboxPadRatio;
  const left = e.x - e.w / 2;
  const top = e.y - e.h / 2;
  const x = left + (box.l - pad) * e.w;
  const y = top + (box.t - pad) * e.h;

  return {
    x,
    y,
    w: (box.r - box.l + pad * 2) * e.w,
    h: (box.b - box.t + pad * 2) * e.h,
  };
}

/**
 * popup류의 "닫기 버튼(X)" 히트박스. 그림에 그려진 X 위치를 그대로 쓴다
 * (artRect → config.enemy.artHitbox의 'popup:a' / 'popup:b').
 * ★ a와 b는 X가 완전히 다른 자리에 있다(a=상단 팻말, b=우하단) — Enemy가 스폰 때
 *   정한 artHitboxKey가 그 둘을 갈라주므로 여기선 신경 쓸 게 없다.
 * closeButton형이 아니면 null.
 */
export function closeButtonRect(e) {
  if (!e.closeButton) return null;
  return artRect(e);
}

export function rectContains(r, px, py) {
  if (!r) return false;
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}
