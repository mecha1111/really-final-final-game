// 이 파일 역할: 엔딩 화면(.layer-ending) — 유한 5구간을 전부 깼을 때만 뜨는 3장 화면
// (완주 메시지 → 완성 그림 슬라이드쇼 → 크레딧). ui/settingsPanel.js·ui/galleryPanel.js와
// 완전히 같은 패턴이다: index.html에 이미 있는 정적 마크업에 핸들러만 붙이고, 새
// 오버레이 장치를 만들지 않는다. 장면 전환도 새 레이어를 더 만들지 않고 하나의
// .layer-ending 안에서 클래스(.scene-msg/.scene-slides/.scene-credits)만 바꾼다 —
// ui/clearScreen.js의 scene1/scene2 전환과 같은 결이다.
//
// ★ 진입점은 core/stageManager.js의 advanceStage() 하나뿐이다(마지막 유한 구간의
//   클리어 화면에서 [완주! 메인으로] 버튼 또는 R키를 누르는 순간). state.phase가
//   'ending'이 되면 systems/input.js 상단 가드가 캔버스 클릭을 막고, ui/desktop.js가
//   .phase-ending으로 이 레이어만 보여준다 — title/failed/cleared와 같은 자리
//   (z-index 6, 서로 배타적인 phase라 그 값을 그대로 나눠 쓴다).
//
// ★ 시간 기반 진행은 슬라이드쇼(장면 2)뿐이고, 그마저도 setInterval이 아니라
//   main.js가 매 프레임 넘겨주는 rAF now(ms) 하나로만 잰다(ui/clearScreen.js와 같은
//   원칙 — 성능 타이머와 rAF 시계를 섞어 쓰면 드물게 오차가 난다는 그 파일의 근거를
//   그대로 따른다). 그래서 버튼/키 클릭도 그 자리에서 바로 처리하지 않고 요청
//   플래그만 세운 뒤, 다음 updateEndingScreen(now) 프레임에서 같은 시계로 처리한다.
//
// ★ 언제든 스킵 가능(요구사항: 심사위원이 기다리지 않게) — 세 장면 전부 버튼이나
//   ESC로 즉시 credits(마지막 장면, 나가는 버튼 둘)까지 건너뛸 수 있다.

import { state, setPhase } from '../core/state.js';
import { startGame } from '../core/stageManager.js';
import { config } from '../config.js';
import { getSave } from '../core/save.js';
import { allPictureSrcs } from '../systems/filePicture.js';
import { playSfx, SFX } from '../systems/sound.js';

let layer = null;
let statKilledEl = null;
let statFilesEl = null;
let statComboEl = null;
let slideImgEl = null;
let slideCountEl = null;

// 'msg' | 'slides' | 'credits' — 지금 보여주는 장면.
let scene = 'msg';

// 슬라이드쇼(장면 2) 내부 상태.
let slides = []; // 해금된 그림 src만, allPictureSrcs()의 등급/번호 순서 그대로
let slideIndex = 0;
let slidePhaseStartAt = 0; // 지금 슬라이드가 시작된 시각(rAF now, ms)

// 버튼/키 클릭은 여기서 바로 처리하지 않고 요청만 남긴다 — 실제 전환은 다음
// updateEndingScreen(now)가 rAF 시계로 처리한다(위 파일 상단 주석 참고).
// 'next'(장면1→2) | 'advance'(슬라이드 한 장 넘기기) | 'skip'(어디서든 credits로)
let pending = null;

function setSceneClass(name) {
  scene = name;
  if (!layer) return;
  layer.classList.remove('scene-msg', 'scene-slides', 'scene-credits');
  layer.classList.add(`scene-${name}`);
}

/** 슬라이드 하나를 새로 보여준다 — 페이드 트랜지션은 CSS(.ending-slide-img.on)가 맡는다. */
function showSlide(i, now) {
  slideIndex = i;
  if (slideImgEl) {
    slideImgEl.classList.remove('on');
    // remove→reflow→src 교체→reflow→add — 이 프로젝트 전역의 트랜지션 재시작 트릭
    // (ui/clearScreen.js의 restartClass와 같은 이유: 그냥 클래스만 갈아 끼우면
    // 이미 opacity:1인 상태에서 src만 바뀌어 즉시 전환 없이 갈아치워진다).
    void slideImgEl.offsetWidth;
    slideImgEl.src = slides[i];
    void slideImgEl.offsetWidth;
    slideImgEl.classList.add('on');
  }
  slidePhaseStartAt = now;
}

/** 장면2(슬라이드쇼)로 들어간다. 해금된 그림이 0장이면(콤보만으로 완주한 극단적인
 * 경우) 통째로 건너뛰고 바로 크레딧으로 — 크래시 없이, 빈 슬라이드쇼도 안 보여준다. */
function enterSlides(now) {
  const unlocked = new Set(getSave().unlockedPictures);
  // ★ 등급/번호 고정 순서로 보여준다(allPictureSrcs()가 정의하는 순서 그대로) —
  //   해금 시점 순서를 따로 안 남겨둬서(세이브엔 집합만 있다) 매번 같은, 예측 가능한
  //   순서가 더 낫다.
  slides = allPictureSrcs().filter((src) => unlocked.has(src));
  const total = allPictureSrcs().length;
  if (slideCountEl) slideCountEl.textContent = `수집한 그림 ${slides.length} / ${total}`;

  if (slides.length === 0) {
    enterCredits();
    return;
  }
  setSceneClass('slides');
  showSlide(0, now);
}

function enterCredits() {
  setSceneClass('credits');
}

/** 최초 1회. 버튼·클릭·ESC에 핸들러를 붙인다(전부 pending 플래그만 세운다 — 위
 * 파일 상단 주석의 "단일 시계" 원칙). */
export function initEndingScreen() {
  layer = document.getElementById('layer-ending');
  if (!layer) return;

  layer.style.setProperty('--ending-fade-sec', `${config.endingScreen.slideFadeSec}s`);

  statKilledEl = document.getElementById('ending-stat-killed');
  statFilesEl = document.getElementById('ending-stat-files');
  statComboEl = document.getElementById('ending-stat-combo');
  slideImgEl = document.getElementById('ending-slide-img');
  slideCountEl = document.getElementById('ending-slide-count');

  document.getElementById('ending-msg-next')?.addEventListener('click', () => {
    playSfx(SFX.UI_CLICK, { ui: true });
    pending = 'next';
  });
  document.getElementById('ending-msg-skip')?.addEventListener('click', () => {
    playSfx(SFX.UI_CLICK, { ui: true });
    pending = 'skip';
  });

  // 슬라이드 프레임 아무 데나 클릭 = 다음 슬라이드(클리어 화면의 "배경 클릭"과
  // 비슷한 결이지만, 여기는 전체 스킵이 아니라 "한 장 넘기기"다 — 전체 스킵은
  // 아래 건너뛰기 버튼/ESC 전용이라 stopPropagation으로 갈라둔다).
  document.getElementById('ending-scene-slides')?.addEventListener('click', () => {
    if (scene !== 'slides') return;
    pending = 'advance';
  });
  document.getElementById('ending-slide-skip')?.addEventListener('click', (evt) => {
    evt.stopPropagation();
    playSfx(SFX.UI_CLICK, { ui: true });
    pending = 'skip';
  });

  // 무한 모드 — 타이틀의 [무한 모드] 버튼(ui/titleScreen.js)과 완전히 같은 동작.
  // 세이브는 안 건드린다(무한 진행은 best.infiniteStage에만 남는다, core/save.js).
  document.getElementById('ending-btn-infinite')?.addEventListener('click', () => {
    playSfx(SFX.UI_CLICK, { ui: true });
    startGame(config.stage.finiteCount);
  });
  document.getElementById('ending-btn-title')?.addEventListener('click', () => {
    playSfx(SFX.UI_CLICK, { ui: true });
    setPhase('title');
  });

  // ESC = 지금 어느 장면이든 credits(마지막 장면, 나가는 버튼 둘)까지 건너뛴다.
  // ★ ui/settingsPanel.js의 ESC_OPENABLE_PHASES에 'ending'이 없어서 설정 팝업이
  //   열리지 않는다 — 그래서 여기서 ESC를 그대로 가져다 써도 안 겹친다(같은 이유로
  //   ui/clearScreen.js도 배경 클릭/키보드 스킵을 독립된 window 리스너로 처리한다).
  window.addEventListener('keydown', (evt) => {
    if (state.phase !== 'ending' || evt.code !== 'Escape') return;
    if (scene === 'credits') return; // 이미 마지막 장면 — 더 건너뛸 게 없다
    pending = 'skip';
  });
}

/** core/stageManager.js의 advanceStage()가 마지막 유한 구간 클리어를 넘길 때 부른다. */
export function openEnding() {
  if (!layer) return;

  // ★ 요구사항 확정: "5구간(마지막 판)만" — state.stats는 startGame()마다 새로
  //   만들어지는 이번 판(5구간)의 통계이고, 클리어 화면(ui/clearScreen.js)이 방금
  //   보여준 것과 같은 값이다. 1~5구간 누적 총계는 이 게임에 아직 그런 추적 장치가
  //   없어서(추가하려면 새 상태·리셋 시점이 필요) 새 장치를 안 만드는 원칙에 따라
  //   여기서도 안 만들었다.
  const s = state.stats;
  if (statKilledEl) statKilledEl.textContent = String(s.killed);
  if (statFilesEl) statFilesEl.textContent = String(s.filesDone);
  if (statComboEl) statComboEl.textContent = `x${s.comboBest}`;

  slides = [];
  slideIndex = 0;
  pending = null;
  setSceneClass('msg');
  setPhase('ending');
}

/** 매 프레임 호출(main.js). ending이 아니면 건너뛴다. */
export function updateEndingScreen(now) {
  if (state.phase !== 'ending') return;

  if (pending) {
    const action = pending;
    pending = null;
    if (action === 'skip') {
      if (scene !== 'credits') enterCredits();
    } else if (action === 'next') {
      if (scene === 'msg') enterSlides(now);
    } else if (action === 'advance' && scene === 'slides') {
      const next = slideIndex + 1;
      if (next >= slides.length) enterCredits();
      else showSlide(next, now);
    }
    return; // 이번 프레임은 요청 처리로 끝 — 자동 타이머는 다음 프레임부터 본다
  }

  if (scene !== 'slides') return;
  const elapsedSec = (now - slidePhaseStartAt) / 1000;
  if (elapsedSec < config.endingScreen.slideSec) return;
  const next = slideIndex + 1;
  if (next >= slides.length) enterCredits();
  else showSlide(next, now);
}
