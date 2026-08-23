// 이 파일 역할: 로컬에서 게임을 띄워보는 정적 서버. 의존성 없이 node만 쓴다.
//
// ★ 왜 python -m http.server 대신 이게 필요한가 (2026-08-23, 실측으로 확인된 사고)
//   python -m http.server는 응답에 Cache-Control을 아예 안 붙이고 Last-Modified만
//   보낸다. HTTP 명세상 명시적 신선도 지시가 없으면 브라우저는 "휴리스틱 캐싱"을
//   적용해도 되고, 크롬은 실제로 그렇게 한다 — 서버에 다시 묻지도 않고 캐시에
//   있는 옛 파일을 그대로 쓴다. 이 게임은 ES 모듈 수십 개로 쪼개져 있어서, 그
//   결과가 "코드는 분명히 고쳤는데 브라우저에선 옛 화면이 그대로 나온다"로
//   나타난다(구간 클리어 화면을 두 번이나 새로 만들었는데도 옛 화면이 나온다는
//   신고가 실제로 이것 때문이었다 — 디스크·서버 응답은 전부 새 코드인데
//   브라우저만 옛 모듈 그래프를 실행하고 있었다).
//
//   그래서 여기서는 모든 응답에 Cache-Control: no-store를 붙인다. 개발 중에는
//   "항상 지금 디스크에 있는 것"이 유일하게 옳은 동작이다. (vite dev 서버는
//   원래 no-cache를 붙이므로 npm run dev로 띄우면 이 문제가 없다 — 이 스크립트는
//   빌드 결과(dist)를 그대로 열어볼 때를 위한 것이다.)
//
// 사용: npm run serve            → dist를 8877에서
//       npm run serve -- game 8080  → 디렉터리·포트 직접 지정

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, normalize, extname, resolve } from 'node:path';

const root = resolve(process.argv[2] || 'dist');
const port = Number(process.argv[3] || 8877);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

createServer(async (req, res) => {
  // 쿼리스트링을 떼고, 상위 디렉터리 탈출(../)을 normalize로 막는다.
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(root, rel);

  try {
    let info = await stat(filePath);
    if (info.isDirectory()) {
      filePath = join(filePath, 'index.html');
      info = await stat(filePath);
    }
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': info.size,
      // ★ 이 한 줄이 이 파일의 존재 이유다(위 주석 참고).
      'Cache-Control': 'no-store, must-revalidate',
    });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('404 Not Found');
  }
}).listen(port, () => {
  console.log(`[serve] ${root}\n[serve] http://127.0.0.1:${port}/  (Cache-Control: no-store — 항상 최신 파일)`);
});
