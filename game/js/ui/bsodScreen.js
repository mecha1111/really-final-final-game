// 이 파일 역할: 실패 화면(BSOD, .layer-bsod) — 수치 채우기(매 프레임, failed일 때만)와
// 버튼 3개(재도전/로비/나가기) 클릭 훅. ui/titleScreen.js와 같은 패턴이다.

import { state } from '../core/state.js';
import { startGame } from '../core/stageManager.js';
import { playSfx, SFX } from '../systems/sound.js';

const last = {};
function setText(el, value) {
  if (!el) return;
  const s = String(value);
  if (last[el.id] === s) return;
  last[el.id] = s;
  el.textContent = s;
}

/**
 * 실패마다 하나씩 랜덤으로 보여줄 꿀팁. 방해꾼 10종 + 시스템/전략 팁.
 * ★ 문구의 수치·동작은 전부 실제 구현과 맞춰뒀다 — 여기 숫자를 시트/config에서
 *   바꾸면 이 문구도 같이 손볼 것(그렇지 않으면 "틀린 꿀팁"이 나간다):
 *     ransom hp=3(시트), bomb 수명만료 -20%(시트 special_effect),
 *     unplug blockDelaySec=1(config.enemy), fake_btn 오클릭 -10%(시트),
 *     clone cloneSplitMaxTierByStage(config.enemy, 3구간=n>=2부터 스몰까지),
 *     copier maxConcurrentById=1(config.enemy), hidden 수명만료 -15MB(시트),
 *     bait는 hit_w/h=0이라 클릭 무반응+콤보 끊김(systems/combo.js),
 *     combo.tiers 최대 배율 1.5(config.combo), skip_limit=3(시트).
 */
const TIPS = [
  // 방해꾼별
  '기본 잡몹은 빠르게 처치할수록 콤보가 쌓여요.',
  '자물쇠는 여러 번 쳐야 깨집니다. 끈질기게 노리세요!',
  '폭탄은 시간이 지나면 터져 -20%! 보이는 즉시 우선 처치하세요.',
  '콘센트 손이 나오면 곧 업데이트가 멈춰요. 1초 안에 처치하면 안 멈춥니다!',
  '팝업 광고는 X 버튼을 정확히 눌러야 닫혀요.',
  "'확인' 버튼은 함정! 커서를 따라오니 실수로 누르지 마세요. -10%.",
  '복제 바이러스는 처치하면 분열해요. 3구간부턴 스몰까지 더 잘게!',
  '복사기는 한 번에 하나만 나와요. 나타나면 빠르게 지우세요.',
  '숨어있는 방해꾼도 놓치지 마세요. 못 잡으면 다음 파일 -15MB!',
  '시선강탈은 눌러도 안 죽어요. 무시하고 진짜를 노리세요 — 낚이면 콤보가 끊깁니다.',
  // 시스템/전략
  '콤보를 유지하면 처치당 업데이트 MB가 최대 1.5배!',
  '허공을 클릭하면 콤보가 끊겨요. 정확하게 노리세요.',
  '건너뛰기(S)는 하루 3번뿐이에요. 아껴서 쓰세요.',
  '구간이 올라갈수록 할당량과 방해꾼이 늘어납니다.',
];

// 지난 프레임에 failed였는지 — "이번에 새로 실패 화면에 들어왔다"를 판별해서
// 그때 딱 한 번만 팁을 새로 고른다(ui/crtTransition.js의 prevPhase와 같은
// idiom인데, 이 파일은 아래 updateBsodScreen()이 failed가 아니면 곧장
// return해버려서 그 함수 안에서만 상태를 추적하면 phase가 실패 아닌 값으로
// "바뀌었다"를 볼 기회가 없다 — 그래서 여기서는 "이번 프레임이 failed가
// 아니면 리셋"하는 방향으로 뒤집어서 같은 효과를 낸다).
let wasFailed = false;

/** 최초 1회. 버튼 3개에 핸들러를 붙인다. */
export function initBsodScreen() {
  // 재도전 — "현 실패규칙대로 n=0 리셋". 이 프로젝트엔 판을 넘어 남는 영구강화
  // 시스템이 아직 없다(state 전체가 startGame()에서 매번 새로 만들어진다) — 그래서
  // "영구강화 보존"은 지금은 자명하게 참이다(애초에 지워질 영구 상태가 없다).
  // 나중에 그런 시스템이 생기면 여기서 그 부분만 안 건드리게 손봐야 한다.
  document.getElementById('bsod-retry')?.addEventListener('click', () => {
    playSfx(SFX.UI_CLICK, { ui: true });
    startGame(0);
  });

  // 로비 — 타이틀로. startGame()을 거치지 않고 phase만 바로 바꾼다(최초 부팅 때
  // main.js의 applyLoadedData()가 'loading' → 'title'로 착지시키는 것과 같은 방식).
  document.getElementById('bsod-lobby')?.addEventListener('click', () => {
    playSfx(SFX.UI_CLICK, { ui: true });
    state.phase = 'title';
  });

  // 나가기 — Verse8 iframe 배포본에서는 window.close()가 무효다(스크립트가 열지
  // 않은 창은 못 닫는다). 종료 프로토콜을 새로 만들지 않고, 타이틀의 "나가기"와
  // 같은 톤으로 로비로 보낸다(배포 맥락에서 "나가기"가 할 수 있는 가장 정직한 동작).
  document.getElementById('bsod-quit')?.addEventListener('click', () => {
    playSfx(SFX.UI_CLICK, { ui: true });
    state.phase = 'title';
  });
}

/** 매 프레임 호출. failed가 아니면 건너뛴다(창이 숨겨져 있으므로).
 * ★ 파라미터를 안 받고 위에서 import한 state를 그대로 쓴다 — initBsodScreen()의
 *   버튼 핸들러도 같은 import를 쓰므로, 굳이 매 프레임 파라미터로 다시 넘겨받아
 *   지역에서 같은 이름을 가리는 것보다 이쪽이 더 명확하다. */
export function updateBsodScreen() {
  if (state.phase !== 'failed') {
    wasFailed = false; // 다음 실패 진입 때 새로 고를 수 있게 리셋
    return;
  }
  if (!state.rules) return;

  if (!wasFailed) {
    wasFailed = true;
    // 방금 이 실패 화면에 들어온 첫 프레임 — 이번 실패에 보여줄 팁을 하나 고른다.
    // 이후 프레임들은 wasFailed가 이미 true라 다시 안 뽑는다(매 프레임 계속
    // 바뀌면 눈이 어지럽다 — "실패마다 랜덤 1개" 요구사항).
    const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
    setText(document.getElementById('bsod-tip-text'), tip);
  }

  setText(document.getElementById('bsod-progress'), Math.floor(state.uploaded));
  setText(document.getElementById('bsod-quota'), state.rules.quota);

  const s = state.stats;
  const acc = s.clicks > 0 ? Math.round((s.hits / s.clicks) * 100) : 0;
  setText(document.getElementById('bsod-stats'), `완료 파일 ${s.filesDone} · 제거 ${s.killed} · 정확도 ${acc}%`);
}
