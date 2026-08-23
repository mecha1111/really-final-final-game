// 이 파일 역할: 구간 클리어 화면(.layer-cleared) — 그 구간에서 완성한 그림을
// 폴라로이드로 하나씩 보여주고 폴더에 정리한 뒤, 스탯과 다음 구간 버튼을 띄운다.
// ui/titleScreen.js·ui/bsodScreen.js와 같은 패턴이다(index.html의 정적 마크업에
// 핸들러만 붙인다) — 다른 점은 시간 기반 연출이 있다는 것뿐이라, 그 부분만
// rAF now(ms) 하나로 잰다(setInterval 없음 — sprite/animator.js와 같은 원칙).
//
// ★ 상태 기계: 'folder-enter' → ('flash' → 'develop' → 'hold' → 'tuck')×N → 'done'.
//   사진이 하나도 없으면(콤보만으로 할당량을 채운 극단적인 경우) N=0이라 바로
//   'folder-enter' 다음이 'done'이다.

import { config } from '../config.js';
import { state } from '../core/state.js';
import { advanceStage } from '../core/stageManager.js';
import { playSfx, SFX } from '../systems/sound.js';

let layer = null;
let folderEl = null;
let photoEl = null;
let photoImgEl = null;
let photoLabelEl = null;
let photoFlashEl = null;
let counterEl = null;
let sceneSummaryEl = null;
let titleEl = null;
let statsEl = null;

// 이번 클리어 화면에서 보여줄 사진 목록(스냅샷) — completeFile()이 못 채운
// pictureImg=null인 파일은 systems/file.js가 이미 걸러서 안 넣으므로 여기서
// 또 null 체크할 필요가 없다.
let photos = [];
let photoIndex = 0;
let timing = null; // { developSec, holdSec } — 사진 수에 따라 정상/빠른 속도 중 선택
let phaseName = 'idle'; // 'idle'|'folder-enter'|'flash'|'develop'|'hold'|'tuck'|'done'
let phaseStartAt = 0;

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

/** 사진 하나를 새로 시작한다 — 배경 이미지·라벨을 갈아 끼우고 플래시+등장을 튼다. */
function startPhoto(i, now) {
  photoIndex = i;
  const p = photos[i];

  if (photoImgEl) photoImgEl.style.backgroundImage = `url('${p.src}')`;
  if (photoLabelEl) photoLabelEl.textContent = p.label ?? '';
  if (counterEl) counterEl.textContent = `📸 완성한 그림  ${i + 1} / ${photos.length}`;

  if (photoEl) {
    photoEl.classList.remove('tuck');
    photoEl.style.setProperty('--develop-sec', `${timing.developSec}s`);
    // 시안(클리어연출_시안_경량.html)처럼 사진마다 살짝 다른 기울기를 준다 —
    // 물리적인 인화 사진을 아무렇게나 폴더 위에 얹어놓은 느낌. CSS class의
    // transform 선언 안에서 var()로 참조하므로(style.css) 인라인 style로 transform
    // 자체를 덮어쓰지 않는다 — 그러면 클래스가 정의한 transition이 그대로 씹혀버린다.
    photoEl.style.setProperty('--tilt', `${(Math.random() * 8 - 4).toFixed(1)}deg`);
    // on-top을 다음 프레임에 걸어야 transform:scale(0.25)→scale(1) 전환이
    // 실제로 재생된다 — 지금 이 프레임에 바로 걸면 "이미 그 상태로 시작한 것"과
    // 구분이 안 돼 트랜지션이 안 보일 수 있다(display:none→flex와 같은 함정).
    void photoEl.offsetWidth;
    photoEl.classList.add('on-top');
  }
  restartClass(photoFlashEl, 'play');
  playSfx(SFX.UI_CLICK); // 셔터 — 짧은 "톡"으로 대용(요구사항: 적합한 게 없으면 최근접)

  phaseName = 'flash';
  phaseStartAt = now;
}

/** 지금 사진을 폴더 속으로 밀어 넣는다. */
function startTuck(now) {
  if (photoEl) {
    photoEl.style.setProperty('--tilt-tuck', `${(Math.random() * 16 - 8).toFixed(1)}deg`);
    photoEl.classList.remove('on-top');
    photoEl.classList.add('tuck');
  }
  // 폴더 앞면이 살짝 눌리며 "받아먹는" 느낌(시안의 #folderWrap.open .folder-front) +
  // 다 들어간 뒤 통 튀는 느낌(시안의 @keyframes fb) — 둘 다 순수 장식용 CSS라
  // 여기서 클래스만 걸고, 실제 타이밍(언제 눌리고 언제 튀는지)은 style.css의
  // transition-delay/animation-delay로 짠다(추가 setTimeout 없이 = 시계 하나만 쓴다는
  // 원칙 유지).
  if (folderEl) restartClass(folderEl, 'receiving');
  playSfx(SFX.KILL_SOFT); // 폴더로 쏙 — 짧은 처치음을 "쏙" 대용으로 재활용(요구사항)
  phaseName = 'tuck';
  phaseStartAt = now;
}

/** 요약 화면(장면2)으로 넘어간다. */
function goToDone(now) {
  phaseName = 'done';
  phaseStartAt = now;
  if (layer) layer.classList.add('done');
  if (folderEl) restartClass(folderEl, 'bounce'); // 시안처럼 마지막에 한 번 더 통 튄 뒤 요약으로
  if (counterEl) counterEl.classList.remove('show');
  // display:none→flex 전환 직후 바로 opacity를 1로 걸면 트랜지션이 씹힐 수
  // 있어(위 restartClass 주석과 같은 이유) 한 프레임 쉬고 건다.
  if (sceneSummaryEl) {
    sceneSummaryEl.classList.remove('in');
    void sceneSummaryEl.offsetWidth;
    requestAnimationFrame(() => sceneSummaryEl?.classList.add('in'));
  }
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
    layer.style.setProperty('--tuck-sec', `${c.tuckSec}s`);
  }
  if (photoEl) {
    photoEl.classList.remove('on-top', 'tuck');
  }
  if (folderEl) folderEl.classList.remove('receiving', 'bounce');
  if (counterEl) {
    counterEl.textContent = '';
    counterEl.classList.toggle('show', photos.length > 0);
  }
  if (sceneSummaryEl) sceneSummaryEl.classList.remove('in');

  // 스탯·제목은 지금(구간이 막 끝난 시점의 실값) 미리 채워둔다 — 장면2가 나타날
  // 때 값이 아니라 "0"부터 다시 세는 게 아니라는 뜻이다. 표시는 사람이 읽기
  // 쉽게 n+1("1 구간"부터, state.js/config.js의 다른 곳과 같은 규칙).
  const s = state.stats;
  const acc = s.clicks > 0 ? Math.round((s.hits / s.clicks) * 100) : 0;
  if (titleEl) titleEl.textContent = `${state.stageIndex + 1} 구간 정리 완료!`;
  if (statsEl) {
    statsEl.textContent = `완료 파일 ${s.filesDone} · 제거 ${s.killed} · 정확도 ${acc}% · 최대 콤보 ${s.comboBest}`;
  }

  restartClass(folderEl, 'in');
  phaseName = 'folder-enter';
  phaseStartAt = now;
  clearedEnteredAt = now;
}

/** 지금 단계가 끝났으면 다음 단계로 넘긴다. 매 프레임 불려도 싸다(비교 몇 줄뿐). */
function advance(now) {
  const c = config.clearScreen;
  const t = elapsedSec(now);

  switch (phaseName) {
    case 'folder-enter':
      if (t >= c.folderEnterSec) {
        if (photos.length === 0) goToDone(now);
        else startPhoto(0, now);
      }
      break;
    case 'flash':
      if (t >= c.flashSec) {
        phaseName = 'develop';
        phaseStartAt = now;
      }
      break;
    case 'develop':
      if (t >= timing.developSec) {
        phaseName = 'hold';
        phaseStartAt = now;
      }
      break;
    case 'hold':
      if (t >= timing.holdSec) startTuck(now);
      break;
    case 'tuck':
      if (t >= c.tuckSec) {
        const next = photoIndex + 1;
        if (next >= photos.length) goToDone(now);
        else startPhoto(next, now);
      }
      break;
    case 'done':
    case 'idle':
    default:
      break; // 할 일 없음 — 요약 화면에서 버튼/스킵 입력을 기다린다
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

  folderEl = document.getElementById('cleared-folder');
  photoEl = document.getElementById('cleared-photo');
  photoImgEl = document.getElementById('cleared-photo-img');
  photoLabelEl = document.getElementById('cleared-photo-label');
  photoFlashEl = document.getElementById('cleared-photo-flash');
  counterEl = document.getElementById('cleared-photo-counter');
  sceneSummaryEl = document.getElementById('cleared-scene-summary');
  titleEl = document.getElementById('cleared-summary-title');
  statsEl = document.getElementById('cleared-summary-stats');

  document.getElementById('cleared-next-btn')?.addEventListener('click', (evt) => {
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
    // ★ 실측으로 재현한 버그: 할당량을 채운 그 클릭(스팸 클릭의 뒤이은 클릭들 포함)이
    // 이 화면이 열리자마자 배경 전체(클릭 어디든 건너뛰기)에 떨어져 사진 연출을
    // 통째로 건너뛰고 요약 화면으로 직행해버렸다 — "연출이 아예 안 보인다"는
    // 신고의 실제 원인이 이것이었다(연출 자체가 안 만들어진 게 아니라 매번 열리자마자
    // 건너뛰어진 것). 진입 직후 skipGraceSec 동안은 건너뛰기 요청을 버리지 않고
    // 그냥 보류만 한다 — 유예가 끝나면 그때 처리한다. 그동안은 평소처럼 advance()가
    // 계속 불려서 연출이 멈추지 않는다.
    if (now - clearedEnteredAt >= config.clearScreen.skipGraceSec * 1000) {
      skipRequested = false;
      if (phaseName !== 'done' && phaseName !== 'idle') goToDone(now);
    } else {
      advance(now);
    }
  } else {
    advance(now);
  }
}
