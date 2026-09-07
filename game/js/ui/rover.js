// 이 파일 역할: 튜토리얼 도우미 "러버" — XP 검색 도우미(Search Companion) 패러디.
// 조건이 맞을 때 화면 좌측에서 사이드바가 슬라이드로 들어와 팁 한 줄을 보여주고,
// 몇 초 뒤 저절로 나간다. 별도 튜토리얼 화면·스테이지가 아니다 — 게임은 이 동안
// 한 순간도 멈추지 않는다(진행바·스폰·클릭 판정 전부 평소와 같다).
//
// ★ 2026-09-07 — 지금 이 모듈은 "인게임 배선이 끊긴 채 살아 있는" 상태다.
//   showTip()을 부르던 세 자리(core/stageManager.js의 첫 게임 시작,
//   enemies/spawner.js의 bait/popup 첫 등장)를 전부 걷어냈다. 방해꾼이 날뛰는
//   와중에 화면 구석에서 뜨는 안내는 아무도 안 읽어서 튜토리얼로 기능하지 못했다.
//   조작 설명은 이제 게임 시작 전 인트로의 도우미 튜토리얼(ui/intro.js)이 맡는다.
//   ★ 파일을 안 지우는 이유: 강아지 도우미(rover_idle.png)와 seenTips 세이브
//     필드를 인트로가 그대로 물려 쓰고, __game.showTip 디버그 손잡이(main.js)로
//     여전히 이 사이드바를 불러볼 수 있다. 설정창의 [러버 힌트] 토글도 그대로
//     이 모듈을 가리킨다.
//
// ★ hazard 프레임워크(systems/hazard.js)를 안 쓴다 — 그건 "방해"의 스케줄러(랜덤
//   발동·연속 금지·해제 방식)라 이것과 성격이 다르다. 러버는 특정 게임 이벤트가
//   일어난 그 순간에 정확히 뜨는 "안내"이지, 무작위로 튀어나오는 방해가 아니다.
//   그래서 이 파일은 hazard.js를 import하지 않고 자기 큐를 직접 관리한다.
//
// ★ pointer-events 규칙은 다른 오버레이와 같은 관례다 — .layer-rover 컨테이너는
//   none, 패널(.rover-panel) 자신만 auto로 연다. 그 바깥(방해꾼이 있는 자리)은
//   클릭이 그대로 캔버스로 내려가 평소처럼 판정된다(systems/hazard.js 상단의
//   pointer-events 주석과 같은 원리 — 여기서 다시 설명하지 않는다).
//
// ★ 시간은 이 프로젝트 전역 원칙대로 dt 하나로만 잰다(setInterval/setTimeout 금지).
//   main.js가 매 프레임 updateRover(dt)를 불러준다.

import { config } from '../config.js';
import { state } from '../core/state.js';
import { hasSeenTip, markTipSeen } from '../core/save.js';
import { playSfx, SFX } from '../systems/sound.js';

let layer = null;
let panelEl = null;
let textEl = null;

const queue = []; // [{ id, text }] — showTip()이 쌓고, update()가 하나씩 꺼내 보여준다.
let active = null; // 지금 보여주는 중인 팁({ id, text }) — 없으면 null.
// 'idle'(대기, 큐를 본다) | 'shown'(떠 있음) | 'hiding'(슬라이드 아웃 중) | 'gap'(다음 전 여백)
let mode = 'idle';
let timer = 0;

/** 최초 1회(main.js). DOM을 잡고 "클릭하면 즉시 닫힘"을 배선한다. */
export function initRover() {
  layer = document.getElementById('layer-rover');
  if (!layer) return;
  panelEl = document.getElementById('rover-panel');
  textEl = document.getElementById('rover-text');

  // 슬라이드 전환 시간을 CSS와 여기서 같은 값을 쓰게 CSS 변수로 흘려보낸다
  // (config.hazard.portrait이 --rot-sec를 흘려보내는 것과 같은 패턴).
  layer.style.setProperty('--rover-slide-sec', `${config.tutorial.slideSec}s`);
  // 머리말 아이콘은 정적 마크업의 [data-icon="search"]라 applyIcons()(main.js가
  // 부팅 시 한 번 먼저 부른다)가 이미 채워뒀다 — 여기서 더 할 일이 없다.

  // 그림 자산이 아직 없거나 못 불러오면 말풍선+텍스트만으로도 동작해야 한다
  // (이 프로젝트의 "크래시 금지, 조용히 강등" 원칙 — core/save.js 상단 주석과 같은 결).
  // ★ onerror는 여기서 addEventListener로 안 건다 — 이 module이 실행되기 전에
  //   브라우저가 이미지 로드를 실패 처리해버리는 경우(파일이 아예 없어 즉시
  //   404가 나는 지금 같은 상황에서 실측으로 확인됐다: img.complete===true인데
  //   'error' 리스너가 한 번도 안 불렸다)가 있어서, 그 순간을 놓칠 수 있다.
  //   그래서 index.html의 <img onerror="...">에 인라인으로 걸어뒀다 —
  //   엘리먼트를 파싱하는 바로 그 순간 붙어서 놓칠 일이 없다.

  // 클릭 = 즉시 닫힘. 배경(캔버스 방해꾼)까지 클릭이 새지 않게 막을 필요는 없다 —
  // 패널 자신만 pointer-events:auto라(style.css) 이 클릭은 애초에 패널 위에서만 난다.
  panelEl?.addEventListener('click', () => {
    if (mode === 'shown') startHide();
  });
}

/**
 * 팁을 큐에 넣는다 — 실제로 보이는 시점은 큐 순서·다른 팁의 표시 여부에 달렸다.
 * ★ 한 팁당 평생 1회: 이미 본 적 있으면(core/save.js의 seenTips) 조용히 무시한다.
 *   "봤다" 기록은 여기서 즉시 남긴다 — 같은 프레임에 같은 id로 두 번 불려도
 *   (예: 같은 종류 방해꾼이 한 틱에 여럿 스폰되는 극단적인 경우) 중복 큐잉이
 *   구조적으로 안 생긴다.
 * @param {string} id 고유 id(seenTips 기록 키)
 * @param {string} text 풍선에 보여줄 문구
 */
export function showTip(id, text) {
  if (!layer) return; // initRover 전(부팅 초반)이면 조용히 무시
  if (!config.tutorial.enabled) return;
  if (hasSeenTip(id)) return;
  if (active?.id === id || queue.some((t) => t.id === id)) return; // 이미 큐/표시 중
  queue.push({ id, text });
  markTipSeen(id);
}

/** 다음 팁을 꺼내 슬라이드 인 시킨다. */
function startShow() {
  active = queue.shift();
  if (textEl) textEl.textContent = active.text;
  layer.classList.add('open');
  playSfx(SFX.UI_OPEN, { ui: true });
  mode = 'shown';
  timer = config.tutorial.visibleSec;
}

/** 슬라이드 아웃을 시작한다(자동 만료든 클릭이든 여기 한 곳으로 모은다). */
function startHide() {
  layer.classList.remove('open');
  playSfx(SFX.UI_CLOSE, { ui: true });
  mode = 'hiding';
  timer = config.tutorial.slideSec;
}

/**
 * 매 프레임(main.js). 큐를 진행시킨다.
 * ★ phase가 'playing'을 벗어나면(클리어·게임오버·엔딩 등으로 화면이 바뀌면)
 *   전환 애니 없이 즉시 감춘다 — 저 화면들은 z-index가 이 레이어보다 낮아서
 *   (title/failed/cleared/ending=z6 < 러버=z10), 그대로 두면 결과 화면 위에
 *   튜토리얼 말풍선이 떠 있는 꼴이 된다. 큐에 남은 팁은 버리지 않는다 — 이미
 *   "봤다"고 기록된 것도 아니라서(아직 안 보여줬으니까), 다음 판에서 조건이
 *   다시 맞으면 자연히 다시 뜬다.
 */
export function updateRover(dt) {
  if (!layer) return;

  if (state.phase !== 'playing' && mode !== 'idle') {
    layer.classList.remove('open');
    mode = 'idle';
    active = null;
    timer = 0;
    return;
  }

  if (mode === 'idle') {
    if (queue.length > 0) startShow();
    return;
  }

  timer -= dt;
  if (timer > 0) return;

  if (mode === 'shown') {
    startHide();
  } else if (mode === 'hiding') {
    active = null;
    mode = 'gap';
    timer = config.tutorial.gapSec;
  } else if (mode === 'gap') {
    mode = 'idle';
  }
}

/**
 * 새 판이 시작될 때(core/stageManager.js의 startGame()) 부른다 — 지난 판에서
 * 표시 중이었거나 큐에 밀려 있던 팁이 새 판까지 새어 들어가지 않게(다른
 * resetXxx류와 같은 이유·같은 자리, 그 파일의 resetHazards 주석 참고).
 * ★ seenTips(core/save.js)는 안 건드린다 — "이미 본 팁"은 판이 바뀌어도 그대로다.
 */
export function resetRoverQueue() {
  queue.length = 0;
  active = null;
  mode = 'idle';
  timer = 0;
  layer?.classList.remove('open');
}
