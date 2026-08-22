// 이 파일 역할: 업로드할 파일의 지급/완료/스킵. 파일 크기·시간은 stage 시트에서 온다.

import { config, getFileTiers } from '../config.js';
import { state } from '../core/state.js';
import { addFloat } from './floats.js';
import { pickFilePicture } from './filePicture.js';

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
  state.uploaded += file.sizeMb;
  state.reward += file.sizeMb;
  state.stats.filesDone += 1;

  const at = playAreaCenterTop();
  addFloat(`+${file.sizeMb}MB`, at.x, at.y, true);

  grantFile();
}

/** S키. 지금 파일을 버리고 새로 받는다(진행도는 0부터). 하루 skip_limit 회. */
export function skipFile() {
  if (state.phase !== 'playing' || state.skipsLeft <= 0) return;
  state.skipsLeft -= 1;

  const at = playAreaCenterTop();
  addFloat('스킵!', at.x, at.y, false);
  grantFile();
}
