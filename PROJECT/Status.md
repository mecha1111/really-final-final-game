# Status — 진짜_최종_final_수정_진짜최종

> ⚠️ 이전 문서(2d-phaser-basic)는 옛 React+Phaser 스캐폴드(src/)를 설명하고 있었지만,
> 실제 게임은 **`game/` 디렉토리의 바닐라 JS(Canvas 2D)** 다. `src/`와 루트 `index.html`은
> 현재 사용되지 않는 잔재이며, 배포 산출물은 `bun run build`(`cp -R game dist`)로 만들어진다.
> 게임 진입점은 `game/index.html` + `game/js/main.js` 이다.

## Implemented (현재 게임)

- 방해꾼(낙서체 몬스터) 클릭 제거형 캐주얼 게임: 업로드 바 진행을 방해하는 적을 클릭으로 처치
- 적 종류: basic/ransom/clone/popup/bomb/fake_btn/copier/unplug/bait/hidden
- 콤보(처치 MB 배율), 파일 업로드/완료, 구간(stage) 자동 상승, CRT 전환, HTML 바탕화면/설정창/BSOD
- 효과음(SFX) 시스템: `game/js/systems/sound.js` — Web Audio API, mp3 프리로드 + `playSfx()`

## 최근 작업 (2026-08-22)

- **SFX 18종 생성/연결** (`game/assets/sfx/*.mp3`)
  - 톤 원칙: 방해꾼=하찮은 카툰/장난감 소리, 시스템/UI/게임상태=Windows XP 계열 레트로음
  - 밈: 게임시작=XP 부팅음 / 구간클리어=로그온음 / 게임오버=블루스크린 크래시음
  - `sound.js`에 소리별 상대 볼륨 게인맵(`SFX_GAIN`) + 연타 피치 변주(`opts.varyCents`) 추가
  - `BAIT_APPEAR`(bait 등장음) 신규 추가 — bait.js의 initBait에서 재생
  - 레이어링 정리: bomb 폭발·fake_btn 오클릭에서 공통 피격음(HIT) 중복 제거(`silent` 옵션)
  - 처치/콤보 연타 피치 변주 연결(Enemy.kill, combo.registerKill)

## Next steps

- 실기에서 SFX 톤/밸런스 청음 확인 후 `SFX_GAIN` 값 튜닝
- 출시 전 `config.debug.enabled`(현재 true)를 false로 되돌리기
