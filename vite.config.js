import { defineConfig } from 'vite';

// ★ 2026-09-08: npm run build가 vite build로 바뀌었다(package.json) — 그동안은
//   `cp -R game dist`로 game/ 전체를 손 안 대고 통째로 복사했는데, 이유가 있었다:
//   방해꾼 스프라이트(assets/enemies/**)·SFX(assets/sfx/**)·완성 그림
//   (assets/files/**)·balance.csv는 전부 코드가 문자열을 이어붙여("./assets/" +
//   폴더 + 파일명) 런타임에 만들어내는 경로다(js/assets.js, js/systems/sound.js,
//   js/systems/bgm.js, js/systems/filePicture.js, js/balance/loader.js) — vite의
//   정적 분석(HTML의 href/src, CSS의 url())으로는 안 잡히고, 잡힌다 해도 vite가
//   해시를 붙여 파일명을 바꿔버리면 그 순간 문자열 조합 경로가 전부 어긋난다.
//   그래서 그 경로들은 game/public/(vite 기본 publicDir)로 옮겨뒀다 — publicDir은
//   내용을 해시도 재작성도 없이 outDir 루트에 그대로 복사하므로, 코드가 기대하는
//   "./assets/enemies/basic.png" 같은 경로가 배포본에서도 한 글자도 안 바뀐다
//   (game/public/assets/enemies/basic.png → dist/assets/enemies/basic.png).
//   대가: 이 파일들은 vite의 콘텐츠 해시 캐시버스팅을 못 받는다 — 문자열 조합
//   경로라는 근본 제약상 애초에 못 받는다(해시가 붙으면 조합이 깨진다). 대신
//   JS(68개 파일 → 번들 1~2개)와 CSS는 vite가 정상적으로 번들·해시·압축한다 —
//   이게 이번 변경의 실제 목적(느린 회선에서 파일 개수만큼 왕복하던 것을 줄임).
//
// ★ 반드시 npm run build(=vite build)로 검증할 것 — 이 publicDir 매핑이 깨지면
//   에셋이 전부 404난다(플레이스루로 직접 확인하기 전엔 안 보일 수 있다 — 갤러리
//   그림·SFX·bgm_main 등은 즉시 로드가 아니라서).
export default defineConfig({
  root: 'game',
  base: './',
  // 기본값이 이미 '<root>/public' = 'game/public'이라 생략해도 되지만, 위 주석의
  // 이유를 여기 명시적으로 못박아 둔다 — 나중에 root를 옮기면 이 값도 같이
  // 옮겨야 한다는 걸 놓치지 않게.
  publicDir: 'public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
