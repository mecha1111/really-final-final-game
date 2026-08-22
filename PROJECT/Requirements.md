# Requirements — 진짜_최종_final_수정_진짜최종

> 실제 게임은 `game/`의 바닐라 JS(Canvas 2D)다. 옛 Phaser 스캐폴드(src/)는 사용되지 않는다.

## Coding Patterns (게임 코드)

- 게임은 `game/js/main.js`가 진입점. 밸런스는 `game/balance.csv`(시트)에서 온다.
- 엔진 상수/설정은 `game/js/config.js`에, 런타임 상태는 `game/js/core/state.js` 단일 객체에.
- 시계는 rAF/`dt` 단일 흐름. 별도 `setInterval`/`setTimeout` 금지(사운드도 "지금 당장"만).

## SFX 패턴

- 효과음은 `game/assets/sfx/*.mp3`. `sound.js`가 `./assets/sfx/`에서 프리로드.
- 새 효과음을 추가하려면: (1) `systems/sound.js`의 `SFX` 맵에 상수 추가, (2) 같은 이름의 `.mp3` 저장, (3) 호출 지점에서 `playSfx(SFX.XXX)`.
- **변주**: `sound.js`의 `VARIANT_COUNTS`에 `[SFX.X]: N`을 넣으면 `sfx_X_1.mp3`~`sfx_X_N.mp3` 풀에서 무작위 재생. 단일 파일 소리는 생략.
- `playSfx(name, { ui, varyCents, detune })` — `ui:true`=일시정지 중에도 재생, `varyCents`=연타 무작위 피치 흩음, `detune`=고정 피치 오프셋(콤보 음정 상승 등).
- 소리별 상대 볼륨은 `sound.js`의 `SFX_GAIN` 맵. 최종 볼륨 = masterGain(마스터×효과음 슬라이더) × SFX_GAIN.
- **톤 원칙(유지)**: 방해꾼=하찮은 카툰/장난감 소리, 시스템/UI/게임상태=Windows XP 계열 레트로음. 밈 포인트(부팅/로그온/BSOD) 유지.
- **레이어링 원칙**: 전용 소리가 있는 이벤트에는 공통음을 얹지 않는다(공통 피격음 HIT는 `triggerHitFeedback(text, {silent:true})`로 끈다). 같은 순간 3겹 이상은 피한다.
- **다단계(hp>1) 타격**: `Enemy.takeHit()`이 중간 타격에 균열음(남은 hp 기준), 최종타는 `Enemy.kill()`이 KILL_HARD.

## Known Issues / Constraints

- SFX는 mp3로만 저장(Web Audio `decodeAudioData` — Safari는 OGG Vorbis 디코드를 지원하지 않음).
- `state.settings.soundBgm`은 슬라이더 값만 보관 중 — BGM은 미구현(현재 SFX 전용).
- `config.debug.enabled`가 true(협업자 배포본 밸런스 확인용 임시). 출시 전 false 필수.
- 배포 빌드는 `bun run build`(`cp -R game dist`) — 별도 번들/타입체크 없음. 문법 검증은 `node --check`/`bun build`로 수동.
