// 이 파일 역할: 인게임 튜토리얼의 ★대본. 무엇을 언제 지목하고, 무엇을 소환하고,
//   무엇이 있어야 다음으로 넘어가는지를 정한다.
//
// ── 왜 말풍선 5쪽을 버렸나 ──────────────────────────────────────────────────
// 예전 튜토리얼은 그림이 붙은 설명 5쪽이었다. 다 읽고 나면 무엇을 봤는지가 아니라
// [다음]을 몇 번 눌렀는지만 남았다 — 화면에서는 그동안 아무 일도 안 일어났기
// 때문이다. 이제는 설명하는 그 물건을 실제로 지목하고(스포트라이트), 시켜본다.
//
// ★설명 단계에는 버튼이 있고, 시연 단계에는 ★버튼이 없다. 행동이 곧 진행이다 —
//   그래야 "읽고 넘기는 것"과 "해보는 것"이 손끝에서 갈린다.
//
// ── 판 위에서 돈다 ──────────────────────────────────────────────────────────
// 이 튜토리얼이 도는 동안 판은 이미 시작돼 있다(ui/gameOpening.js). 진행바는
// 진짜로 차오르고, 소환하는 방해꾼은 실전과 완전히 같은 객체이며, 처치음·등장음도
// 실전 경로 그대로 난다 — 그래야 여기서 배운 게 실전으로 옮겨간다.
// 대신 위험한 것들은 게이트로 멈춰 둔다(제한시간·일반 스폰·환경 방해 —
// core/state.js의 state.tutorial 주석).
//
// ★4단계만 예외다: 그 한 마리의 동결을 풀어 ★실제로 얻어맞는다. 스크립트로
//   진행바를 깎지 않는다(damageUpload를 직접 부르지 않는다) — 예비동작 →
//   피격음 → 빨간 잔상까지 전부 실전과 같은 경로로 일어나야, 실전에서 같은
//   장면을 봤을 때 "아까 그거"가 된다.
//
// ── ★소리 계약 ──────────────────────────────────────────────────────────────
// 이 대본은 ★효과음을 하나도 직접 재생하지 않는다. 여기서 나는 소리는 전부
// "무슨 일이 일어났다"의 결과로 실전 경로가 알아서 내는 것뿐이다:
//
//   crt_kick      판 시작(title→playing 전이) — ui/crtTransition.js
//   ui_open       강아지 등장 — ui/gameOpening.js의 showTutorial
//   entrance_pop  basic 소환 ×2 (2단계·4단계)   ┐ 전부 enemies/entrance.js가
//   entrance_slam ransom 소환                   │ 종류를 보고 고른다 —
//   bait_appear   bait 소환                     ┘ 실전과 같은 소리여야 학습이 옮겨간다
//   kill_soft     basic 처치            ┐ Enemy.kill()/takeHit()이 낸다
//   ransom_crack_1/2 + kill_hard  ransom 3타 ┘
//   atk_warning + hit   4단계의 실제 피격 — systems/upload.js
//   start         [업데이트 재개] — 판 시작음을 여기로 미뤄뒀다(core/stageManager.js)
//
// ★일부러 안 내는 것:
//   · [다음] 버튼 클릭음 — 한 번의 튜토리얼에서 여러 번 눌린다. 매번 같은 소리가
//     나면 그게 곧 소음이고, 정작 들려야 할 소리(피격·처치)를 덮는다.
//   · 스포트라이트 이동음 / 단락 전환음 — 대응하는 "사건"이 없다. 화면이 바뀌는
//     것 자체는 눈으로 이미 보인다.
// ★새 단락을 추가할 때 playSfx를 부르고 싶어지면 먼저 "이게 실전에도 있는
//   사건인가"를 물을 것. 아니면 안 내는 게 맞다.

import { config, gameData } from '../config.js';
import { state } from '../core/state.js';
import { getPlayArea } from '../core/stageManager.js';
import { Enemy } from '../enemies/Enemy.js';
import { spotOff, spotToIds, spotToWorld } from './tutorialSpotlight.js';

// ── 시연 무대 ────────────────────────────────────────────────────────────────
// 소환 자리와 돌아다닐 수 있는 범위. 전부 놀이 영역에 대한 비율이라 시트에서
// 해상도(canvas_w/h)를 바꿔도 따라온다 — 절대 px을 박으면 그때 어긋난다.
//
// ★왼쪽 아래로 몰아둔 이유: 상태 창(.winA, #desktop 150,150)과 업로드 창
//   (.winB, 600,70)이 위쪽을, 말풍선(.op-assist.tut)이 오른쪽 아래를 차지한다.
//   시연 적이 그 뒤로 들어가면 스포트라이트로 지목해놓고 정작 클릭이 안 된다
//   (말풍선은 z45로 캔버스보다 위다).
// ★위쪽 경계(0.58)는 상태 창(.winA)의 아래끝에서 나온 값이다: winA는 #desktop
//   150,150에서 시작해 대략 600까지 내려오는데, 그 아래가 놀이 영역 세로의
//   0.58쯤이다. 그보다 위로 올리면 시연 적이 창 위를 덮고 돌아다녀서(캔버스가
//   창보다 위 레이어다) 무엇을 가리키는 건지 어수선해진다 — 클릭은 되지만
//   "저 열린 바탕화면 위의 저것"이라는 그림이 안 나온다.
const STAGE_AREA = { x: 0.05, y: 0.58, w: 0.5, h: 0.4 };
// 소환 지점(놀이 영역 비율). ★랜덤 금지 — 매번 같은 자리에 나와야 스포트라이트가
// 어디를 비출지 예측 가능하고, 검증에서도 같은 그림이 나온다. 전부 위 무대 안이다.
const SPAWN_BASIC = { x: 0.2, y: 0.68 };
const SPAWN_RANSOM = { x: 0.34, y: 0.74 };
const SPAWN_DECAY = { x: 0.22, y: 0.68 };

/** 놀이 영역 비율 → 캔버스 논리좌표. */
function at(frac) {
  const a = getPlayArea();
  return { x: a.x + a.w * frac.x, y: a.y + a.h * frac.y };
}

function stageArea() {
  const a = getPlayArea();
  return { x: a.x + a.w * STAGE_AREA.x, y: a.y + a.h * STAGE_AREA.y, w: a.w * STAGE_AREA.w, h: a.h * STAGE_AREA.h };
}

/**
 * 시연용 방해꾼 한 마리를 정해진 자리에 소환한다.
 * ★일반 스폰(enemies/spawner.js)을 안 거친다 — 저건 가중치 추첨과 랜덤 배치라
 *   "이 종류를 여기에"가 불가능하다. 대신 Enemy를 직접 만든다(main.js의
 *   __game.spawn이 이미 쓰는 방식과 같다). 등장 연출·등장음·클릭 판정은
 *   생성자와 entrance가 알아서 실전과 똑같이 붙는다.
 */
function spawnDemo(id, frac, { frozen = true } = {}) {
  const spec = gameData.enemies.find((e) => e.id === id);
  if (!spec || !state.rules) return null;

  const playArea = getPlayArea();
  const pos = at(frac);
  const enemy = new Enemy(spec, { x: pos.x, y: pos.y, rules: state.rules, playArea, pointer: state.pointer });
  // 수명만료·주기공격을 멈춘다 — 설명을 읽는 동안 사라지거나 때리면 안 된다.
  enemy.tutorialFrozen = frozen;
  // 말풍선·상태 창 뒤로 걸어 들어가지 못하게 무대를 좁힌다(enemies/behaviors.js).
  enemy.tutorialArea = stageArea();
  state.enemies.push(enemy);
  return enemy;
}

/**
 * 시연 적 하나를 지목한다.
 * ★x/y/w/h가 아니라 ★drawX/drawY/drawW/drawH를 쓴다 — 등장 연출(enemies/entrance.js)이
 *   도는 동안 스프라이트는 논리 위치에서 밀리고 크기도 줄었다 커진다. 논리 좌표로
 *   구멍을 뚫으면 그 몇 초 동안 구멍과 그림이 어긋나 보인다(실측: ransom의 slam
 *   등장 중 오른쪽 절반이 구멍 밖으로 삐져나왔다). 그리기 쪽이 보는 것과 같은 값을
 *   봐야 언제 찍어도 겹친다 — ui/renderEnemies.js의 게이지도 같은 이유로 draw*를 쓴다.
 * @param {number} up 위로 더 넓힐 논리 px(hp 점처럼 그림 밖에 붙는 표시를 담을 때).
 */
function spotEnemy(e, up = 0) {
  if (!e) return;
  // ★snap — 매 프레임 따라다니는 대상이라 전환을 끈다(위 spotToRect 주석).
  spotToWorld(e.drawX, e.drawY - up / 2, e.drawW, e.drawH + up, undefined, true);
}

/** 시연 적을 소리 없이 치운다 — kill()이 아니다(처치음·통계·분열이 따라붙는다). */
function removeDemo(enemy) {
  const i = state.enemies.indexOf(enemy);
  if (i >= 0) state.enemies.splice(i, 1);
}

// ── 대본 ─────────────────────────────────────────────────────────────────────
// 한 단락(beat) = { head, tx, btn?, enter?, spot?, update?, ready? }
//   head/tx — 말풍선 제목·본문. tx의 <em>은 노란 형광이다(기울임 아님).
//   btn     — 있으면 그 글자의 버튼으로 넘어간다(설명 단계).
//             없으면 update()가 true를 돌려줄 때까지 기다린다(시연 단계).
//   enter   — 이 단락에 들어올 때 1회(소환·게이트 조작).
//   spot    — 매 프레임. 움직이는 대상을 따라가야 해서 매번 다시 계산한다.
//   update  — 매 프레임. true면 다음 단락으로.
//   ready   — btn이 있는 단락에서, 아직 false면 버튼을 숨긴다.
//
// ★대본은 전부 이 파일 안의 고정 문자열이다 — 사용자 입력이 섞일 자리가 없어서
//   말풍선에 innerHTML로 넣어도 안전하다(예전 PAGES와 같은 근거).

// 이 판에서 지금 다루고 있는 시연 적과 그 부수 상태.
let demo = null;
let killAt = null; // 처치된 자리(캔버스 논리좌표) — "+MB"가 뜬 그 지점
let beatSec = 0; // 지금 단락에 들어온 뒤 흐른 시간(초)
let decayPhase = ''; // 4단계 내부 진행: '' → 'incoming' → 'hit' → 'done'
let decayBefore = 0; // 맞기 직전 진행바 값(실제로 줄었는지 확인용)
let quotaTickBase = 0; // 1단계(a) 진입 시점의 할당량 — 그 값에서부터 조금씩 올린다

const BEATS = [
  // 1 · 목표 (a) 할당량 — "이게 차면 다음 구간"
  // ★설명을 읽는 동안 할당량 수치가 실제로 조금씩 오른다(config.tutorial의
  //   quotaTickRate/quotaTickSec 주석 참고) — 안 그러면 무엇을 보라는 건지
  //   알 수 없다(요구사항). 가짜로 그리는 숫자가 아니라 state.uploaded를
  //   직접 dt만큼씩 움직인다 — st-uploaded/st-quotabar는 매 프레임 그 값을
  //   그대로 다시 읽으므로(ui/statusWindow.js) 별도 연출 코드가 필요 없다.
  //   ★튜토리얼이 끝나도 원복하지 않는다(요구사항) — 그대로 실전 값이 된다.
  {
    head: '목표',
    tx: '<em>제한시간</em> 안에 이 <em>할당량</em>을 채우면 다음 구간으로 넘어갑니다.',
    btn: '다음',
    enter: () => {
      quotaTickBase = state.uploaded;
    },
    spot: () => spotToIds(['st-uploaded', 'st-quota', 'st-quotabar']),
    update: () => {
      if (state.rules) {
        const c = config.tutorial;
        const target = quotaTickBase + Math.min(beatSec, c.quotaTickSec) * c.quotaTickRate;
        // 할당량을 넘겨 설명 도중 조기 클리어되는 일이 없게 클램프한다.
        state.uploaded = Math.min(target, state.rules.quota - 1);
      }
      return false; // 진행은 [다음] 버튼이 한다
    },
  },
  // 1 · 목표 (b) 업데이트 진행바 — "이건 지금 올리는 파일 한 장"
  // ★두 바를 반드시 갈라준다. 예전 설명은 둘을 "진행바" 한 단어로 뭉뚱그렸는데,
  //   차오르는 이유도(시간 / 처치) 100%가 됐을 때 일어나는 일도(파일 완성 /
  //   구간 통과) 서로 다르다. 4단계에서 되돌아가는 것도 이쪽 하나뿐이다.
  {
    head: '목표',
    tx: '이건 지금 올리는 <em>파일 한 장</em>이에요. 100%가 되면 그림이 완성됩니다.',
    btn: '다음',
    spot: () => spotToIds(['up-wrap']),
  },
  // 2 · 시연① 기본 잡몹 — ★버튼 없음. 없애야 넘어간다.
  {
    head: '직접 해보기',
    tx: '방해꾼이 나타났습니다. <em>클릭</em>해서 없애 보세요.',
    enter: () => {
      demo = spawnDemo('basic', SPAWN_BASIC);
      state.tutorial.blockClicks = false; // 여기서 처음으로 캔버스를 연다
    },
    spot: () => spotEnemy(demo),
    update: () => {
      if (!demo || demo.alive) return false;
      killAt = { x: demo.x, y: demo.y }; // "+0.30MB"가 뜬 자리
      return true;
    },
  },
  // 2 · 시연① 결과 — 처치가 무엇을 올렸는지. ★자동 진행.
  //   앞 1.4초는 방금 뜬 "+MB" 글씨를, 그다음은 그 수치가 실제로 더해진
  //   할당량 숫자를 비춘다 — 둘을 이어서 봐야 "이게 저기로 갔다"가 된다.
  {
    head: '직접 해보기',
    tx: '칠 때마다 <em>할당량</em>이 조금씩 올라갑니다.',
    enter: () => {
      state.tutorial.blockClicks = true; // 설명 구간이므로 다시 닫는다
      demo = null;
    },
    spot: () => {
      if (beatSec < 1.4 && killAt) spotToWorld(killAt.x, killAt.y - 30, 220, 110);
      else spotToIds(['st-uploaded', 'st-quota']);
    },
    update: () => beatSec >= 3.6,
  },
  // 3 · 시연② 자물쇠 — ★버튼 없음. hp가 3이라 세 번 쳐야 한다.
  {
    head: '한 번으로는 안 열린다',
    tx: '머리 위 <em>점</em>이 남은 횟수예요. 다 없어질 때까지 <em>계속</em> 클릭하세요.',
    enter: () => {
      demo = spawnDemo('ransom', SPAWN_RANSOM);
      state.tutorial.blockClicks = false;
    },
    // hp 점은 그림 위 10px 자리에 그려진다(ui/renderEnemies.js의 drawEnemyGauges) —
    // 구멍을 위로 늘려 점까지 함께 담는다. 안 그러면 "점을 보라"면서 점을 가린다.
    spot: () => spotEnemy(demo, 32),
    update: () => !!demo && !demo.alive,
  },
  // 4 · 놔두면 깎인다 — ★방치를 강제한다(클릭을 닫는다).
  //   ★스크립트로 깎지 않는다. 그 한 마리의 동결만 풀고, 공격 타이머를 예비동작
  //   길이로 당겨 ★실전과 똑같은 경로로 맞는다(예고 → 피격 → 빨간 잔상).
  {
    head: '놔두면 되돌아간다',
    tx: '방해꾼을 그냥 두면 <em>올리던 게 되돌아갑니다</em>. 몸을 떠는 <em>예비동작</em>이 보이면 곧 맞는다는 뜻이에요.',
    btn: '다음',
    enter: () => {
      state.tutorial.blockClicks = true; // ★눌러서 없애버리면 되돌아가는 걸 못 본다
      state.tutorial.uploadAuto = false; // 동시에 차오르면 "줄었다"가 안 보인다
      demo = spawnDemo('basic', SPAWN_DECAY);
      decayPhase = '';
      decayBefore = 0;
    },
    spot: () => spotToIds(['up-wrap']), // ★역주행하는 그 바
    ready: () => decayPhase === 'done',
    update: () => {
      if (!demo) return false;
      // 설명을 한 번 읽을 틈을 준 뒤에 때리게 한다.
      if (decayPhase === '' && beatSec >= 1.8) {
        decayPhase = 'incoming';
        decayBefore = state.file ? state.file.progress : 0;
        demo.tutorialFrozen = false;
        // ★주기가 3초라 그냥 기다리면 설명이 늘어진다. 타이머를 예비동작 길이로
        //   당긴다 — 앞당기는 건 "언제"뿐이고, 예고도 피해량도 소리도 실전 그대로다.
        if (demo.atk) demo.atk.timer = config.enemy.atkTelegraphSec;
      }
      // 실제로 깎였다 — 빨간 잔상을 볼 시간을 준 뒤 그 놈을 치운다.
      if (decayPhase === 'incoming' && state.file && state.file.progress < decayBefore) decayPhase = 'hit';
      if (decayPhase === 'hit') {
        removeDemo(demo);
        demo = null;
        decayPhase = 'done';
      }
      return false; // 진행은 [다음] 버튼이 한다(ready가 열어준다)
    },
  },
  // 5 · 시연③ 안 죽는 방해꾼
  // ★"환경 방해"가 아니다 — 저건 화면·조작을 망가뜨리는 별개 축이고(systems/hazard.js),
  //   이건 클릭 판정이 아예 없는 방해꾼이다(시트에서 hit_w/hit_h가 0). 그 말을 쓰면
  //   나중에 진짜 환경 방해를 만났을 때 같은 것으로 착각한다.
  {
    head: '안 죽는 놈도 있다',
    tx: '이 놈은 <em>클릭해도 안 죽습니다</em>. 시야만 가려요 — 무시하고 다른 걸 치는 게 이깁니다.',
    btn: '다음',
    enter: () => {
      // ★bait는 소환 좌표를 무시하고 자기가 모서리를 고른다(enemies/bait.js —
      //   "모서리 고정 출현"이 이 놈의 연출 규칙이고, 크기도 시트가 아니라
      //   config.bait가 정한다). 그래서 위치를 지정하는 대신 ★말풍선이 비킨다:
      //   오른쪽에 앉았으면 말풍선을 왼쪽으로 보낸다. 안 그러면 "이 놈을 보라"고
      //   해놓고 말풍선(z45)이 그 놈을 통째로 덮는다.
      demo = spawnDemo('bait', { x: 0.5, y: 0.5 });
      const a = getPlayArea();
      balloonSide(demo && demo.x > a.x + a.w / 2 ? 'left' : 'right');
      // ★여기서는 클릭을 열어둔다 — 문구가 "클릭해도 안 죽습니다"인데 정작 눌러볼
      //   수가 없으면 그냥 주장이다. 열어두면 눌러서 직접 확인할 수 있고, bait는
      //   시트에서 hit_w/hit_h가 0이라 그 클릭이 곧 허공 클릭이 된다 — 리플만
      //   퍼지고 아무 일도 안 일어난다. ★소리도 안 난다(허공 클릭에는 전용음이
      //   없다) — 아래 sfx 계약을 안 건드린다.
      state.tutorial.blockClicks = false;
    },
    spot: () => spotEnemy(demo),
  },
  // 마무리 — 제한시간. 여기서 [업데이트 재개]를 누르면 실전이다.
  {
    head: '제한시간',
    tx: '시간 안에 할당량을 못 채우면 <em>블루스크린</em>입니다. 준비됐나요?',
    btn: '업데이트 재개',
    enter: () => {
      // ★bait는 그대로 남겨둔다(요구사항) — 치우지 않는다. 실전이 시작되면
      //   releaseTutorial()이 동결을 풀어, 그 순간부터 평범한 bait가 된다.
      demo = null;
      state.tutorial.blockClicks = true; // 설명 단락이므로 다시 닫는다
      balloonSide('right'); // 제한시간 표시는 왼쪽 위(.winA)라 말풍선은 오른쪽이 맞다
    },
    spot: () => spotToIds(['st-time']),
  },
];

// ── 진행 ─────────────────────────────────────────────────────────────────────

let headEl = null;
let textEl = null;
let nextBtn = null;
let assistEl = null;
let index = -1;
let running = false;
let onFinish = null;

/** 최초 1회(ui/gameOpening.js의 initGameOpening에서). 말풍선 DOM을 잡는다. */
export function initTutorial(dom) {
  headEl = dom.head;
  textEl = dom.text;
  nextBtn = dom.next;
  assistEl = dom.assist;
}

/** 말풍선을 화면 오른쪽/왼쪽 아래로 보낸다. 지목 대상과 겹치지 않게 비키는 용도. */
function balloonSide(side) {
  assistEl?.classList.toggle('tut-left', side === 'left');
}

function renderBeat() {
  const b = BEATS[index];
  headEl.textContent = b.head;
  textEl.innerHTML = b.tx;
  syncButton();
}

/** [다음]/[업데이트 재개] 노출을 지금 단락에 맞춘다. 시연 단락에는 버튼이 없다. */
function syncButton() {
  const b = BEATS[index];
  const show = !!b.btn && (!b.ready || b.ready());
  nextBtn.textContent = b.btn ?? '';
  // ★hidden 속성이 아니라 클래스로 숨긴다 — .settings-btn에 display가 박혀 있어
  //   [hidden]이 특이도로 밀리는 함정을 이 프로젝트가 두 번 겪었다(style.css 주석).
  nextBtn.classList.toggle('tut-hidden', !show);
}

function enterBeat(i) {
  index = i;
  beatSec = 0;
  BEATS[i].enter?.();
  renderBeat();
}

/** 다음 단락으로. 대본이 끝나면 오프닝에게 마무리를 넘긴다. */
function advance() {
  if (index >= BEATS.length - 1) {
    const done = onFinish;
    stopTutorial();
    done?.();
    return;
  }
  enterBeat(index + 1);
}

/** [다음] 버튼이 눌렸다(ui/gameOpening.js가 배선한다). 시연 단락에선 버튼이 없다. */
export function tutorialNext() {
  if (!running) return;
  const b = BEATS[index];
  if (!b.btn || (b.ready && !b.ready())) return;
  advance();
}

/** 대본을 처음부터 돌린다. 강아지가 뜨는 그 순간(config.opening.assistSec) 불린다. */
export function startTutorial(done) {
  running = true;
  onFinish = done;
  demo = null;
  killAt = null;
  // 말풍선을 화면 오른쪽 아래로 옮긴다 — 가운데에 있으면 업로드 창(.winB)과
  // 시연 무대를 통째로 가린다. 걷을 때 반드시 같이 뗀다(stopTutorial).
  assistEl?.classList.add('tut');
  balloonSide('right');
  enterBeat(0);
}

/** 대본을 걷는다 — 끝까지 갔든 [건너뛰기]든 이 한 곳으로 모인다. */
export function stopTutorial() {
  running = false;
  onFinish = null;
  index = -1;
  demo = null;
  killAt = null;
  decayPhase = '';
  quotaTickBase = 0;
  spotOff();
  assistEl?.classList.remove('tut', 'tut-left');
  nextBtn?.classList.remove('tut-hidden');
}

/**
 * ★남아 있는 시연 적을 전부 치운다([건너뛰기] 전용).
 * 끝까지 본 경우엔 안 부른다 — 마지막 단락의 bait는 일부러 남겨서 실전으로
 * 데려가기 때문이다(요구사항). 건너뛴 경우엔 설명을 못 들은 놈이 남는 셈이라 치운다.
 */
export function clearDemoEnemies() {
  state.enemies = state.enemies.filter((e) => !e.tutorialArea);
}

/** 매 프레임(main.js). 스포트라이트를 따라 옮기고, 시연 단락의 진행을 살핀다. */
export function updateTutorial(dt) {
  if (!running) return;
  beatSec += dt;

  const b = BEATS[index];
  b.spot?.();
  syncButton(); // ready()가 도중에 열리는 단락(4단계)이 있어 매 프레임 맞춘다
  if (b.update?.()) advance();
}
