// 이 파일 역할: 업로드할 파일의 지급/완료/스킵. 파일 크기·시간은 stage 시트에서 온다.

import { config, getFileTiers } from '../config.js';
import { state } from '../core/state.js';
import { addFloat } from './floats.js';
import { pickFilePicture } from './filePicture.js';
import { playSfx, SFX } from './sound.js';

/**
 * "+60MB" 같은 뜬 글씨를 띄울 자리. 화면 가로 중앙, 세로는 위쪽 1/4쯤.
 * (HUD가 HTML 창으로 옮겨가서 캔버스 위쪽을 비워둘 이유가 없어졌다)
 */
function playAreaCenterTop() {
  return {
    x: config.canvas.width / 2,
    y: config.canvas.height * config.fx.floatTopRatio,
  };
}

/** 다음 파일을 랜덤으로 하나 받는다. hidden이 남긴 빚이 있으면 여기서 갚는다. */
export function grantFile() {
  const tiers = getFileTiers();
  const tier = tiers[Math.floor(Math.random() * tiers.length)];

  let sizeMb = tier.sizeMb;
  if (state.nextFilePenaltyMb > 0) {
    // 시간은 그대로인데 용량만 깎인다 = 같은 수고에 보상이 준다
    sizeMb = Math.max(5, sizeMb - state.nextFilePenaltyMb);
    const at = playAreaCenterTop();
    addFloat(`파일 -${state.nextFilePenaltyMb}MB`, at.x, at.y, false);
    state.nextFilePenaltyMb = 0;
  }

  const prevPictureSrc = state.file?.pictureSrc ?? null;

  const file = {
    label: tier.label,
    tierKey: tier.key,
    sizeMb,
    timeSec: tier.timeSec,
    progress: 0,
    // 그림은 아래에서 비동기로 채운다 — 로드가 끝나기 전엔 null이라
    // ui/uploadPicture.js가 빈 채로(체커보드 플레이스홀더만) 둔다. 진행바는
    // 그림 로딩을 안 기다린다.
    pictureSrc: null,
    pictureImg: null,
  };
  state.file = file;

  // ★ 손실 잔상(fileBarGhostRatio/Ms)은 "지금 파일"의 진행률 기준 잔상이다 —
  // 새 파일이 시작되는 이 순간까지 안 지우면, 직전 파일이 거의 다 찬 상태에서
  // (예: 95%) 완료 직전에 큰 손실을 입어 잔상이 막 켜진 경우, 그 잔상 비율이
  // 새 파일(진행률 0%부터 시작)에 그대로 이어져 "새 파일이 시작하자마자 바
  // 전체가 빨갛다"로 보인다(실측 스샷으로 확인 — 방금 완료한 파일과 아무
  // 상관없는 새 파일이 거의 통째로 빨갛게 뜬다). 새 파일은 아직 아무 것도
  // 안 깎였으니 잔상이 있을 이유가 없다.
  state.fileBarGhostRatio = 0;
  state.fileBarGhostMs = 0;

  pickFilePicture(tier.key, prevPictureSrc).then(({ src, img }) => {
    // 로드되는 동안 파일이 또 넘어갔으면(스킵 연타 등) state.file은 이미 다른
    // 객체다 — 그때는 이 낡은 결과를 버린다(참조 비교라 tier가 우연히 같아도
    // 안전하다).
    if (state.file !== file) return;
    file.pictureSrc = src;
    file.pictureImg = img;
  });
}

export function completeFile() {
  const file = state.file;
  playSfx(SFX.COMPLETE);
  state.uploaded += file.sizeMb;
  state.reward += file.sizeMb;
  state.stats.filesDone += 1;

  const at = playAreaCenterTop();
  addFloat(`+${file.sizeMb}MB`, at.x, at.y, true);

  // ★ grantFile()을 여기서 바로 안 부른다 — 화질복구가 막 원본에 도달한 그림을
  // config.fileComplete.holdMs만큼 붙잡아 "완료!" 연출(반짝+팝+라벨, ui/uploadPicture.js)로
  // 주목시킨 뒤에야 다음 파일로 넘어간다. holdMs가 다 되면 systems/upload.js의
  // updateUpload()가 grantFile()을 부른다 — 예전엔 100%를 찍는 그 프레임에
  // 곧장 다음 파일 그림으로 바뀌어버려서 방금 복구된 원본을 볼 틈이 없었다.
  state.fileCompleteHoldMs = config.fileComplete.holdMs;
  state.fileCompleteSeq += 1;
}

/** S키. 지금 파일을 버리고 새로 받는다(진행도는 0부터). 하루 skip_limit 회. */
export function skipFile() {
  if (state.phase !== 'playing' || state.skipsLeft <= 0) return;
  state.skipsLeft -= 1;
  playSfx(SFX.SKIP);

  const at = playAreaCenterTop();
  addFloat('스킵!', at.x, at.y, false);
  grantFile();
}
