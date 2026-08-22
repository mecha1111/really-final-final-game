// 이 파일 역할: 방해꾼의 클릭 판정 사각형 계산. Enemy는 이 결과를 그대로 쓰고, ui는 디버그 표시에 쓴다.

import { config } from '../config.js';

/**
 * 클릭 판정 사각형. popup처럼 hit_h가 그림보다 작으면 제목표시줄에 해당하는
 * 위쪽에 붙인다(시트 note: "히트박스는 제목표시줄만"). 판정이 없으면 null.
 */
export function hitRect(e) {
  if (!e.hasHitbox) return null;

  // ★ 등장 연출 중에는 그림이 움직이고 작아진다. 판정도 정확히 같이 움직여야 하므로
  //   논리값(x/y/w/h)이 아니라 그리기와 같은 출처(drawX/drawY/drawW/drawH)를 쓴다
  //   — enemies/Enemy.js의 그 게터 주석 참고. 연출이 끝나면 두 값이 같아진다.
  const scaleX = e.w > 0 ? e.drawW / e.w : 1;
  const scaleY = e.h > 0 ? e.drawH / e.h : 1;
  const hitW = e.hitW * scaleX;
  const hitH = e.hitH * scaleY;

  const topAligned = hitH < e.drawH;
  const cy = topAligned ? e.drawY - e.drawH / 2 + hitH / 2 : e.drawY;

  return { x: e.drawX - hitW / 2, y: cy - hitH / 2, w: hitW, h: hitH };
}

/** 그림 전체 사각형. closeButton형 몸통 판정에 쓴다. */
export function bodyRect(e) {
  return { x: e.drawX - e.drawW / 2, y: e.drawY - e.drawH / 2, w: e.drawW, h: e.drawH };
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

  // 등장 연출 중에도 그림과 정확히 같은 자리에 있어야 하므로 draw* 를 쓴다
  // (위 hitRect 주석과 같은 이유 — 그리기와 판정의 출처를 하나로 묶어둔다).
  const pad = config.enemy.artHitboxPadRatio;
  const left = e.drawX - e.drawW / 2;
  const top = e.drawY - e.drawH / 2;
  const x = left + (box.l - pad) * e.drawW;
  const y = top + (box.t - pad) * e.drawH;

  return {
    x,
    y,
    w: (box.r - box.l + pad * 2) * e.drawW,
    h: (box.b - box.t + pad * 2) * e.drawH,
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

/**
 * 사각형을 중심은 그대로 둔 채 최소 크기까지 넓힌다(이미 크면 그대로).
 * 중심을 유지하는 게 핵심이다 — 판정이 그림 밖으로 밀리면 "엉뚱한 데를 눌러야
 * 죽는다"가 되어버린다. 여기선 그림을 가운데 두고 사방으로만 넓힌다.
 */
export function inflateToMin(r, minW, minH) {
  if (!r) return r;
  const w = Math.max(r.w, minW);
  const h = Math.max(r.h, minH);
  return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h };
}

export function rectContains(r, px, py) {
  if (!r) return false;
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}
