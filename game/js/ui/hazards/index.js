// 이 파일 역할: 환경 방해 정의들을 등록표(systems/hazard.js)에 올리는 단 하나의
// 진입점. 여기 import 한 줄이 곧 "이 방해를 게임에 넣는다"는 뜻이다 — 각 모듈은
// 로드되는 순간 registerHazard()를 부르는 부수효과 모듈이라 여기서 이름을 안 받는다.
//
// main.js는 이 파일 하나만 import한다. 새 방해가 늘어도 main.js는 안 건드린다.

import './reboot.js';
import './screensaver.js';
import './powersave.js';
import './driver.js';
import './cracked.js';
import './portrait.js';
