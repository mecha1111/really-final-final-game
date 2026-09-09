// 이 파일 역할: 마우스/키 입력을 받아 게임 동작으로 옮긴다(방해꾼 클릭 판정, 난이도·재시작 버튼, 단축키).

import { config } from '../config.js';
import { state } from '../core/state.js';
import { advanceStage } from '../core/stageManager.js';
import { damageUpload } from './upload.js';
import { registerKill, registerMiss, comboTier } from './combo.js';
import { recordEnemyEncounter } from '../core/save.js';
import { spawnClickRipple } from './clickRipple.js';
import { playSfx, SFX } from './sound.js';
import { pointInRect } from '../ui/draw.js';
import { handleDebugKey, debugState } from '../debug.js';
import { handleSettingsKey } from '../ui/settingsPanel.js';
import { handleGalleryViewerKey } from '../ui/galleryPanel.js';
import { showTrapDialog } from '../ui/trapDialog.js';
import { clientToWorld, worldToClient, getCanvasGeometry, isRotationSettling } from '../ui/canvasGeometry.js';

// pointerdown에서 "방해꾼을 못 맞혀 아래로 흘려보낸" 대상. 이어서 오는 click을
// 같은 곳으로 보내기 위해 한 입력 동안만 들고 있는다(forwardClickThrough 주석 참고).
let clickThroughTarget = null;

/**
 * 화면 좌표(clientX/Y) → 게임 월드 좌표. 변환은 ui/canvasGeometry.js 한 곳에서만 한다
 * (그 반대 방향 worldToClient도 같은 기하값을 쓰므로 둘이 갈라질 수 없다 — 예전에
 * 한쪽만 고쳐서 "그림은 맞는데 클릭만 밀리는" 상태를 만든 적이 있다).
 */
function canvasPoint(canvas, evt) {
  // 첫 프레임이 그려지기 전에 클릭이 들어오는 극단적인 경우만 config로 폴백한다.
  const worldToBacking = canvas.__worldToBacking || canvas.width / config.canvas.width;
  return clientToWorld(canvas, evt.clientX, evt.clientY, worldToBacking);
}

export function initInput(canvas) {
  canvas.addEventListener('pointerdown', (evt) => {
    evt.preventDefault();
    onPointerDown(canvas, canvasPoint(canvas, evt), evt);
  });

  // pointerdown에서 아래로 흘려보낸 클릭은 click까지 같이 흘려보내야 한다.
  // 합성 pointerdown은 click을 만들어내지 않기 때문에, 이게 없으면 click으로
  // 동작하는 것들(개그팝업 X·버튼)이 마우스로는 영영 안 눌린다.
  canvas.addEventListener('click', (evt) => onCanvasClick(evt));

  // move는 window에 붙여 캔버스 밖으로 나가도 커서 위치를 계속 추적한다
  // (copier가 커서를 쫓아가야 하므로 중요).
  window.addEventListener('pointermove', (evt) => {
    state.pointer = canvasPoint(canvas, evt);
  });

  window.addEventListener('keydown', (evt) => onKeyDown(evt));

  // 우클릭 메뉴는 클릭 게임에 방해만 된다
  canvas.addEventListener('contextmenu', (evt) => evt.preventDefault());
}

/**
 * 클릭 라우팅. 우선순위는 딱 한 줄로 요약된다: **방해꾼이 항상 창보다 먼저다.**
 *
 * 캔버스가 레이어 중 맨 위(z-index, style.css)에 있어서 모든 클릭이 일단 캔버스로
 * 들어온다. 여기서 방해꾼을 맞히면 그걸로 끝 — 창 위에 떠 있는 방해꾼도 반드시
 * 클릭이 먹힌다(요구사항). 못 맞히면(방해꾼이 없는 자리를 눌렀으면) forwardClickThrough로
 * 캔버스 아래(HTML 창 → 개그팝업 → 장식 → 배경) 있는 실제 엘리먼트로 클릭을 그대로
 * 넘겨서 창 드래그·닫기 버튼·개그팝업이 예전처럼 동작하게 한다.
 *
 *  (1) 캔버스 층 — 위 가드. select/cleared 단계에서는 화면 전체가 캔버스
 *      오버레이(UI)라, 방해꾼이 배열에 남아 그려지고 있어도 클릭 대상이 아니다.
 *      이 return을 지우면 "버튼 눌렀는데 뒤 방해꾼도 맞는" 버그가 된다.
 *      title/failed는 아예 이 함수까지 안 온다(HTML 오버레이가 캔버스보다 위).
 *
 *  (2) HTML 층 — 캔버스가 못 맞혔을 때만 내려간다. 개그아이콘·작업표시줄(.layer-deco)은
 *      pointer-events:none이라 애초에 캔버스 자체가 클릭을 계속 받으므로(=방해꾼에게 감),
 *      이 통과 로직과는 무관하다(의도: 장식은 클릭 안 훔침).
 */
function onPointerDown(canvas, pt, evt) {
  state.pointer = pt;
  // 새 입력이 시작됐다 — 지난번에 기억해둔 통과 대상은 여기서 무효가 된다.
  // (방해꾼을 맞힌 경우에도 null로 남아야 그 클릭이 창으로 새어나가지 않는다)
  clickThroughTarget = null;

  // H키 오버레이가 켜져 있을 때만, 이 클릭이 월드 좌표 어디로 계산됐는지 남긴다.
  // 화면에서 누른 자리와 십자선이 어긋나면 그게 곧 좌표 변환 오차다(ui/renderEnemies.js).
  // t를 같이 남겨서 잠깐만 보이게 한다 — 오래된 마커는 창 크기가 바뀌면 엉뚱한 자리에
  // 그려져 오해를 부른다(core/state.js의 debugClicks 주석 참고).
  //
  // ★ 변환에 관여하는 값들을 그 순간 그대로 같이 담는다. 십자선이 커서에서 벗어날 때
  //   "어느 변수가 튀었나"를 스크린샷 한 장으로 알 수 있게 하려는 것 — 화면 배율은
  //   CSS zoom·브라우저 페이지줌(dpr에 반영)·트랙패드 핀치줌(visualViewport)이 겹칠 수
  //   있고, 어느 것이 rect에 반영되고 어느 것이 안 되는지가 브라우저/버전마다 다르다.
  if (debugState.showHitbox) {
    const w2b = canvas.__worldToBacking || canvas.width / config.canvas.width;
    const g = getCanvasGeometry(canvas);
    const d = g.diag;
    // ★ 왕복 자기검사: 방금 구한 월드 좌표를 다시 화면으로 되돌려 원래 클릭 자리와 비교한다.
    //   두 방향이 같은 기하값을 쓰므로 정상이면 0이고, 0이 아니면 변환 쌍이 깨진 것이다.
    const back = worldToClient(canvas, pt.x, pt.y, w2b);
    const vv = window.visualViewport;
    state.debugClicks.push({
      x: pt.x,
      y: pt.y,
      t: performance.now(),
      env: {
        client: [Math.round(evt.clientX), Math.round(evt.clientY)],
        roundTrip: [Math.round(back.x - evt.clientX), Math.round(back.y - evt.clientY)],
        origin: [Math.round(g.originX), Math.round(g.originY)],
        disp: [Math.round(g.dispW), Math.round(g.dispH)],
        // 진단용. rect가 disp와 갈리면 이 브라우저의 rect가 zoom을 안 반영한다는 뜻이다
        // (판정은 rect를 안 쓰므로 갈려도 좌표는 맞다 — 그냥 환경을 알려주는 값이다).
        rect: [Math.round(d.wRect), Math.round(d.hRect)],
        zoomChain: Number(d.zoomX.toFixed(4)),
        box: [canvas.clientWidth, canvas.clientHeight],
        backing: [canvas.width, canvas.height],
        cfg: [config.canvas.width, config.canvas.height],
        w2b,
        dpr: window.devicePixelRatio,
        zoom: getComputedStyle(document.getElementById('desktop')).zoom,
        vv: vv ? [Number(vv.scale.toFixed(3)), Math.round(vv.offsetLeft), Math.round(vv.offsetTop)] : null,
      },
    });
    if (state.debugClicks.length > 6) state.debugClicks.shift();
  }

  // [가드 0] intro/title/failed/cleared/ending 단계는 캔버스가 아무 것도 안 그리고
  // (ui/render.js) 클릭도 안 받는다 — 그 버튼들은 HTML(.layer-title/.layer-bsod/
  // .layer-cleared/.layer-ending, z-index 6)이 캔버스보다 위라 애초에 이 핸들러까지
  // 안 온다(브라우저가 버튼에서 이벤트를 끝낸다). 이 return이 없어도 아래 [가드 1]엔
  // 안 걸리고 그다음 `phase !== 'playing'` return에서 결국 막히긴 하지만, "이
  // 단계엔 캔버스가 할 일이 없다"를 명시적으로 남겨서 나중에 select 분기가 늘어나도
  // 여기가 실수로 거기 묶여 들어가는 걸 막는다.
  // (intro는 .layer-intro가 z14로 화면을 통째로 덮어 클릭이 여기까지 오지도 않지만,
  //  같은 이유로 명시적으로 적어둔다 — "이 단계엔 캔버스가 할 일이 없다")
  if (
    state.phase === 'intro' ||
    state.phase === 'title' ||
    state.phase === 'failed' ||
    state.phase === 'cleared' ||
    state.phase === 'ending'
  )
    return;

  if (state.phase !== 'playing') return;

  // 화면이 돌아가는 중(환경 방해 "모니터 세로모드"의 0.4초 전환)엔 클릭을 안 받는다.
  // ★ 판정을 못 해서가 아니라, 전환 중에는 "화면에 보이는 각도"와 "계산에 쓸 수 있는
  //   각도"가 한두 프레임 어긋날 수 있어서다 — 그 상태로 받으면 클릭이 살짝 빗나간다
  //   (ui/canvasGeometry.js의 isRotationSettling 주석에 근거를 적어뒀다).
  //   회전이 끝나 각도가 확정되면 그때부터는 평소와 똑같이 정확하게 받는다.
  if (isRotationSettling()) return;

  // hourglass 함정이 발동시킨 조작 불능 — 남아있는 동안은 클릭 자체를 통째로
  // 무시한다(요구사항: 다른 방해꾼을 눌러도 아무 반응이 없어야 한다). 얼어있는
  // 동안엔 이 클릭이 곧바로 여기서 끝나므로, 다른 hourglass를 눌러도 애초에
  // config.enemy.hourglass.freezeSec을 "다시 대입"할 클릭 자체가 들어올 수
  // 없다 — 그래서 중첩 연장이 구조적으로 불가능하다(스택 금지 요구사항).
  if (state.inputFreezeSec > 0) return;

  // ★인게임 튜토리얼이 클릭을 아직 안 열어줬다 — 통째로 무시한다.
  //   설명 단계(스포트라이트 + [다음])에서는 캔버스를 눌러봐야 할 일이 없고,
  //   특히 "놔두면 깎인다" 단계는 ★방치를 강제해야 교훈이 성립한다(눌러서
  //   없애버리면 진행바가 되돌아가는 걸 못 본다).
  //   ★hourglass(위 inputFreezeSec)와 굳이 따로 둔 이유: 저건 함정에 걸린
  //   벌칙이라 커서가 모래시계로 바뀌는 등 "당했다"는 연출이 붙는다. 이건
  //   그냥 아직 안 열린 것이라 아무 연출도 없어야 한다.
  if (state.tutorial.blockClicks) return;

  // 방해꾼은 바탕화면 전체를 쓴다. 맞혔으면 여기서 끝 — 캔버스가 클릭을 가져간 것이다.
  state.stats.clicks += 1;
  const verdict = hitTestEnemies(pt);

  // ★ 콤보 판정은 여기 한 곳에서만 한다. hitTestEnemies가 "무슨 일이 있었나"를
  //   말로 돌려주고(kill/hit/bait/miss…), 그걸 콤보 규칙으로 옮기는 건 이 자리다 —
  //   판정 루프 안에 combo 호출을 흩뿌리면 나중에 방해꾼 종류가 늘 때마다 "이건
  //   콤보가 끊기나?"를 그 자리에서 다시 판단하게 되고, 규칙이 조용히 갈라진다.
  //   어떤 결과가 왜 끊고 왜 안 끊는지는 systems/combo.js의 registerMiss 주석에 모아뒀다.
  if (verdict === 'kill') registerKill(pt.x, pt.y);
  else if (verdict === 'miss') registerMiss();
  // hourglass 발동 — fake_btn(trap)과 달리 콤보를 끊는다(요구사항). 진행도(MB)는
  // 안 건드리므로 damageUpload는 안 부른다 — "시간"이 이미 벌칙이다.
  else if (verdict === 'freeze') registerMiss();

  // 클릭 리플 — 처치/허공 무관하게 "눌렸다"는 반응(요구사항). 콤보가 오른
  // 상태로 처치했으면 그 tier 색으로 강조해 콤보 UI(캔버스에 뜨는 x N 글자,
  // ui/renderEnemies.js의 drawCombo)와 통일감을 준다. registerKill이 이미
  // state.combo를 올린 뒤라 comboTier(state.combo)가 "지금 처치로 오른" 색을 준다.
  spawnClickRipple(pt.x, pt.y, verdict === 'kill' ? comboTier(state.combo).color : null);

  if (verdict === 'miss') clickThroughTarget = forwardClickThrough(canvas, evt);
}

/**
 * 위에 그려진 놈부터 검사해서 "이 클릭에 무슨 일이 있었나"를 돌려준다.
 * 'miss'만이 아무 방해꾼도 없었다는 뜻이고(= 캔버스 아래로 클릭을 흘려보낸다),
 * 나머지는 전부 방해꾼이 판정을 소비한 경우다.
 *
 * @returns {'kill'|'hit'|'shake'|'trap'|'freeze'|'ignore'|'miss'}
 *   kill   잡았다(콤보 +1)          hit    유효타지만 아직 안 죽음(ransom 등)
 *   shake  popup 몸통을 눌렀다      trap   함정(fake_btn)을 밟았다
 *   freeze hourglass 함정을 밟았다(콤보 끊김, MB는 안 깎임 — trap과 다른 벌칙)
 *   ignore 눌러도 아무 일 없는 놈(copier)   miss   허공(bait 포함 — 아래 주석)
 */
function hitTestEnemies(pt) {
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const enemy = state.enemies[i];

    // ★ 죽은 놈은 건너뛴다. 죽고도 잠깐 화면에 남는 시체(corpseTimer — basic의 죽음
    //   프레임, 그리고 처치 팝 연출)가 그 자리의 클릭을 통째로 삼켜서, 뒤에 겹쳐 있던
    //   멀쩡한 방해꾼을 못 누르게 만든다. takeHit()이 이미 죽은 놈에겐 아무 일도
    //   안 하므로(kill이 alive 가드로 막는다) 클릭만 사라지고 아무 반응이 없다.
    if (!enemy.alive) continue;

    if (enemy.closeButton) {
      // popup류: 창 안에 그려진 닫기 버튼만 죽인다(위치는 config.enemy.closeButtonOffset*).
      // 몸통은 흔들리기만 하고 클릭을 소비한다.
      const btn = enemy.closeButtonRect();
      if (btn && pointInRect(pt, btn)) {
        enemy.kill('clicked');
        state.stats.hits += 1;
        return 'kill';
      }
      if (enemy.containsBody(pt.x, pt.y)) {
        enemy.triggerShake();
        // X가 아닌 몸통을 눌렀다 — "여기가 아니다"를 시각(흔들림)뿐 아니라 소리로도
        // 알린다. fake_btn 페널티음과 같은 "틀림" 결이지만, 구분되는 가벼운 오답음이다.
        playSfx(SFX.POPUP_WRONG);
        // 판 전체 누적(개체별이 아니다) — config.popupHintOutline.threshold에 닿으면
        // ui/renderEnemies.js가 살아있는 모든 popup의 X 버튼에 테두리 힌트를 켠다.
        state.popupBodyMisses += 1;
        return 'shake';
      }
      continue; // 이 놈은 안 맞았다 — 뒤에 깔린 놈을 계속 검사
    }

    // 도감(ui/dexPanel.js) 해금 전용 카운트 — bait는 히트박스 자체가 없어서
    // (enemies/Enemy.js) 아래 containsPoint가 이 놈에게는 항상 false다. 그래서
    // "처치"로는 영원히 못 잡는다(config.dex 주석) — 몸통(그림 전체) 클릭을 여기서
    // 따로 세되, 판정 자체는 그대로 허공 취급(return 없이 계속 진행)해야 한다.
    // 콤보 끊김도 이미 'miss' 낙하로 성립하므로(위 hitTestEnemies 문서 주석)
    // 여기서 return을 주면 오히려 그 기존 규칙을 깨게 된다.
    if (enemy.isBait && enemy.containsBody(pt.x, pt.y)) {
      recordEnemyEncounter('bait');
    }

    if (!enemy.containsPoint(pt.x, pt.y)) continue;

    if (enemy.isFreezeTrap) {
      // hourglass 발동. fake_btn(isTrap)과 벌칙의 결이 다르다 — 진행도(MB)는 안
      // 건드리고 대신 조작 자체를 config.enemy.hourglass.freezeSec만큼 통째로
      // 멈춘다("대입"만 해서 중첩 연장을 막는다 — 위 onPointerDown 가드가 이미
      // 얼어있는 동안 클릭 자체를 막으므로 실질적으로도 스택될 수 없다).
      playSfx(SFX.FAKEBTN_PENALTY); // 전용음이 없어 같은 "함정에 당했다" 결의 소리를 재사용
      state.inputFreezeSec = config.enemy.hourglass.freezeSec;
      // 도감 해금(config.dex 주석) — hourglass는 함정이라 'clicked'로 안 죽으므로
      // (아래 enemy.kill('trapped')) 일반 처치 경로를 절대 못 탄다. 발동 자체가
      // "정리했다"는 유일한 신호라 여기서 센다. 안 세면 이 항목은 영원히 안 열린다.
      recordEnemyEncounter(enemy.id);
      enemy.kill('trapped'); // 발동 즉시 소멸(요구사항) — 'trapped'라 killed 통계엔 안 들어간다
      return 'freeze';
    }

    if (enemy.clickable) {
      // takeHit()은 이 클릭으로 실제로 죽었을 때만 true다(ransom처럼 hp가 여러
      // 개면 아직 안 죽는다) — 콤보는 "처치"에만 오르므로 그 값을 그대로 쓴다.
      const killed = enemy.takeHit();
      state.stats.hits += 1;
      return killed ? 'kill' : 'hit';
    }

    if (enemy.isTrap) {
      // 누르면 안 되는 버튼을 눌렀다 — 낚였다.
      state.stats.trapClicks += 1;
      // 도감 해금(config.dex 주석) — fake_btn도 hourglass와 같은 처지다: 클릭의
      // 결과가 항상 kill('trapped')로 끝나 일반 처치 경로를 절대 못 탄다. 걸려든
      // 그 순간이 유일한 "정리됐다" 신호다.
      recordEnemyEncounter(enemy.id);
      // 함정음(FAKEBTN_PENALTY)이 곧 "속았다+당했다"는 신호라, damageUpload의 공통
      // 피격음(HIT)은 silent로 꺼서 겹치지 않게 한다 — 공통음까지 얹으면 함정음이 묻힌다.
      // 시각 피드백(번쩍임·비네트·수치)은 damageUpload가 그대로 켠다.
      playSfx(SFX.FAKEBTN_PENALTY);
      damageUpload(enemy.effect.wrongClickPct, enemy.x, enemy.y, { silent: true });
      // ★ 벌칙 경로는 위 그대로다(damageUpload → triggerHitFeedback 한 줄기).
      //   여기 얹는 건 "왜 깎였는지"를 글자로 알려주는 창 한 장뿐이다 — 공통
      //   피해 연출(번쩍임·비네트·"-10%")만으로는 방해꾼한테 맞은 것과 함정을
      //   밟은 것이 구분되지 않았다. 게임은 안 멈추고, 이 창은 클릭도 안 받는다
      //   (ui/trapDialog.js 상단 주석).
      showTrapDialog();
      enemy.hitFlash = config.enemy.hitFlashSec;
      // 낚인 그 자리에서 바로 사라진다(요구사항) — reason을 'clicked'가 아닌 값으로
      // 줘서 처치 연출(파편·처치음·kill 통계)은 안 타게 한다. 이건 "잡았다"가 아니라
      // "낚였다"라 다른 결이어야 한다 — 위 페널티(damageUpload+함정음)가 이미 그
      // 반응을 냈다. kill 통계에 안 들어가는 이유는 core/stageManager.js의
      // processDeaths 'trapped' 분기 주석 참고.
      enemy.kill('trapped');
      return 'trap';
    }

    // action=none이면서 함정도 아닌 놈(지금은 copier)은 눌러도 아무 일 없다 —
    // 그래도 방해꾼 자리를 누른 거라 클릭은 소비한다(창까지 통과시키지 않는다).
    //
    // ★ bait는 여기까지 안 온다. 시트에서 hit_w/hit_h가 0이라 hasHitbox=false고
    //   (enemies/Enemy.js), 그러면 hitRect()가 null이라 위 containsPoint에서
    //   항상 걸러진다 — 즉 bait를 눌렀다고 생각한 클릭은 게임 입장에선 말 그대로
    //   빈 자리를 누른 것이라 아래 'miss'로 떨어진다. 요구사항인 "bait에 속으면
    //   콤보가 끊긴다"는 그래서 별도 분기 없이 이미 성립한다(systems/combo.js의
    //   registerMiss 주석에 같은 내용을 적어뒀다).
    return 'ignore';
  }

  return 'miss'; // 어떤 방해꾼도 이 자리에 없었다 = 허공 클릭(bait 포함, 위 주석)
}

/**
 * 캔버스가 방해꾼을 못 맞혔을 때, 그 자리에 실제로 있는(캔버스 아래) HTML 엘리먼트로
 * 클릭을 그대로 넘긴다 — 안 그러면 캔버스가 레이어 맨 위를 통째로 덮어써서 창 드래그·
 * 닫기 버튼·개그팝업이 전부 죽는다. elementsFromPoint(복수형)가 그 자리의 엘리먼트를
 * 위에서 아래 순서로 다 주므로, 그중 캔버스가 아닌 첫 번째가 곧 "캔버스 밑에 있던 것"이다.
 *
 * ★ 예전엔 캔버스를 잠깐 pointer-events:none으로 껐다가 elementFromPoint(단수)로 찾고
 *   다시 켜는 방식이었다. 그런데 그 사이에 무엇이든 끼어들어 "다시 켜는" 줄에 도달하지
 *   못하면 캔버스가 영영 클릭을 못 받는 상태로 굳는다 — 그러면 방해꾼은 하나도 안 죽는데
 *   창 드래그는 멀쩡하고 좌표·히트박스 오버레이도 정상으로 보인다(강제로 그 상태를 만들어
 *   실측 확인: 방해꾼 클릭 시 clicks=0으로 핸들러 자체가 안 불리고, 창 드래그는 정상).
 *   원인을 찾기 어려운 데다 한 번 굳으면 새로고침 전까지 게임이 먹통이 되므로,
 *   "잠깐 껐다 켠다"는 상태 변경 자체를 없앴다. 지금은 캔버스를 건드리지 않으므로
 *   중간에 무슨 일이 나도 굳을 수가 없다.
 *
 * ★ pointerdown 하나만 넘기면 부족하다. 합성 pointerdown은 브라우저가 click으로
 *   이어주지 않으므로, click 리스너로 동작하는 것들(개그팝업의 X와 버튼)이 마우스로는
 *   전혀 안 눌린다. 그래서 여기서 찾은 대상을 clickThroughTarget에 기억해뒀다가
 *   이어서 오는 canvas의 click도 같은 대상에게 넘긴다(onCanvasClick).
 *   창 드래그(ui/desktop.js)는 pointerdown으로 시작하고 이후 pointermove/pointerup은
 *   window에 붙어 있어 그대로 도착하므로, 이 둘만 넘겨주면 기존 동작이 전부 산다.
 *
 * @returns {Element|null} 이어지는 click을 넘겨줄 대상
 */
function forwardClickThrough(canvas, evt) {
  if (!evt) return null;

  // 위에서 아래 순서. pointer-events:none인 것들은 애초에 목록에 안 들어오므로,
  // 캔버스만 건너뛰면 그게 "캔버스가 없었다면 클릭을 받았을" 엘리먼트다.
  const stack = document.elementsFromPoint(evt.clientX, evt.clientY);
  const target = stack.find((el) => el !== canvas);

  if (!target) return null;
  target.dispatchEvent(new PointerEvent(evt.type, evt));
  return target;
}

/**
 * 위에서 아래로 흘려보낸 그 클릭의 마무리. pointerdown 때 기억해둔 대상에게만
 * click을 넘긴다 — 방해꾼을 맞힌 클릭은 clickThroughTarget이 null이라 여기서 걸러진다.
 */
function onCanvasClick(evt) {
  const target = clickThroughTarget;
  clickThroughTarget = null;
  if (!target) return;

  target.dispatchEvent(new MouseEvent('click', evt));
}

function onKeyDown(evt) {
  // ★갤러리 확대 팝업(ui/galleryPanel.js)이 설정 ESC보다 먼저다 — 모달 위에
  // 뜬 또 다른 모달이라 "가장 안쪽부터 닫는다"는 기대에 맞아야 한다. 이걸
  // 설정 ESC 뒤에 두면, 팝업이 열려 있는 동안(타이틀 phase는 ESC로 설정을
  // 열 수 있다, settingsPanel.js의 ESC_OPENABLE_PHASES) ESC가 팝업 대신
  // 설정창부터 열어버린다. 팝업이 안 열려 있으면 이 함수는 그냥 false라
  // 아래로 그대로 흘러 기존 동작(설정 ESC가 최우선)이 안 바뀐다.
  if (handleGalleryViewerKey(evt.code)) {
    evt.preventDefault();
    return;
  }
  // ESC는 그다음으로 가장 먼저 본다 — 설정 팝업이 열려 있든 닫혀 있든 이 한 줄이
  // 최종 결정권을 가져야 "닫히긴 하는데 다른 키도 같이 먹힌다" 같은 꼬임이 없다.
  if (handleSettingsKey(evt.code)) {
    evt.preventDefault();
    return;
  }
  // 설정 팝업이 열린 동안은 일시정지 중이다 — D/H 같은 디버그 키까지 포함해서
  // 나머지 단축키를 전부 막는다. 캔버스 클릭은 이미 .layer-settings(z11)가
  // 캔버스(z5)보다 물리적으로 위에서 가로채므로(ui/settingsPanel.js 상단 주석)
  // 여기 키보드 쪽만 막아주면 된다.
  if (state.settingsOpen) return;

  if (handleDebugKey(evt.code)) {
    evt.preventDefault();
    return;
  }

  // 결과 화면: R = 다음 구간(클리어) / 처음부터(실패). 화면 버튼과 같은 동작.
  if (evt.code === 'KeyR' && (state.phase === 'cleared' || state.phase === 'failed')) {
    advanceStage();
  }
}
