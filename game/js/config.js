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

    // === popup 같은 "X 버튼으로 닫기"형 방해꾼 ===
    // X 버튼 히트박스 한 변 길이(px). 그려진 X 아이콘보다 넉넉하게 크게 잡는다
    // (시트의 hit_w/hit_h와 무관 — 그건 이제 이 타입에서 안 쓰인다).
    closeButtonSize: 44,
    // X 아이콘의 실제 중심 위치 — 스프라이트 중심(x,y) 대비 비율(size_w/size_h에 곱함).
    // popup.png는 260x180 캔버스 전체를 안 채우고 안쪽에 여백을 두고 그려져 있어서
    // (창 자체가 캔버스보다 작다), 우상단 "모서리"가 아니라 실제로 그려진 X 위치를
    // 픽셀을 재서 넣었다. popup 아트를 다시 그리면 이 값도 다시 재야 한다.
    closeButtonOffsetXRatio: 0.225,
    closeButtonOffsetYRatio: -0.2917,
    // 몸통(= X 버튼이 아닌 곳)을 잘못 눌렀을 때 흔들리는 시간(초).
    bodyShakeSec: 0.25,
    // 그 흔들림의 폭(px).
    bodyShakeAmount: 6,
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
  // 저화질→고화질로 화질이 복구되는 광고 배너 연출. 다른 방해꾼과 완전히
  // 분리된 상태기계(enemies/bait.js)와 그리기(ui/baitRender.js)를 쓴다.
  bait: {
    // 화질이 완전히 복구되는 데 걸리는 시간(초). 키우면 더 오래 뭉개져 보인다.
    revealSec: 2.5,
    // 모서리 밖에서 안으로 들어오는/나갈 때 걸리는 슬라이드 시간(초).
    slideSec: 0.4,
    // 화면 가장자리에서 이만큼(px, 기준 해상도) 안쪽에 자리를 잡는다.
    insetX: 140,
    insetY: 120,
    // 저화질 버전을 원본 대비 이 배율로 축소해서 뭉갠다. 작을수록 더 뭉개진다.
    lowResScale: 0.12,
    // 복구 경계선이 지지직 밝게 빛나는 띠의 두께(px, 기준 해상도).
    scanGlitchHeight: 6,
  },

  debug: {
    // 이 플래그 하나로 디버그 패널이 완전히 켜지고 꺼진다.
    // 지금은 밸런스 테스트용 프로토라 true. 배포 빌드에서는 false로 둔다.
    enabled: true,
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
