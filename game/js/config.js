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

  // 게임 영역 마우스 커서(ui/cursor.js가 이 값들로 CSS cursor를 조립해 #desktop에
  // 건다). assets/enemies/cursor/cursor.png(copier가 안착 시 뿌리는 가짜 커서와
  // 같은 그림)를 그대로 재활용했다 — 새 그림을 안 만들어도 이미 "이 게임의
  // 커서 어휘"로 화면에 있던 그림이라 톤이 저절로 맞는다.
  // ★ 이름이 mouseCursor인 이유: 아래(더 밑에) config.cursor가 이미 있는데, 그건
  //   완전히 다른 것이다(copier 안착 시 뿌리는 "가짜 커서 떼"의 개수·배치 설정,
  //   fakeCursorCount 등) — 둘 다 "cursor"라 부르고 싶었지만 같은 이름을 쓰면
  //   객체 리터럴에서 뒤에 나온 쪽이 앞을 조용히 덮어써 버린다(실제로 처음엔
  //   그렇게 짰다가 이 블록이 통째로 사라진 걸 실측으로 잡았다 — 커서가 계속
  //   OS 기본 화살표로 나와서 config.cursor를 찍어보니 fakeCursorCount 객체가
  //   나왔다). 그래서 "진짜 마우스 커서"는 이름 자체를 다르게 뗐다.
  mouseCursor: {
    url: './assets/cursor/cursor-44.png',
    // ★ hotspot(클릭이 실제로 찍히는 화소) — CSS는 `cursor: url(...) X Y, auto`에서
    //   이 X,Y를 그대로 "이미지 안에서 몇 번째 픽셀이 커서 좌표냐"로 쓴다. 틀리면
    //   화면에 보이는 촉끝과 실제 클릭 지점이 어긋나는, 눈에는 안 보이고 "왜
    //   안 눌리지"로만 나타나는 판정 버그가 된다(이 프로젝트가 반복해서 겪은
    //   "그리기와 판정이 다른 좌표" 부류와 같은 함정). cursor-44.png의 화살표
    //   촉끝을 알파 채널로 직접 스캔해서 잰 실측값이다(그림을 갈아끼우면 다시
    //   재야 한다 — config.enemy.artHitbox 주석과 같은 원칙).
    hotspotX: 7,
    hotspotY: 1,
  },

  // 구간(스테이지) 자동 상승 공식의 상수. 실제 정의와 상세 주석은
  // balance/progression.js에 있다(순환참조를 피하려고 잎 모듈로 뺐다).
  // 바깥에서는 지금처럼 config.progression 으로 그대로 읽으면 된다.
  progression: PROGRESSION,

  // HUD는 캔버스에서 HTML 창(ui/statusWindow.js)으로 옮겨갔다.
  // 레이아웃 숫자는 전부 style.css로 갔고, 여기엔 게임 로직이 읽는 값만 남는다.
  hud: {
    // ★ 2026-08-22: 여기 있던 "피해 피드백"이 오래전부터 절반만 구현돼 있었다.
    //   systems/upload.js가 state.hitFlash를 넣긴 했는데 그걸 실제로 그리는 코드가
    //   어디에도 없어서(주석만 있고 소비하는 곳 없음), 방해꾼한테 얻어맞아도 화면에
    //   아무 티가 안 났다("뭘 당했는지 모름"의 원인). 이번에 진짜로 잇는다.
    //   전부 systems/upload.js의 triggerHitFeedback() 한 곳에서 건다 — 주기 공격
    //   (dps)·즉발 피해(bomb 수명만료·fake_btn 오클릭)·다음 파일 예약 피해(hidden)가
    //   전부 같은 함수를 거치므로, 종류마다 따로 챙길 필요가 없다.

    // 업로드 창(.up)이 빨갛게 번쩍이는 시간(초).
    hitFlashSec: 0.25,
    // 화면 가장자리 빨간 비네트가 펄스처럼 뜨는 시간(초). 짧게 — 계속 떠 있으면
    // 다음에 또 맞았을 때 "또 맞았다"가 안 느껴진다.
    vignettePulseSec: 0.4,
    vignetteMaxOpacity: 0.5,
    // "-20%" 같은 피해 수치가 업로드 바 옆에 떴다 사라지는 시간(ms).
    dmgFloatMs: 900,
    // 깎이기 직전 값이 빨간 "손실분"으로 바에 잠깐 남아있다 사라지는 시간(ms).
    // 있으면 "얼마나 깎였는지"가 눈에 보이고, 그냥 순간이동하듯 줄면 깎인 양이
    // 감이 안 잡힌다.
    barGhostMs: 550,
    // ★ blockHighlightHz(원인 방해꾼 빨간 대시 테두리 깜빡임 속도)를 없앴다 —
    //   테두리 자체를 걷어냈다(ui/renderEnemies.js 주석 참고).
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

    // A타입(stops_upload)이 스폰된 뒤 실제로 업로드를 멈추기까지의 유예(초).
    // 0으로 두면 예전처럼 나오자마자 즉시 정지한다.
    //
    // 왜 필요한가 — unplug는 화면 밖에서 날아 들어와 멈추는 놈인데(move_pattern
    // "화면밖→안 진입후 정지"), 유예가 없으면 아직 날아오는 도중에 이미 업로드가
    // 멈춰 있다. 플레이어 입장에선 "뭐가 왔는지 보기도 전에 멈춰버린" 셈이라
    // 대응할 여지가 없다. 유예를 두면 등장을 눈으로 확인하고, 그 안에 처치하면
    // 정지를 아예 안 맞는 선택지가 생긴다.
    //
    // ★ 기준 시계는 enemy.age(스폰 후 흐른 초)라 "등장 연출/진입 이동 포함"이다 —
    //   이 프로젝트가 별도 타이머 없이 단일 시계만 쓰는 원칙(enemies/entrance.js
    //   상단 주석)과 같다. 유예 중에 처치하면 그 놈은 배열에서 빠지므로 정지가
    //   안 걸린다 — systems/upload.js가 매 프레임 살아있는 놈만 다시 세기 때문에
    //   별도 취소 처리가 필요 없다.
    blockDelaySec: 1,

    // clone(복제 바이러스)이 구간에 따라 몇 단계까지 분열하는가.
    // 시트의 special_effect("대100→중70x2→소50x4")는 그대로 3단계(빅→미드→스몰)를
    // 정의하지만, 초반 구간엔 그 끝(스몰 4마리)까지 다 쪼개지면 손이 너무 많이
    // 간다 — 여기서 "이 구간에서 갈 수 있는 가장 깊은 tier"를 따로 제한한다
    // (tier는 0부터: 0=빅, 1=미드, 2=스몰 — enemies/effects.js의 splitEnemy 참고).
    //
    // combo.tiers(config.combo)와 같은 표 문법이다 — stage(0부터) 오름차순으로
    // 두고, "stageIndex >= stage"를 만족하는 **마지막** 칸이 이긴다.
    //   0~1구간(n=0,1): maxTier 1 → 빅→미드까지만. 미드는 안 죽고 그냥 죽는다.
    //   2구간부터(n>=2, "3구간"): maxTier 2 → 시트 그대로 스몰까지 끝까지.
    cloneSplitMaxTierByStage: [
      { stage: 0, maxTier: 1 },
      { stage: 2, maxTier: 2 },
    ],

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
      // fake_btn: 함정 "확인" 버튼(2프레임 합집합). 이걸 눌러야 벌칙이 터진다.
      // 2026-08-22 그림 교체(512x512, sprite/animator.js 주석 참고) 후 재실측 —
      // 초록 픽셀을 직접 스캔해서 두 프레임 각각의 bbox를 구하고 합집합을 썼다
      // (fake_btn_1: 161,281~307,365 / fake_btn_2: 156,286~309,366).
      fake_btn: { l: 156 / 512, t: 281 / 512, r: 309 / 512, b: 366 / 512 },
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

    // 종류별 동시 등장 상한(enemies/spawner.js의 filterByConcurrencyCap). 표에 없는
    // 종류는 무제한(기존과 동일) — copier(가짜 커서로 혼란을 주는 추격형)만 한 번에
    // 하나로 막는다. 여러 마리가 동시에 커서를 쫓아오면 "어느 게 진짜지"보다
    // "화면이 어지럽다"가 앞서서 원래 노린 압박감이 아니라 그냥 짜증이 된다.
    maxConcurrentById: { copier: 1 },
    // 몸통(= X 버튼이 아닌 곳)을 잘못 눌렀을 때 흔들리는 시간(초).
    bodyShakeSec: 0.25,
    // 그 흔들림의 폭(px).
    bodyShakeAmount: 6,

    // 처치 순간의 타격감. "손맛 있되 정신없지 않은" 선을 노린 값들이라,
    // 세게/약하게는 여기 숫자만 만지면 된다(systems/juice.js가 전부 읽어 쓴다).
    kill: {
      // 화면이 아주 잠깐 얼어붙는다 — 타격감의 8할이 여기서 나온다. 너무 길면
      // 연타할 때 조작이 끊긴 것처럼 답답해진다.
      hitStopMs: 45,
      // 죽은 스프라이트가 부풀며 사라지는 시간(초)과 최대 배율.
      popSec: 0.16,
      popScale: 1.55,
      // 죽은 직후 스프라이트가 새하얗게 번쩍이는 시간(초). 1~2프레임 분량.
      whiteFlashSec: 0.05,
      // 사방으로 튀는 조각. 개수는 넉넉히, 수명은 짧게 — 길면 화면이 지저분해진다.
      // ★ 확산 거리가 스프라이트 폭보다 작으면 "터졌다"가 아니라 "묻어난다"로 보인다.
      //   해석적으로 계산한 이동거리 = v0/drag * (1 - e^(-drag*life)).
      //   처음 값(속도 260, 항력 2.2)은 basic 기준 46.7px = 스프라이트 폭의 0.69배라
      //   덩어리진 채로 사라졌다(실측 스샷으로 확인) → 폭의 1.3배쯤으로 올렸다.
      particleCount: 16,
      particleSpeed: 430, // 초기 속도(px/s, 기준 해상도)
      particleSpeedJitter: 0.55, // 속도가 이 비율만큼 조각마다 들쭉날쭉해진다
      particleLifeSec: 0.34,
      particleSize: 7, // 조각 한 변(px, 기준 해상도)
      particleGravity: 900, // 아래로 끌리는 가속도(px/s^2) — 살짝 있어야 튄 느낌이 산다
      particleDrag: 1.8, // 공기저항(1/s). 클수록 빨리 느려진다
      // 처치 때 화면이 살짝 흔들린다. 과하면 연타할 때 멀미 나므로 작게.
      shakePx: 3.5,
      shakeMs: 130,
    },

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

  // 방해꾼이 너무 많아졌을 때 화면 전체가 지지직거리는 과부하 연출(systems/overload.js).
  // "지금 감당이 안 되고 있다"를 숫자(살아있음 n/m)가 아니라 화면 자체로 알리는 장치다.
  overload: {
    // ★ 2026-08-22: 동시 최대(rules.maxAlive) 대비 "비율"이 아니라 마릿수 "고정값"으로
    //   바꿨다 — 판마다 maxAlive가 달라지면 "몇 마리부터 지지직거리나"가 판마다
    //   달라 예측이 안 됐다. 이제 살아있는 방해꾼이 8마리를 넘으면 무조건 시작이다.
    startCount: 8,
    // 이 마릿수에서 강도가 최대(1)가 된다. startCount~fullCount 사이는 비례해서
    // 올라간다(마리수 비례 증가는 유지).
    fullCount: 12,
    // 최대 강도일 때의 값들. 강도가 낮으면 전부 비례해서 약해지고, 임계 밑으로
    // 내려가면 0이 되어 완전히 사라진다.
    // 2026-08-22: 한 단계 세게 — opacity 0.42→0.55, 색수차 9→12px, 떨림 2.4→3.2px.
    maxOpacity: 0.55, // 지지직 오버레이 전체 불투명도
    maxSplitPx: 12, // 빨강/시안 주사선이 좌우로 어긋나는 최대 거리(색수차)
    maxJitterPx: 3.2, // 화면(그리기 원점)이 미세하게 떠는 폭
    jitterHz: 19, // 그 떨림의 진동수
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

  // === 콤보 (systems/combo.js) ===
  // "정확하게 연속으로 잡는 실력"을 보상하는 장치. 콤보 자체는 점수가 아니라
  // **처치 MB 배율**로만 쓰인다 — 잡을 때마다 killMb를 주고, 콤보가 높을수록
  // 그 MB에 곱하는 배율이 커진다. 그래서 콤보를 잘 쓰면 할당량이 빨리 차고,
  // 못 써도 파일 업로드만으로 판이 굴러간다(콤보는 가속기지 필수품이 아니다).
  combo: {
    // 방해꾼 하나를 클릭으로 잡을 때마다 주는 기본 용량(MB). 여기에 아래
    // 배율이 곱해진다. 한 판(180초)에 100~150마리쯤 잡히므로, 평균 배율
    // 1.3을 잡으면 구간당 대략 +40~60MB가 콤보에서 나온다는 계산이다
    // — 할당량 상승 곡선(balance/progression.js)이 이 보조를 전제로 잡혀 있다.
    killMb: 0.3,

    // 콤보 → MB 배율 계단 + 화면 표시(크기/색). "combo가 min 이상이면 이 칸"이고,
    // 조건을 만족하는 **마지막** 칸이 이긴다(systems/combo.js의 comboMultiplier/
    // comboVisual) — 그래서 표를 min 오름차순으로 유지해야 한다. 마지막 칸이 곧
    // 상한이라 mult가 무한히 커지지 않는다. size/color는 "콤보가 오를수록 강조"
    // 요구사항 그대로 계단마다 커지고 뜨거운 색(흰→노랑→주황→빨강)으로 옮겨간다.
    //   0~4 → x1.0 / 5~9 → x1.2 / 10~19 → x1.35 / 20+ → x1.5(상한)
    tiers: [
      { min: 0, mult: 1, size: 26, color: '#ffffff' },
      { min: 5, mult: 1.2, size: 30, color: '#ffd966' },
      { min: 10, mult: 1.35, size: 34, color: '#ff9a3f' },
      { min: 20, mult: 1.5, size: 40, color: '#ff4d4d' },
    ],

    // 콤보 카운터를 화면에 띄우기 시작하는 값. 1부터 띄우면 잡을 때마다
    // "COMBO x1"이 깜빡여서 오히려 시끄럽다 — 실제로 "이어지고 있다"가
    // 성립하는 2부터 보여준다. ★ 0/1일 땐 draw 자체를 안 한다(ui/renderEnemies.js의
    // drawCombo) — "COMBO x0"·"x1" 같은 무의미한 표시는 절대 안 뜬다.
    showFrom: 2,

    // 커서 위쪽으로 이만큼(px, 캔버스 좌표) 띄워서 따라다닌다 — 커서 자체를
    // 안 가리려는 여백. 두 줄(라벨+숫자)을 그리므로 숫자 줄 기준 오프셋이다.
    followOffsetY: 46,

    // 잡을 때마다 살짝 커졌다 가라앉는 "팝" 연출이 남아있는 시간(ms).
    popMs: 150,
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

  // .exe 창 안에 "업데이트 중"인 그림(systems/filePicture.js가 고르고,
  // ui/uploadPicture.js가 그린다). 등급별 폴더(assets/files/<tier>/)에서 랜덤
  // 1장을 골라, 진행률에 따라 모자이크(픽셀화)에서 원본으로 점점 선명해진다.
  filePicture: {
    // 그림 폴더 경로(등급 하위폴더가 온다: small/medium/large).
    dir: './assets/files/',
    // 각 등급 폴더에 들어있는 그림 수. 파일명은 char_s_01.png ~ char_s_12.png
    // 식으로 2자리 번호가 붙는다(다른 등급은 s 자리에 m/l) — 폴더에 그림을
    // 더 채우면 이 숫자만 올리면 된다(assets/files/ 안에서 실제 개수와 맞아야
    // 한다 — 브라우저는 폴더 목록을 직접 못 읽으므로 여기 숫자가 진짜 개수와
    // 다르면 없는 파일을 골라 404가 난다).
    countPerTier: 12,

    // 그림을 그리는 정사각 캔버스의 내부 해상도(px). style.css의 .frame .img
    // 박스 크기(540px)와 맞춰뒀다 — 다르면 최종 확대/축소 한 번이 더 끼어들어
    // 모자이크 계단이 우리가 그린 것보다 살짝 더/덜 흐려질 수 있다.
    canvasPx: 540,

    // 0%→100% 사이를 이만큼 계단으로 나눠 블록 크기를 스냅한다(매끈한 연속
    // 축소 대신 또렷한 단계감 — 회복되고 있다는 느낌을 부러 끊어 보여준다).
    // 계단이 바뀔 때만 다시 그리므로(같은 계단이면 재사용) 그 사이 프레임은
    // 공짜다.
    steps: 12,
    // 0% 진입 시 블록 한 변(px, canvasPx 기준) — 클수록 초반에 더 뭉갠다.
    maxBlockPx: 48,
    // 마지막 계단(≈100%)에서의 블록 한 변(px). 1이면 사실상 모자이크 없이
    // 원본을 그대로 그린다(코드도 그렇게 분기한다 — updateUploadPicture 참고).
    minBlockPx: 1,
  },

  // 파일(그림) 100% 완성 순간의 "해냈다" 연출. 화질복구(filePicture 위)가 원본에
  // 도달한 그림을 이 시간만큼 붙잡아 보여준 뒤에야 다음 파일로 넘어간다
  // (systems/upload.js) — 안 그러면 100%를 찍는 그 프레임에 곧장 다음 파일
  // 그림으로 바뀌어버려 방금 복구된 원본을 볼 틈이 없었다(사용자가 지적한
  // "완성 티가 안 남"의 원인).
  fileComplete: {
    // 다음 파일로 넘어가기 전 붙잡아두는 시간(ms). 라벨(labelMs)이 다 사라질
    // 때쯤 넘어가는 게 자연스러워 보통 labelMs와 비슷하거나 살짝 길게 잡는다.
    holdMs: 900,
    // 그림 위 흰 번쩍임 지속시간(ms). 너무 길면 그림이 안 보이는 시간이 길어져
    // 오히려 "완성된 그림을 보여준다"는 목적과 어긋난다 — 짧게.
    flashMs: 260,
    // 그림이 살짝 커졌다 돌아오는 팝 애니 지속시간(ms).
    popMs: 500,
    popScale: 1.08,
    // "완료!" 라벨이 튀어나왔다 사라지는 지속시간(ms).
    labelMs: 900,
    labelText: '완료!',
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
    // 이 플래그 하나로 디버그 패널이 완전히 켜지고 꺼진다(D키로 여닫기,
    // 구간점프, 밸런스 슬라이더, 콤보MB 통계 줄 — game/js/debug.js 전부).
    // `npm run build`가 그냥 game/을 dist/로 복사하는 것뿐이라(package.json
    // 참고) 여기 값이 곧 배포본 값이다 — dev/prod를 가르는 별도 빌드 모드가 없다.
    //
    // ★★★ TEMP (2026-08-22): 협업자가 배포본(Verse8 임베드)에서 밸런스를
    //   확인해야 해서 임시로 true — 배포본에서도 디버그가 보인다. ★★★
    //   ★★★ 출시(진짜 최종 배포) 전에 반드시 false로 되돌릴 것. ★★★
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

    // === 상시 CRT 오버레이(레이어9, playing 내내) — 위 durationMs/shakeAmpPx(전환
    // "킥")와는 별개다. ui/crtTransition.js의 applyCrtSteadyVars()가 아래
    // intensityPresets[intensity]의 값들을 --crt-* CSS 변수로 흘려보내고,
    // 실제 그림은 style.css(.layer-crt-steady)가 그린다.
    //
    // ★ enabled/intensity 둘 다 "지금 켜진 실시간 값"이다 — ui/settingsPanel.js가
    //   설정 팝업의 체크박스/라디오에서 이 값을 직접 고치고, 고칠 때마다
    //   applyCrtSteadyVars()를 다시 불러 바로 반영한다(debug.js가 슬라이더로
    //   rules를 직접 덮어쓰는 것과 같은 패턴). 기본값 복원(설정 팝업의
    //   "기본값 복원")은 이 둘을 true/'mid'로 되돌린다.
    enabled: true,
    intensity: 'mid', // 'weak' | 'mid' | 'strong' — 아래 intensityPresets의 키

    // 강도별 프리셋. mid가 예전부터 쓰던 "중(권장)" 세팅 그 숫자 그대로다 —
    // 설정을 한 번도 안 건드린 사람은 화면이 예전과 똑같아야 한다.
    intensityPresets: {
      weak: {
        scanlineOpacity: 0.12, scanlineGapPx: 4,
        vignettePx: 60, vignetteOpacity: 0.22,
        curveRadiusPx: 20,
        bloomSaturate: 1.1, bloomContrast: 1.03, bloomBrightness: 1.02,
      },
      mid: {
        scanlineOpacity: 0.22, scanlineGapPx: 3,
        vignettePx: 90, vignetteOpacity: 0.4,
        curveRadiusPx: 28,
        bloomSaturate: 1.25, bloomContrast: 1.08, bloomBrightness: 1.04,
      },
      strong: {
        scanlineOpacity: 0.34, scanlineGapPx: 2,
        vignettePx: 130, vignetteOpacity: 0.55,
        curveRadiusPx: 34,
        bloomSaturate: 1.45, bloomContrast: 1.14, bloomBrightness: 1.07,
      },
    },

    // 깜빡임/롤링바 — 기본 꺼짐. 설정 팝업에도 없는 항목이라(요구사항 3개
    // 항목 밖) 여전히 이 값으로만 켠다.
    flickerEnabled: false,
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
