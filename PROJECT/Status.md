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

- **SFX 1차 (18종)** — 톤 원칙·밈·SFX_GAIN·varyCents·레이어링 정리(silent) 확립
- **SFX 2차 보강 (40개 mp3)** — 변주 시스템 + 신규 지점 추가:
  - **변주(랜덤 재생) 시스템**: `sound.js`의 `VARIANT_COUNTS` 맵 — `sfx_이름_N.mp3` 풀에서 무작위 선택
    - kill_soft×4, atk_warning×3(더 다급하게 재제작), combo×3, hit×2, ui_click×2
  - **다단계 타격 진행감**: ransom hp3 — 1타 균열(`ransom_crack_1`)→2타 갈라짐(`ransom_crack_2`)→최종 KILL_HARD (Enemy.takeHit이 hp 남은 수로 선택, `maxHp>1`에 일반화)
  - **신규 지점**: 등장음 4종(entrance.js가 kind별: pop/slam/window/print), bait 퇴장음, 과밀 글리치 진입/해제(overload.js 엣지), 시간 임박 똑딱(마지막 10초, stageManager), 설정 열기/닫기(UI_OPEN/CLOSE), 파일 건너뛰기(SKIP)
  - 콤보 음정 상승: combo.js가 `detune`을 combo 수에 비례(상한 700센트)로 올림
  - `playSfx`에 `opts.detune`(고정 피치) 추가 — varyCents(무작위)와 병행

- **SFX 3차 톤다운** — "너무 자주·날카로워 귀에 거슬림" 피드백 반영:
  - 날카로운 소리 부드럽게 재제작(16종): kill 계열·hit·atk_warning·combo·time_tick·fakebtn·unplug
  - `sound.js`에 전역 로우패스(8kHz) 추가 + 재생 시작 8ms 페이드인(어택·클릭 완화)
  - 빈도 감소: 콤보음 매 처치 → **5콤보마다 1회**, 시간 똑딱 마지막 10초 → **5초**
  - `SFX_GAIN` 전면 인하(자주 나는 소리 한 단계씩↓, 등장음 거의 깔리는 수준), 중요음(완료/클리어/게임오버)은 존재감 유지

- **SFX 4차 보강(3건)**:
  - popup 몸통 오클릭 오답음(`POPUP_WRONG`) 추가 — input.js의 몸통 클릭(shake) 지점
  - 특수능력 방해꾼 고유 처치음: clone/popup/unplug/hidden/bomb(Enemy.kill의 KILL_SFX 표 확장), copier는 자폭음이 이미 고유
  - 폭탄 임팩트 강화: 처치음(KILL_BOMB) 신설 + 만료 폭발음 재제작 & `SFX_GAIN` 0.7→0.85

## Next steps

- 실기에서 SFX 톤/밸런스 청음 확인 후 `SFX_GAIN` 값 튜닝
- 출시 전 `config.debug.enabled`(현재 true)를 false로 되돌리기

## Next steps

- 실기에서 SFX 톤/밸런스 청음 확인 후 `SFX_GAIN` 값 튜닝
- 출시 전 `config.debug.enabled`(현재 true)를 false로 되돌리기
