// 이 파일 역할: 게임 영역 마우스 커서를 config.mouseCursor 값으로 조립해 #desktop에 건다.
//
// CSS `cursor: url(img) X Y, auto` 자체는 style.css에 정적으로 박아도 되지만,
// 그러면 X/Y(hotspot)·이미지 경로가 config.js와 style.css 두 곳에 나뉘어 하나만
// 고치면 조용히 어긋난다("실제 클릭 지점 ≠ 보이는 촉끝" — 요구사항이 명시적으로
// 경고한 그 함정). CSS 커스텀 프로퍼티(--game-cursor)에 조립한 값을 한 번만
// 흘려보내고 style.css는 그 변수를 참조하기만 하게 해서, config.js가 유일한
// 출처가 되게 했다(ui/crtTransition.js가 --crt-* 변수를 흘려보내는 것과 같은 패턴).

import { config } from '../config.js';

function normalCursorValue() {
  return cursorValue(config.mouseCursor.url);
}

/** 조작 불능(hourglass) 동안 쓰는 모래시계 커서. */
function waitCursorValue() {
  return cursorValue(config.mouseCursor.waitUrl);
}

/**
 * `cursor:` 값 한 줄을 조립한다. ★hotspot은 두 그림이 같은 값을 공유한다 —
 * 같은 41x44 캔버스에 그려서 같은 화소가 같은 자리이기 때문이고, 그래야 커서가
 * 바뀌는 순간 "포인터가 가리키는 지점"이 안 튄다(config.mouseCursor 주석).
 */
function cursorValue(url) {
  return `url('${url}') ${config.mouseCursor.hotspotX} ${config.mouseCursor.hotspotY}, auto`;
}

/** 최초 1회. */
export function initCursor() {
  document.documentElement.style.setProperty('--game-cursor', normalCursorValue());
}

// updateCursor()가 마지막으로 적용한 상태 — 값이 안 바뀌었으면 CSS 변수를 또
// 안 건드린다(매 프레임 불려도 대부분은 그대로라 쓸데없는 스타일 재계산을 막는다).
let lastFrozen = false;

/**
 * hourglass 함정 발동으로 조작이 얼어있는 동안(state.inputFreezeSec > 0) 게임
 * 영역 커서를 모래시계로 바꾼다(요구사항). main.js의 render 루프가 매 프레임 부른다.
 *
 * ★ 2026-09-09: 예전엔 CSS 키워드 `wait`(OS 기본 대기 커서)였다. "어차피 클릭이
 *   전부 무시되니 hotspot 정밀도가 의미 없다"는 게 당시 근거였는데, 실제로
 *   플레이해 보니 문제는 정밀도가 아니라 크기였다 — OS 기본 대기 커서가 게임
 *   커서(41x44)보다 확연히 작아서, 얼어붙는 순간 커서가 작아지며 튀었다.
 *   지금은 같은 41x44 캔버스에 같은 hotspot으로 그린 전용 그림을 쓴다
 *   (config.mouseCursor.waitUrl) — 그림만 바뀌고 크기·기준점은 그대로다.
 */
export function updateCursor(frozen) {
  if (frozen === lastFrozen) return;
  lastFrozen = frozen;
  document.documentElement.style.setProperty('--game-cursor', frozen ? waitCursorValue() : normalCursorValue());
}
