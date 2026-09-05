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
  return `url('${config.mouseCursor.url}') ${config.mouseCursor.hotspotX} ${config.mouseCursor.hotspotY}, auto`;
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
 * 영역 커서를 "모래시계로 변경"한다(요구사항). 새 그림을 안 만들고 브라우저
 * 기본 대기 커서(cursor: wait, 대부분의 OS에서 모래시계/스피너로 그려진다)를
 * 재사용했다 — 어차피 이 동안은 클릭이 전부 무시되므로(systems/input.js)
 * config.mouseCursor의 hotspot 정밀도가 의미가 없어서 이 용도엔 이 정도로 충분하다.
 * main.js의 render 루프가 매 프레임 이 함수를 부른다.
 */
export function updateCursor(frozen) {
  if (frozen === lastFrozen) return;
  lastFrozen = frozen;
  document.documentElement.style.setProperty('--game-cursor', frozen ? 'wait' : normalCursorValue());
}
