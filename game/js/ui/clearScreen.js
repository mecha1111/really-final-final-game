// 이 파일 역할: 구간 클리어 화면(.layer-cleared) — 게임의 실제 .exe 창 스타일
// 그대로, 그 구간에서 완성한 그림을 뷰어에 하나씩 크게 보여주고(셔터→현상→도장→
// 진행 게이지) 다 보여주면 진짜 XP 시스템 완료 대화상자(스탯+등급+다음 구간
// 버튼)로 넘어간다. ui/titleScreen.js·ui/bsodScreen.js와 같은 패턴이다(index.html의
// 정적 마크업에 핸들러만 붙인다) — 다른 점은 시간 기반 연출이 있다는 것뿐이라,
// 그 부분만 rAF now(ms) 하나로 잰다(setInterval 없음 — sprite/animator.js와 같은
// 원칙). 진행 게이지바는 새로 안 만들고 게임 업로드바(.xpbar.big)와 그 칸-채우기
// 로직(ui/statusWindow.js의 setBar)을 그대로 재사용한다.
//
// ★ 상태 기계: 'win-enter' → ('flash'→'develop'→'hold'→'gauge'→'gap')×N → 'done'.
//   사진이 하나도 없으면(콤보만으로 할당량을 채운 극단적인 경우) N=0이라 바로
//   'win-enter' 다음이 'done'이다.
//
// 2026-08-23: 폴라로이드/폴더 연출(구 버전)을 폐기하고 게임창 스타일로 전면
// 재구현. "업로드하던 그 창이 정리 결과를 보여준다"는 자연스러운 흐름 요구 —
// 시안(docs/클리어화면_게임창_시안.html)의 구조·CSS·상태기계를 그대로 옮겼다.

import { config } from '../config.js';
import { state } from '../core/state.js';
import { advanceStage, isRunCompleted, isInfiniteStage, stageLabel } from '../core/stageManager.js';
import { playSfx, SFX } from '../systems/sound.js';
import { setBar } from './statusWindow.js';

let layer = null;
let winEl = null;
let wtitleEl = null;
let scene2El = null;
let viewerImgEl = null;
let stampEl = null;
let picNameEl = null;
let picCountEl = null;
let gaugeCountEl = null;
let gaugeEl = null;
let flashEl = null;
let dlgTitleEl = null;
let dlgSubEl = null;
let dlgRankEl = null;
let statFilesEl = null;
let statKilledEl = null;
let statAccEl = null;
let statComboEl = null;
let rowUnlocksEl = null;
let statUnlocksEl = null;
let nextBtnEl = null;

// 이번 클리어 화면에서 보여줄 사진 목록(스냅샷) — completeFile()이 못 채운
// pictureImg=null인 파일은 systems/file.js가 이미 걸러서 안 넣으므로 여기서
// 또 null 체크할 필요가 없다.
let photos = [];
let photoIndex = 0;
let timing = null; // { developSec, holdSec } — 사진 수에 따라 정상/빠른 속도 중 선택
let phaseName = 'idle'; // 'idle'|'win-enter'|'flash'|'develop'|'hold'|'gauge'|'gap'|'end-pause'|'done'
let phaseStartAt = 0;

// 'gauge' 단계에서 매 프레임 보간할 시작/끝 비율(0~1) — setBar가 매번 다시 칸을
// 그리므로, 여기서 프레임마다 살짝씩 다른 ratio를 넘겨 "칸이 빠르게 차오르는"
// 모양을 만든다(게임 업로드바 자체는 늘 조금씩 오르는 실시간 값이라 안 보이던
// 문제 — 이 화면은 사진 단위로 한 번에 뛰므로 보간이 없으면 "스냅"처럼 보인다).
let gaugeFromRatio = 0;
let gaugeToRatio = 0;

// 장면2(요약) 진입 시 한 번 계산해 캐시 — updateCountUp이 매 프레임 여기서
// target만 읽고 실제 표시값을 보간한다(mockup의 countUp()과 같은 방식, 다만
// 별도 rAF 루프 대신 이 화면의 단일 시계로 처리).
let countUpTargets = []; // [{ el, target, prefix, suffix }]
let countUpDone = false;

// 지난 프레임에 cleared였는지 — "이번에 새로 클리어 화면에 들어왔다"를 판별해서
// 그때 한 번만 연출을 초기화한다(ui/bsodScreen.js의 wasFailed와 같은 idiom).
let wasCleared = false;

// 배경 클릭·키보드 스킵은 DOM 이벤트 핸들러에서 곧장 처리하지 않고 플래그만
// 세운다 — 여기서 performance.now() 같은 별도 시계로 바로 상태를 바꾸면, 이
// 화면의 모든 시간 계산이 기준으로 삼는 rAF now(ms)와 어긋날 수 있다
// (ui/crtTransition.js 상단 주석 — "성능 타이머와 rAF 시계를 섞어 쓰면 드물게
// 미세한 오차가 난다"와 같은 이유). 실제 전환은 다음 updateClearScreen(now)
// 프레임에서, 같은 시계로 처리한다 — 한 프레임(~16ms) 늦어질 뿐 체감상 즉시다.
let skipRequested = false;

// 이번 클리어 화면에 "진짜로" 들어온 시각(rAF now, ms) — 아래 skipGraceSec
// 유예 판정의 기준. enterClearedScreen()에서만 갱신한다.
let clearedEnteredAt = 0;

/** 지금 phase에 머문 시간(초). */
function elapsedSec(now) {
  return (now - phaseStartAt) / 1000;
}

/** 클래스를 remove→reflow→add로 재시작한다(이 프로젝트 전역에서 반복되는 트릭 —
 * 그냥 add만 하면 이미 재생 중인 CSS 애니가 재시작을 안 한다). */
function restartClass(el, className) {
  if (!el) return;
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

/** 종합 평가 등급 — 정확도(hits/clicks) 기준, config.clearScreen.rankThresholds. */
function calcRank(accRatio) {
  const t = config.clearScreen.rankThresholds;
  if (accRatio >= t.s) return 'S';
  if (accRatio >= t.a) return 'A';
  if (accRatio >= t.b) return 'B';
  return 'C';
}

/** 사진 하나를 새로 시작한다 — 그림·이름·카운터를 갈아 끼우고 플래시+등장을 튼다. */
function startPhoto(i, now) {
  photoIndex = i;
  const p = photos[i];

  if (viewerImgEl) viewerImgEl.src = p.src;
  if (picNameEl) picNameEl.textContent = p.label ?? '';
  if (picCountEl) picCountEl.textContent = `${i + 1} / ${photos.length}`;

  restartClass(flashEl, 'play');
  if (viewerImgEl) {
    // on을 다음 프레임에 걸어야 opacity/transform 전환이 실제로 재생된다 —
    // 지금 이 프레임에 바로 걸면 "이미 그 상태로 시작한 것"과 구분이 안 돼
    // 트랜지션이 안 보일 수 있다(display:none→flex와 같은 함정).
    void viewerImgEl.offsetWidth;
    viewerImgEl.classList.add('on');
  }
  playSfx(SFX.UI_CLICK); // 셔터

  phaseName = 'flash';
  phaseStartAt = now;
}

/** 흐림→선명 "현상" 필터 전환을 시작한다(그림 자체 opacity/scale 등장은 이미 끝난 뒤). */
function startDevelop(now) {
  if (viewerImgEl) {
    viewerImgEl.style.setProperty('--develop-sec', `${timing.developSec}s`);
    viewerImgEl.classList.add('developing');
  }
  phaseName = 'develop';
  phaseStartAt = now;
}

/** "완료!" 도장을 찍고 감상 시간에 들어간다. */
function startHold(now) {
  restartClass(stampEl, 'on');
  phaseName = 'hold';
  phaseStartAt = now;
}

/** 정리 진행도 게이지를 다음 칸까지 채운다. */
function startGauge(now) {
  const total = photos.length;
  gaugeFromRatio = photoIndex / total;
  gaugeToRatio = (photoIndex + 1) / total;
  if (gaugeCountEl) gaugeCountEl.textContent = `${photoIndex + 1} / ${total}`;
  playSfx(SFX.KILL_SOFT); // 게이지 차오름
  phaseName = 'gauge';
  phaseStartAt = now;
}

/** 다음 사진을 위해 뷰어를 잠깐 비운다. */
function startGap(now) {
  if (viewerImgEl) viewerImgEl.classList.remove('on', 'developing');
  if (stampEl) stampEl.classList.remove('on');
  phaseName = 'gap';
  phaseStartAt = now;
}

function startEndPause(now) {
  phaseName = 'end-pause';
  phaseStartAt = now;
}

/** 장면2(진짜 XP 완료 대화상자)로 넘어간다. */
function goToDone(now) {
  phaseName = 'done';
  phaseStartAt = now;
  if (layer) layer.classList.add('done');
  if (wtitleEl) wtitleEl.textContent = `${stageLabel(state.stageIndex)} 완료`;

  const s = state.stats;
  const accRatio = s.clicks > 0 ? s.hits / s.clicks : 0;
  const acc = Math.round(accRatio * 100);
  const rank = calcRank(accRatio);

  if (dlgTitleEl) dlgTitleEl.textContent = `${stageLabel(state.stageIndex)} 정리 완료`;
  if (dlgRankEl) dlgRankEl.textContent = `${rank} 등급`;
  // 본문도 "구간/층"을 맞춘다 — 제목만 바꾸면 한 대화상자 안에서 두 이름이 섞인다.
  if (dlgSubEl) dlgSubEl.textContent = isInfiniteStage(state.stageIndex) ? '이 층의 파일을 모두 정리했습니다.' : '이 구간의 파일을 모두 정리했습니다.';

  countUpTargets = [
    { el: statFilesEl, target: s.filesDone, prefix: '', suffix: '' },
    { el: statKilledEl, target: s.killed, prefix: '', suffix: '' },
    { el: statAccEl, target: acc, prefix: '', suffix: '%' },
    { el: statComboEl, target: s.comboBest, prefix: 'x', suffix: '' },
  ];

  // 새로 해금한 그림이 있을 때만 그 줄을 보여준다(core/stageManager.js가
  // checkWinLose에서 찍어둔 값 — 이번 판에서 "갤러리 기준 처음으로" 해금된
  // 수, 재획득은 안 센다). 요구사항대로 기존 대화상자에 한 줄만 얹는다 —
  // 새 연출은 안 만들고 다른 스탯과 같은 카운트업 리스트에 그냥 낀다.
  const newUnlocks = state.newUnlockedPictures;
  if (rowUnlocksEl) rowUnlocksEl.classList.toggle('show', newUnlocks > 0);
  if (newUnlocks > 0) countUpTargets.push({ el: statUnlocksEl, target: newUnlocks, prefix: '+', suffix: '장' });

  // 마지막 유한 구간을 깼으면 다음 구간이 없다 — 버튼이 거짓말을 하면 안 되므로
  // 문구를 바꾼다(누르면 실제로 타이틀로 간다, core/stageManager.js의 advanceStage).
  // 엔딩 화면이 붙으면 이 자리는 그대로 두고 advanceStage 쪽만 바뀌면 된다.
  // ★무한모드는 "구간"이 아니라 "층"이다 — 창 제목·HUD가 stageLabel()로 "무한 N층"이라
  //   부르는데 버튼만 "다음 구간"이면 같은 것을 두 이름으로 부르는 꼴이 된다.
  if (nextBtnEl) {
    nextBtnEl.textContent = isRunCompleted()
      ? '완주! 메인으로'
      : isInfiniteStage(state.stageIndex)
        ? '다음 층 ▶'
        : '다음 구간 ▶';
  }

  for (const t of countUpTargets) if (t.el) t.el.textContent = t.prefix + '0' + t.suffix;
  countUpDone = false;

  // display:none→(flex 부모의 block 자식) 전환 직후 바로 opacity를 1로 걸면
  // 트랜지션이 씹힐 수 있어(위 restartClass 주석과 같은 이유) 한 프레임 쉬고 건다.
  if (scene2El) {
    scene2El.classList.remove('hidden', 'in');
    void scene2El.offsetWidth;
    requestAnimationFrame(() => scene2El?.classList.add('in'));
  }
}

/** 장면2의 스탯 카운트업(0→실제값, ease-out) — 이 화면의 단일 시계(now)로 진행한다. */
function updateCountUp(now) {
  if (countUpDone) return;
  const c = config.clearScreen;
  const t = elapsedSec(now);
  if (t < c.countUpDelaySec) return;
  const p = Math.min(1, (t - c.countUpDelaySec) / c.countUpDurSec);
  const eased = 1 - Math.pow(1 - p, 3);
  for (const item of countUpTargets) {
    if (!item.el) continue;
    item.el.textContent = item.prefix + Math.round(item.target * eased) + item.suffix;
  }
  if (p >= 1) countUpDone = true;
}

/** 이번에 새로 클리어 화면에 들어온 첫 프레임 — 스냅샷을 뜨고 연출을 처음부터 켠다. */
function enterClearedScreen(now) {
  const c = config.clearScreen;
  photos = state.completedPictures; // systems/file.js가 이미 pictureImg 있는 것만 넣어뒀다
  photoIndex = -1;

  const fast = photos.length >= c.fastModeThreshold;
  timing = {
    developSec: fast ? c.developSecFast : c.developSec,
    holdSec: fast ? c.holdSecFast : c.holdSec,
  };

  if (layer) {
    layer.classList.remove('done');
    layer.style.setProperty('--flash-sec', `${c.flashSec}s`);
  }
  if (wtitleEl) wtitleEl.textContent = `${stageLabel(state.stageIndex)} 정리 중...`;
  if (viewerImgEl) viewerImgEl.classList.remove('on', 'developing');
  if (stampEl) stampEl.classList.remove('on');
  if (scene2El) scene2El.classList.add('hidden');
  if (gaugeEl) setBar(gaugeEl, 0, 19);
  if (gaugeCountEl) gaugeCountEl.textContent = `0 / ${photos.length}`;

  restartClass(winEl, 'show');
  phaseName = 'win-enter';
  phaseStartAt = now;
  clearedEnteredAt = now;
}

/** 지금 단계가 끝났으면 다음 단계로 넘긴다. 매 프레임 불려도 싸다(비교 몇 줄뿐). */
function advance(now) {
  const c = config.clearScreen;
  const t = elapsedSec(now);

  switch (phaseName) {
    case 'win-enter':
      if (t >= c.winEnterSec) {
        if (photos.length === 0) goToDone(now);
        else startPhoto(0, now);
      }
      break;
    case 'flash':
      if (t >= c.flashSec) startDevelop(now);
      break;
    case 'develop':
      if (t >= c.stampDelaySec) startHold(now);
      break;
    case 'hold':
      if (t >= timing.holdSec) startGauge(now);
      break;
    case 'gauge':
      setBar(gaugeEl, gaugeFromRatio + (gaugeToRatio - gaugeFromRatio) * Math.min(1, t / c.gaugeSec), 19);
      if (t >= c.gaugeSec) {
        setBar(gaugeEl, gaugeToRatio, 19); // 마지막 프레임 오차 없이 정확한 값으로 스냅
        const next = photoIndex + 1;
        if (next >= photos.length) startEndPause(now);
        else startGap(now);
      }
      break;
    case 'gap':
      if (t >= c.gapSec) startPhoto(photoIndex + 1, now);
      break;
    case 'end-pause':
      if (t >= c.endPauseSec) goToDone(now);
      break;
    case 'done':
      updateCountUp(now);
      break;
    case 'idle':
    default:
      break;
  }
}

/** 배경 클릭·키보드 — 건너뛰기 요청 플래그만 세운다(실제 전환은 다음 프레임). */
function skipToSummary() {
  if (state.phase !== 'cleared') return;
  skipRequested = true;
}

/** 최초 1회. 다음 구간 버튼 + 배경 클릭/키보드 건너뛰기를 붙인다. */
export function initClearScreen() {
  layer = document.getElementById('layer-cleared');
  if (!layer) return;

  winEl = document.getElementById('cleared-win');
  wtitleEl = document.getElementById('cleared-wtitle');
  scene2El = document.getElementById('cleared-scene2');
  viewerImgEl = document.getElementById('cleared-viewer-img');
  stampEl = document.getElementById('cleared-stamp');
  picNameEl = document.getElementById('cleared-pic-name');
  picCountEl = document.getElementById('cleared-pic-count');
  gaugeCountEl = document.getElementById('cleared-gauge-count');
  gaugeEl = document.getElementById('cleared-gauge');
  flashEl = document.getElementById('cleared-flash');
  dlgTitleEl = document.getElementById('cleared-dlg-title');
  dlgSubEl = document.getElementById('cleared-dlg-sub');
  dlgRankEl = document.getElementById('cleared-dlg-rank');
  statFilesEl = document.getElementById('cleared-stat-files');
  statKilledEl = document.getElementById('cleared-stat-killed');
  statAccEl = document.getElementById('cleared-stat-acc');
  statComboEl = document.getElementById('cleared-stat-combo');
  rowUnlocksEl = document.getElementById('cleared-row-unlocks');
  statUnlocksEl = document.getElementById('cleared-stat-unlocks');

  nextBtnEl = document.getElementById('cleared-next-btn');
  nextBtnEl?.addEventListener('click', (evt) => {
    evt.stopPropagation(); // 배경 클릭(건너뛰기) 핸들러까지 같이 안 불리게
    playSfx(SFX.UI_CLICK, { ui: true });
    advanceStage();
  });

  // 배경 어디든 클릭하면 건너뛴다 — 버튼은 위에서 stopPropagation으로 이미 뺐다.
  layer.addEventListener('click', skipToSummary);

  // 아무 키나 눌러도 건너뛴다 — ESC(설정 열기)만 빼서 두 동작이 한 번에 겹치지
  // 않게 한다. R키는 systems/input.js가 이미 "결과 화면에서 다음 구간"으로
  // 전역 처리하므로 여기서 또 안 건드린다(그쪽은 연출과 무관하게 항상 즉시
  // 다음 구간으로 넘어가는, 이 스킵보다 한 단계 더 센 단축키다).
  window.addEventListener('keydown', (evt) => {
    if (evt.code === 'Escape') return;
    skipToSummary();
  });
}

/** 매 프레임 호출(main.js). cleared가 아니면 건너뛴다. */
export function updateClearScreen(now) {
  if (state.phase !== 'cleared') {
    wasCleared = false;
    skipRequested = false;
    return;
  }
  if (!wasCleared) {
    wasCleared = true;
    skipRequested = false; // 지난 판의 스킵 요청이 새 클리어 화면까지 새어 들어가지 않게
    enterClearedScreen(now);
  }

  if (skipRequested) {
    skipRequested = false;
    // ★ 실측으로 재현한 버그: 할당량을 채운 그 클릭(스팸 클릭의 뒤이은 클릭 몇
    // 번 포함)이 이 화면이 열리자마자 배경 전체(클릭 어디든 건너뛰기)에 떨어져
    // 연출을 통째로 건너뛰고 요약 화면으로 직행해버렸다 — "연출이 아예 안
    // 보인다"는 신고의 실제 원인이 이것이었다. 진입 직후 skipGraceSec 동안 들어온
    // 요청은 "진짜 건너뛰고 싶다"가 아니라 그 트레일링 클릭일 가능성이 커서 그냥
    // 버린다(뒤로 미뤄서 나중에 처리하면, 유예가 끝나는 순간 사용자가 누른 적도
    // 없는데 자동으로 건너뛰어지는 또 다른 이상한 동작이 된다 — 그건 처음에
    // 재현했던 버그를 시간만 늦춰 재현하는 것과 같다). 진짜 건너뛰고 싶으면
    // 유예가 끝난 뒤 다시 클릭/키를 누르면 되고, 그때는 아래 조건이 바로 참이라
    // 즉시 처리된다.
    if (now - clearedEnteredAt >= config.clearScreen.skipGraceSec * 1000) {
      if (phaseName !== 'done' && phaseName !== 'idle') {
        goToDone(now);
        return; // 이번 프레임은 여기서 끝 — advance()는 다음 프레임부터 'done'을 처리
      }
    }
  }
  advance(now);
}
