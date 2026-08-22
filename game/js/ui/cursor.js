// 이 파일 역할: 게임 영역 마우스 커서를 config.mouseCursor 값으로 조립해 #desktop에 건다.
//
// CSS `cursor: url(img) X Y, auto` 자체는 style.css에 정적으로 박아도 되지만,
// 그러면 X/Y(hotspot)·이미지 경로가 config.js와 style.css 두 곳에 나뉘어 하나만
// 고치면 조용히 어긋난다("실제 클릭 지점 ≠ 보이는 촉끝" — 요구사항이 명시적으로
// 경고한 그 함정). CSS 커스텀 프로퍼티(--game-cursor)에 조립한 값을 한 번만
// 흘려보내고 style.css는 그 변수를 참조하기만 하게 해서, config.js가 유일한
// 출처가 되게 했다(ui/crtTransition.js가 --crt-* 변수를 흘려보내는 것과 같은 패턴).

import { config } from '../config.js';

/** 최초 1회. */
export function initCursor() {
  const value = `url('${config.mouseCursor.url}') ${config.mouseCursor.hotspotX} ${config.mouseCursor.hotspotY}, auto`;
  document.documentElement.style.setProperty('--game-cursor', value);
}
