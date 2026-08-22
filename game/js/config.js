// 이 파일 역할: 엔진 상수(캔버스·HUD·연출 수치)를 담고, balance/ 의 시트 데이터 API를 한 곳에서 다시 내보낸다.
// 다른 파일은 숫자를 직접 들고 있지 않고 전부 여기서 import한다.

import { PROGRESSION } from './balance/progression.js';

// 엔진 상수. CSV/시트와 무관하게 항상 고정인 값들이다.
// 여기 숫자를 바꾸면 시트 연결 여부와 상관없이 동작이 바뀐다.
export const config = {
  canvas: {
    // 캔버스 논리 해상도(px)의 최후 폴백. 실제로는 거의 항상 stage 시트의
    // canvas_w/canvas_h가 이 값을 덮어쓴다(아래 applyStageToConfig 참고) —
    // 해상도를 바꾸고 싶으면 여기가 아니라 시트의 canvas_w/canvas_h를 바꾼다.
    width: 1920,
    height: 1080,

    // 방해꾼 크기/히트박스/속도가 "설계된" 기준 해상도(px, 가로 기준).
    // enemies 시트의 size_w/hit_w/speed 같은 숫자는 전부 이 폭을 놓고 짠 값이다.
    // 실제 canvas.width가 이보다 크면(예: 1920) 그 비율만큼 방해꾼도 같이
    // 커지고, 작으면 같이 작아진다 — getScaleFactor() 참고.
    // 바꾸면 지금 시트 숫자가 "기준으로 삼는 화면 크기"가 바뀐다.
    baseWidth: 1280,

    // HUD/타이틀/난이도 카드/결과 화면이 "설계된" 기준 해상도. 방해꾼(baseWidth)과
    // 일부러 다른 값이다 — ui/screens.js 안의 픽셀 숫자(타이틀
    // 40px, 카드 300x200 등)는 전부 1920 폭을 놓고 짰을 때 겹치지 않고 보기
    // 좋았다. 실제 canvas.width가 이거보다 작으면(지금 시트는 960) UI가
    // 상대적으로 너무 커져서 디버그 패널이 카드를 덮는 등 서로 가리게 된다 —
    // ui/render.js가 getUiScaleFactor()만큼 캔버스 변환(ctx.scale)으로 HUD/
    // 화면 전체를 한 번에 줄이거나 키운다. 바꾸면 지금 UI 숫자들이 "기준으로
    // 삼는 화면 크기"가 바뀐다.
    uiBaseWidth: 1920,
  },

  loop: {
    // 한 프레임에 허용할 최대 dt(초). 탭을 갔다 오면 dt가 수 초로 튀는데,
    // 그대로 두면 방해꾼이 순간이동하고 업로드가 확 깎인다.
    // 키우면 저사양에서 덜 느려지지만 튐이 심해진다.
    maxDt: 0.05,
  },

  // 구간(스테이지) 자동 상승 공식의 상수. 실제 정의와 상세 주석은
  // balance/progression.js에 있다(순환참조를 피하려고 잎 모듈로 뺐다).
  // 바깥에서는 지금처럼 config.progression 으로 그대로 읽으면 된다.
  progression: PROGRESSION,

  // HUD는 캔버스에서 HTML 창(ui/statusWindow.js)으로 옮겨갔다.
  // 레이아웃 숫자는 전부 style.css로 갔고, 여기엔 게임 로직이 읽는 값만 남는다.
  hud: {
    // 주기 공격을 맞은 순간 "맞았다" 표시가 켜져 있는 시간(초).
    // systems/upload.js가 state.hitFlash에 넣고, 상태창이 그 동안 경고를 띄운다.
    hitFlashSec: 0.25,
  },

  enemy: {
    // 클릭이 맞았을 때 번쩍이는 시간(초). 키우면 타격감이 길게 남는다.
    hitFlashSec: 0.12,
    // 클릭이 맞았을 때 순간적으로 커지는 비율. 키우면 반응이 과장된다.
    hitPunch: 0.18,
    // 스폰 위치를 고를 때 min_gap을 지키려고 재시도하는 횟수.
    // 키우면 겹침이 줄지만 스폰이 살짝 무거워진다.
    spawnTries: 24,
    // 남은 수명 바의 두께(px). 0으로 두면 수명 표시가 사라진다.
    lifeBarH: 5,

    // === 주기 공격(구 dps) ===
    // 시트엔 아직 dps 한 칸뿐이라, "dps%를 초당 지속으로 깎기" 대신
    // "atk_interval초마다 atk_damage%를 한 방에" 로 임시 환산해서 쓴다.
    // atk_damage = dps * atkIntervalSec 로 계산하므로 총 피해량(초당 평균)은
    // 예전과 같다 — 다만 지속 감소가 아니라 몰아서 맞는 방식으로 바뀐다.
    // TODO: 시트에 atk_interval/atk_damage 전용 컬럼이 생기면 이 환산(및
    // enemies.js의 Enemy.atk 생성부)을 걷어내고 시트 값을 직접 쓴다.
    atkIntervalSec: 3,
    // 공격 직전 예비동작(커지고 흔들림) 시간(초). 키우면 더 일찍부터
    // "곧 맞는다"를 알아챌 수 있어 대응하기 쉬워진다.
    atkTelegraphSec: 0.5,
    // 예비동작 중 최대로 커지는 비율.
    atkTelegraphPunch: 0.25,
    // 예비동작 중 흔들리는 폭(px).
    atkTelegraphShake: 4,

    // === copier처럼 커서를 쫓아가는(클릭 대상이 아닌) 이벤트형 방해꾼 ===
    // 화면 가장자리가 아니라 진짜 커서에서 이만큼(px, 기준 해상도) 떨어진
    // 무작위 위치에 뿅 나타난다. 너무 가까우면(0에 가까우면) 나타나자마자
    // 바로 터져서 반응할 틈이 없고, 너무 멀면 예전처럼 가장자리 스폰과
    // 다를 게 없어진다 — "짧게 다가와 터지는" 느낌이 핵심.
    homingSpawnDistMin: 90,
    homingSpawnDistMax: 170,
    // 진짜 커서와 이 거리(px) 안으로 들어오면 "안착"으로 치고 그 자리에서
    // 터진다. 키우면 더 멀리서도 터져서 쉽게 자폭시키는 셈이 되고, 줄이면
    // 커서에 거의 겹쳐야만 터진다. 못 잡고 수명(시트의 lifetime)이 다하면
    // 아무 효과 없이 그냥 사라진다 — 그게 "피했다"는 뜻이다.
    homingArriveDist: 28,

    // === 그림에 실제로 그려진 클릭 대상 위치표 ===
    //
    // 왜 필요한가: 시트의 hit_w/hit_h는 "스프라이트 박스 중심에 놓인 사각형" 하나뿐이라
    // (enemies/hitbox.js의 hitRect), 그림이 캔버스를 꽉 안 채우거나 한쪽으로 치우쳐
    // 있으면 판정이 그림과 어긋난다. 눌러도 안 죽거나, 반대로 빈 공간을 눌러도 죽는다.
    // 여기 적은 종류는 시트 값 대신 이 표를 쓴다(그 외는 그대로 시트 값).
    //
    // 좌표계: 원본 png 캔버스(128x128) 좌상단 기준 비율 0~1.
    //   → 스프라이트가 어떤 크기로 렌더되든(시트의 size_w/size_h를 바꾸든, 화면
    //     해상도가 바뀌든) 그림 위 같은 자리를 가리킨다. px로 박으면 시트를 만질
    //     때마다 다시 재야 하지만 비율은 안 그렇다.
    // 값의 출처: 각 png의 알파/잉크 픽셀을 직접 스캔해서 잰 실측값이다.
    //
    // ★ 그림을 갈아끼우면 반드시 다시 재야 한다. 판정이 그림에 없는 자리를 가리켜도
    //   화면상으론 아무 티가 안 나고, 플레이할 때 "왜 안 죽지?"로만 나타난다
    //   (실제로 그렇게 한 번 당했다 — 옛 popup 판정이 빈 여백을 가리키고 있었다).
    artHitbox: {
      // popup: 광고창. a/b는 X 버튼 위치가 완전히 다르다 — 절대 한 좌표로 뭉치지 말 것.
      'popup:a': { l: 76 / 128, t: 9 / 128, r: 96 / 128, b: 26 / 128 }, // 상단 팻말의 X
      'popup:b': { l: 107 / 128, t: 52 / 128, r: 117 / 128, b: 68 / 128 }, // 우하단 X
      // fake_btn: 함정 "확인" 버튼(3프레임 합집합). 이걸 눌러야 벌칙이 터진다.
      fake_btn: { l: 32 / 128, t: 72 / 128, r: 94 / 128, b: 97 / 128 },
      // bomb: 몸통이 왼쪽으로 치우쳐 있다(우측 약 30px이 빈 캔버스).
      bomb: { l: 24 / 128, t: 7 / 128, r: 88 / 128, b: 108 / 128 },
      // clone: tier마다 그림 크기가 딴판이라 tier별로 따로 잡는다. 특히 small은
      // 그림이 49x44뿐이라 큰 판정을 쓰면 빈 공간을 눌러도 죽어 너무 쉬워진다.
      'clone:0': { l: 1 / 128, t: 17 / 128, r: 126 / 128, b: 116 / 128 }, // big
      'clone:1': { l: 30 / 128, t: 20 / 128, r: 110 / 128, b: 105 / 128 }, // mid
      'clone:2': { l: 13 / 128, t: 19 / 128, r: 115 / 128, b: 109 / 128 }, // small
    },
    // 위 판정 사각형 사방에 더하는 여유(원본 캔버스 대비 비율). 그림에 딱 맞추면
    // 가장자리가 아슬아슬해서 누르기 답답하다 — 3px(=3/128) 정도만 넉넉히 준다.
    // 키우면 전반적으로 누르기 쉬워지고, 줄이면 그림에 정확히 맞춰야 한다.
    artHitboxPadRatio: 3 / 128,

    // H키 디버그 십자선(클릭이 계산된 월드 좌표)이 보이는 시간(ms).
    // 짧게 두는 게 중요하다 — 마커는 월드 좌표라 창 크기가 바뀌면 다른 화면 자리에
    // 다시 그려지는데, 오래된 마커를 지금 커서와 견주면 "판정이 밀린다"로 오해한다.
    debugClickTtlMs: 1500,

    // 시트에 행이 있어도 스폰하지 않을 종류. 그림이 준비되면(2026-08-22, bait 그림
    // 4종 도착) 여기서 빼면 바로 스폰이 살아난다.
    disabledIds: [],
    // 몸통(= X 버튼이 아닌 곳)을 잘못 눌렀을 때 흔들리는 시간(초).
    bodyShakeSec: 0.25,
    // 그 흔들림의 폭(px).
    bodyShakeAmount: 6,

    // '커서쪽 접근'(chase) 방해꾼 — 지금은 fake_btn(함정 확인창) 하나뿐이다.
    // 목적은 "다른 놈 잡으려다 실수로 확인 버튼을 밟게" 만드는 것이라, 속도보다
    // 지연(lag)이 핵심이다. 빠르면 못 피해서 억울하고, 지연이 없으면 커서에
    // 딱 붙어다녀서 오히려 눈에 띄어 안 속는다.
    chase: {
      // 시트 speed 대비 실제 추격 속도 배율. 시트 값(fake_btn=200) 그대로면
      // 커서를 그냥 따라잡아버려서 피할 수가 없다.
      speedMult: 0.55,
      // 커서를 곧바로 쫓지 않고, 이만큼 뒤처진 목표점을 쫓는다(초, 지수 감쇠 시상수).
      // 계속 움직이면 영영 못 잡고 멈추면 서서히 따라붙는다 = "피할 수는 있는" 여지.
      pointerLagSec: 0.45,
      // 목표까지 이 거리(px, 기준 해상도) 안으로 들어오면 거리에 비례해 감속한다
      // — 마지막 접근이 느려져서 "닿을 듯 말 듯" 약올리는 느낌이 난다.
      arriveRadius: 120,
      // 감속하더라도 이 비율 아래로는 안 떨어진다(완전히 멈추면 안 무섭다).
      minSpeedRatio: 0.15,
    },
  },

  // 방해꾼별 등장 연출. 스폰 직후 durSec 동안만 재생되고 그 뒤엔 완전히 무해해진다
  // (enemies/entrance.js). kind가 실제 움직임 종류, durSec이 재생 시간(초).
  //
  // ★ 등장 연출은 "그리기"만 바꾸는 게 아니라 판정(hitRect)도 같이 따라간다 —
  //   enemies/Enemy.js의 drawX/drawY/drawW/drawH 게터 하나를 그리기와 판정이
  //   같이 읽는다. 보이는 자리와 눌리는 자리가 갈라지는 사고가 이 프로젝트에서
  //   반복됐기 때문에, 연출을 넣을 때도 그 둘이 구조적으로 못 갈라지게 묶어뒀다.
  //
  // 여기 없는 id는 연출 없음(none)이다:
  //   unplug — 시트의 '화면밖→안 진입후 정지'(enterStop)가 이미 "손이 쑥 들어와
  //            멈추는" 연출이라 그대로 둔다(요구사항도 "기존 사양").
  //   bait   — 자체 등장/소멸 연출 5종이 따로 있다(config.bait.effects).
  entrance: {
    // 아래에서 폴짝 튀어오르며 스쿼시&스트레치
    basic: { kind: 'hop', durSec: 0.42, risePx: 90, squash: 0.35 },
    // 위에서 쿵 떨어지고 착지 순간 화면이 살짝 흔들린다(무게감)
    ransom: { kind: 'slam', durSec: 0.5, dropPx: 260, landShakePx: 7, landShakeMs: 260 },
    // 뿅 하고 증식 — 0.1배에서 1.25배로 넘쳤다가 1로 정착
    clone: { kind: 'pop', durSec: 0.35, from: 0.1, overshoot: 1.25 },
    // 창 열리듯 가로로 쫙 펴진 뒤 세로로 열린다
    popup: { kind: 'window', durSec: 0.32, xPhase: 0.45 },
    // 위에서 투하 + 착지 후 한 번 통통 튄다
    bomb: { kind: 'drop', durSec: 0.55, dropPx: 320, bounce: 0.22 },
    // 시스템 알림처럼 스윽 나타난다(진짜 창인 척해야 해서 요란하면 안 된다)
    fake_btn: { kind: 'fade', durSec: 0.45, risePx: 18 },
    // 지지직 인쇄되듯 위아래로 떨며 나온다
    copier: { kind: 'print', durSec: 0.5, jitterPx: 7, jitterHz: 26 },
    // 블러에서 스르륵 — 위장한 놈이라 느리고 눈에 안 띄게
    hidden: { kind: 'blurIn', durSec: 1.2, blurPx: 10 },
  },

  cursor: {
    // copier가 안착해서 터질 때 뿌리는 가짜 커서 개수. 시트의 special_effect
    // 문구("가짜커서 8개 5초간")에 적힌 숫자는 무시하고 이 값을 쓴다 — "졸라
    // 많다" 싶을 만큼 있어야 진짜 커서를 찾기 어려워지는 게 핵심이라,
    // 밸런스 테스트 중엔 시트보다 여기서 바로 조절하는 게 편하다.
    // 너무 키우면(화면을 다 덮으면) 오히려 아무것도 안 보여서 재미없어진다 —
    // "많아서 못 찾겠지만 화면이 새까매지진 않는" 선을 유지할 것.
    fakeCursorCount: 45,

    // === 360도 방사형 배치 ===
    // 터진 지점(=진짜 커서)을 중심으로 각도를 fakeCursorCount개로 고르게
    // 나눠서 배치한다(한쪽으로 쏠리지 않게) + 살짝 무작위 흔들림만 더한다.
    fakeOffsetMin: 20,
    fakeOffsetMax: 190,
    // 고르게 나눈 각도에 더하는 무작위 폭(라디안). 0이면 기계적으로 완전히
    // 균일해서 오히려 부자연스럽다 — 살짝만 흐트러뜨린다.
    fakeAngleJitter: 0.25,
    // 이 중 몇 개는 방사형 배치 대신 진짜 커서 바로 옆(fakeStickOffsetMax
    // 이내)에 거의 붙어서 같이 움직인다 — "설마 저것도 가짜?" 하는 헷갈림용.
    fakeStickCount: 2,
    fakeStickOffsetMax: 14,

    // === 궤적 따라가기(사람처럼 보이는 핵심) ===
    // 진짜 커서가 실제로 지나간 궤적(systems/pointerTrail.js)을 각 가짜
    // 커서가 자기만의 시간차(delay)를 두고 그대로 따라간다 — 절차적으로
    // "사람처럼" 흉내내는 게 아니라 진짜 사람 움직임을 시간차 재생하는
    // 것이므로, 정지-이동-정지 리듬이 저절로 나온다.
    trailMaxAgeSec: 2.5, // 궤적을 얼마나 오래 기억해둘지. 아래 fakeDelayMax보다 커야 한다.
    fakeDelayMin: 0.05,
    fakeDelayMax: 1.3,

    // 손 떨림(미세한 흔들림). amount는 흔들리는 폭(px), speed는 흔들리는
    // 빠르기 — 너무 크면 오히려 로봇처럼 규칙적으로 보인다.
    jitterAmount: 2.2,
    jitterSpeed: 14,

    // 가짜 커서 하나하나가 살아있는 시간(초) — 이 범위에서 각자 따로 뽑는다
    // (전부 똑같이 사라지면 그 순간 티가 난다). 시트 special_effect 문구의
    // "...5초간"은 이제 안 쓴다.
    fakeDurationMin: 5,
    fakeDurationMax: 7,

    // === 가짜 커서 스프라이트(assets/enemies/cursor/cursor.png, 원본 128x128) ===
    // 벡터로 그리던 걸 실제 손그림 스프라이트로 바꾸면서 생긴 표시 크기/손끝(호트스팟) 값.
    // 호트스팟 비율은 원본 PNG에서 커서 뾰족한 끝이 있는 대략의 위치(좌상단 쪽)를 재서 넣었다.
    // 나중 조절 예정 — 지금은 임시값.
    spriteSize: 64,
    hotspotXRatio: 0.11,
    hotspotYRatio: 0.13,
  },

  fx: {
    // "-10%" 같은 뜬 글씨가 남아있는 시간(초). 키우면 화면이 지저분해진다.
    floatSec: 0.9,
    // 뜬 글씨가 위로 올라가는 거리(px).
    floatRise: 44,
    // "+60MB"처럼 화면 중앙에 띄우는 글씨의 세로 위치(캔버스 높이 대비 비율).
    floatTopRatio: 0.22,
  },

  // HTML 바탕화면 껍데기(ui/desktop.js) 전용. 전부 1920x1080 좌표 기준.
  desktop: {
    // 시작할 때 띄워둘 개그 팝업 수.
    initialGagPopups: 2,
    // 동시에 떠 있을 수 있는 개그 팝업 상한. "닫으면 또 뜬다" 개그가
    // 무한 증식으로 화면을 덮지 않게 막는 안전장치.
    maxGagPopups: 6,
    // 새 개그 팝업이 뜨는 위치 범위 [최소, 최대] (px).
    gagSpawnX: [120, 1520],
    gagSpawnY: [150, 650],
    // 토스트가 떠 있는 시간(초).
    toastSec: 1.2,
    // 남은 시간이 이 아래로 내려가면 상태창 시계가 빨개진다(초).
    timeWarnSec: 30,
  },

  // bait("시선 강탈") 전용 — 화면을 돌아다니지 않고 모서리에 고정된 채
  // 시선 강탈(bait) — 클릭해도 안 죽는 페이크 미끼. 다른 방해꾼과 완전히 분리된
  // 상태기계(enemies/bait.js)와 그리기(ui/baitRender.js)를 쓴다.
  bait: {
    // 표시 크기 — 1920 기준 화면에서 이 CSS px 폭으로 보인다(원본 512x512 정사각형을
    // 이 크기로 그린다). 메인 .exe 창보다 확실히 작아야 해서 화면폭의 20~24%
    // (1920*0.20=384 ~ 1920*0.24=460.8) 범위에서 골랐다. 380/420/450 실측 스샷
    // 비교 후 420으로 확정.
    sizePx: 420,
    // 화면 가장자리에서 이만큼(px, 기준 해상도) 안쪽에 자리를 잡는다(모서리 등장 위치).
    insetX: 140,
    insetY: 120,

    // 등장/소멸 연출 5종. 스폰 시 weights 비율로 하나를 고른다(노이즈 디졸브가
    // "확정·주력"이라 나머지 넷보다 비중을 높게 뒀다). 각 효과의 초 단위 값은
    // 전부 여기 상수다 — enemies/bait.js·ui/baitRender.js는 숫자를 직접 들고
    // 있지 않는다.
    effects: {
      weights: { noise: 0.4, slideHuge: 0.15, pixelDissolve: 0.15, glitchPop: 0.15, flicker: 0.15 },

      // 1) 노이즈 위→아래 소멸 [확정·주력]. 등장은 짧게 훅 나타나고, 소멸이 핵심이라
      //    "존나 느림" 요구사항대로 8초를 준다.
      noise: {
        enterSec: 0.4,
        holdSec: 1.5,
        dissolveSec: 8,
        cellPx: 10, // 노이즈 셀 하나의 크기(px, 512 원본 기준) — 작을수록 더 곱게 갈린다
        verticalBias: 0.65, // 0=완전 무작위, 1=완전 위→아래 순서. 사이값이라 "위→아래로
        // 향하되 경계가 들쭉날쭉한 노이즈"가 된다.
        glitchBandPx: 10, // 소멸 경계에 뜨는 밝은 지지직 띠 두께(px, 512 원본 기준)
      },

      // 2) 슬라이드-인 초대형. 유일하게 화면 밖에서 물리적으로 밀려 들어온다/나간다
      //    (나머지 넷은 제자리에 고정 출현 — 위 "모서리 고정 출현" 규칙).
      slideHuge: {
        sizeMult: 1.35, // 기본 sizePx 대비 배율 — "초대형"
        slideSec: 4, // 등장·퇴장 각각 이만큼(왕복 아님, 편도)
        holdSec: 3,
      },

      // 3) 픽셀 디졸브. 모래알처럼 완전 무작위로 흩어지며 사라진다(노이즈처럼 위→아래
      //    쏠림이 없다 — enemies/bait.js가 verticalBias=0으로 맵을 만든다).
      pixelDissolve: {
        enterSec: 0.4,
        holdSec: 1.5,
        dissolveSec: 7,
        grainPx: 14, // 모래알 한 알의 크기(px, 512 원본 기준)
      },

      // 4) 글리치 팝. RGB 색수차가 어긋난 채로 지지직 등장, 체류 중에도 간헐적으로
      //    짧게 지직거리다가, 퇴장도 같은 글리치로 마무리한다.
      glitchPop: {
        enterSec: 0.5,
        holdSec: 3,
        exitSec: 0.5,
        rgbSplitPx: 6, // 색수차 최대 어긋남(px, 512 원본 기준)
        idleGlitchIntervalSec: 1.2, // 체류 중 간헐 지직이 이 주기로 온다
        idleGlitchDurSec: 0.15,
      },

      // 5) 형광등 껌뻑. 켜질 듯 말 듯 몇 번 깜빡이다 완전히 켜지고, 꺼질 때도 같은
      //    식으로 깜빡이다 꺼진다.
      flicker: {
        enterSec: 1.6,
        holdSec: 3,
        exitSec: 1.2,
        flickerCount: 5, // 등장/퇴장 각각 몇 번 깜빡이는지
      },
    },
  },

  debug: {
    // 이 플래그 하나로 디버그 패널이 완전히 켜지고 꺼진다.
    // 지금은 밸런스 테스트용 프로토라 true. 배포 빌드에서는 false로 둔다.
    enabled: true,
  },

  // 방해꾼 스프라이트 애니메이션(sprite/animator.js) 전용 타이밍.
  // 프레임 정의(어떤 png가 몇 장인지)는 animator.js의 FRAME_SETS에 있고, 여기는
  // "얼마나 빠르게/오래"만 담는다 — 값은 전부 나중 조절 예정인 임시값(placeholder)이다.
  anim: {
    // 루프 애니(basic/bomb/unplug/popup/bait/ransom) 한 프레임의 길이(ms).
    frameDurationMs: 150,
    // basic이 클릭에 맞아 죽었을 때 {n}_dead 한 장을 보여주고 실제로 배열에서
    // 치우기까지 기다리는 시간(초). 0으로 두면 예전처럼 즉시 사라진다.
    basicDeathLingerSec: 0.35,
    // 살아남는 피격(예: ransom 단계 전환) 직후 hit 프레임을 끼워 보여주는 시간(초).
    ransomHitFlashSec: 0.15,
  },

  // 화면 전환(phase가 바뀌는 순간) CRT 킥 연출 — ui/crtTransition.js가 "언제·얼마나"를
  // 전부 담당한다. 재생시간은 style.css의 .layer-crt @keyframes에도 CSS 변수로
  // 내려가고(crtTransition.js의 initCrtTransition), 흔들림 진폭은 CSS가 아니라
  // getCrtShakeOffset이 이 값을 직접 읽는다(canvas 조상에 transform 애니를 걸면 안
  // 되는 이유는 crtTransition.js 상단 주석 참고 — 그래서 흔들림만 CSS가 아니라 JS다).
  crt: {
    // 전환마다(대기→플레이, 결과→대기 등) 재생된다. 자주 반복되는 전환(예: "다시하기"를
    // 연타하는 결과→대기)이 길게 느껴지면 이 값부터 줄여라 — 언제 재생하는지의
    // 조건(phase-change 감지)은 안 건드려도 된다.
    // 2026-08-22: 900 → 1600(1.78배) — 흔들림/왜곡을 다 보여주기엔 900ms가 짧았다.
    durationMs: 1600,
    // 화면 흔들림(ui/crtTransition.js의 getCrtShakeOffset)의 정점 진폭. 감쇠 곡선은
    // 이 값에 지수감쇠 배수를 곱해서 정하므로, 여기 하나만 바꾸면 흔들림 세기가
    // 전체적으로 변한다.
    shakeAmpPx: 10,
  },
};

// ---------------------------------------------------------------------------
// 시트 밸런스 데이터 (balance/ 에 구현, 여기서 다시 내보낸다)
// 덕분에 게임 코드는 경로를 신경 쓰지 않고 './config.js' 하나만 보면 된다.
// ---------------------------------------------------------------------------

import { getStageValue } from './balance/loader.js';

export { gameData, getStageValue, loadGameData, reloadGameData } from './balance/loader.js';
export { getFileTiers, createRules, parseSpecialEffect } from './balance/rules.js';

/**
 * stage 시트의 canvas_w/canvas_h를 위 config.canvas에 반영한다.
 * config를 고치는 유일한 곳이라 balance/가 아니라 여기에 둔다
 * (balance/ 가 config를 import하면 순환참조가 된다).
 * → 캔버스 해상도를 바꾸려면 코드가 아니라 stage 시트의 canvas_w/canvas_h를 고친다.
 */
export function applyStageToConfig() {
  config.canvas.width = getStageValue('canvas_w', config.canvas.width);
  config.canvas.height = getStageValue('canvas_h', config.canvas.height);
}

/**
 * 지금 캔버스가 기준 해상도(config.canvas.baseWidth)보다 몇 배 큰지/작은지.
 * enemies.js가 이 값을 방해꾼 크기·히트박스·속도에 곱해서, 어떤 해상도로
 * 바꿔도 화면에서 차지하는 비율이 같아 보이게 한다. applyStageToConfig()
 * 이후에 불러야 실제 캔버스 폭을 반영한다(그 전엔 폴백 width 기준).
 */
export function getScaleFactor() {
  return config.canvas.width / config.canvas.baseWidth;
}

/**
 * 위 getScaleFactor()와 같은 개념이지만 방해꾼이 아니라 HUD/타이틀/난이도
 * 카드/결과 화면 전용 — 기준 폭이 다르다(uiBaseWidth=1920).
 * ui/render.js가 이 값으로 ctx.scale()을 걸어서 그 안의 그리기 함수들은
 * 항상 1920 기준 숫자 그대로 쓰면 된다.
 */
export function getUiScaleFactor() {
  return config.canvas.width / config.canvas.uiBaseWidth;
}

/**
 * 캔버스 백킹스토어(실제 픽셀 수) 1개당 논리 픽셀 몇 개인지.
 *
 * 게임 로직·좌표는 전부 "논리 해상도"(config.canvas.width, 시트의 canvas_w)를 쓰고,
 * 백킹스토어는 화면에 실제로 깔리는 device px에 맞춰 따로 키운다(ui/canvasFit.js).
 * 둘을 잇는 게 이 배율이다 — ui/render.js가 매 프레임 ctx.setTransform으로 걸어주므로
 * 그리기 코드는 예전처럼 논리 좌표만 쓰면 된다.
 *
 * 이렇게 분리한 이유: 예전엔 백킹스토어가 시트의 960x540으로 고정이라, 화면이 그보다
 * 크면(예: 1310) 캔버스에 그린 글씨(대기/결과 화면)가 비트맵째 확대돼 뭉개졌다.
 * 백킹스토어를 실제 표시 크기에 맞추면 글자가 처음부터 최종 해상도로 그려진다.
 *
 * 방해꾼 크기는 이 값과 무관하게 그대로다 — 논리 크기가 config.canvas.width에
 * 비례하고(getScaleFactor) 표시 배율이 그 역수로 움직여 서로 상쇄된다.
 */
export function getRenderScale(canvas) {
  return canvas.width / config.canvas.width;
}

/**
 * ui/screens.js가 레이아웃 계산에 쓰는 "가상의" 캔버스 크기
 * (1920 기준, 실제 canvas.width/height와는 다를 수 있다). getUiScaleFactor()로
 * 그려질 것을 전제하므로, 실제 캔버스가 몇이든 이 크기 기준으로 좌표를 짜면
 * 항상 올바른 비율로 나온다. 클릭 판정(systems/input.js)도 같은 걸 써야
 * 그리기와 히트박스가 어긋나지 않는다.
 */
export function getUiReferenceCanvas() {
  return {
    width: config.canvas.uiBaseWidth,
    height: config.canvas.uiBaseWidth * (config.canvas.height / config.canvas.width),
  };
}
