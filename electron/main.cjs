// Electron 메인 프로세스.
//
// ★ 렌더러는 file://가 아니라 커스텀 스킴 app://로 서빙한다. file://는 다른
//   프로젝트에서 ES 모듈 import·JSON fetch·localStorage가 전부 깨진 전례가
//   있다(세이브 소실까지 갔다) — Chromium이 file:// 페이지를 "null" 출처에
//   가깝게 취급해 저장소·모듈 로딩이 불안정해지는 문제다. app://를
//   standard+secure로 등록하면 http://처럼 진짜 출처(origin)를 가져서
//   localStorage가 디스크에 정상적으로 영속되고(userData 아래), <script
//   type="module">과 상대경로 fetch('./balance.csv') 둘 다 실제 웹 배포본과
//   동일하게 동작한다 — 실제로 이 프로젝트의 렌더러 코드(js/balance/loader.js,
//   js/systems/bgm.js 등)가 상대경로 fetch를 쓰므로 이 차이가 그대로 오프라인
//   동작 여부를 가른다.
const { app, BrowserWindow, protocol, net, ipcMain, Menu } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// 패키징 전(개발용 `electron .`)에는 프로젝트의 dist/를 그대로 보고, 패키징 후엔
// electron-builder가 extraResources로 옮겨둔 resources/dist를 본다(package.json의
// build.extraResources 참고) — 둘 다 asar 밖의 평범한 파일이라 net.fetch(file://)로
// 그대로 읽힌다(asar 안에 있으면 net.fetch가 못 읽는다 — Node의 fs만 asar를
// 투명하게 읽지, Chromium 네트워크 스택은 asar를 모른다).
const DIST_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'dist')
  : path.join(__dirname, '..', 'dist');

// registerSchemesAsPrivileged는 app.ready 이전에 불러야 한다(Electron 요구사항).
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function registerAppProtocol() {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '' || pathname === '/') pathname = '/index.html';

    const filePath = path.normalize(path.join(DIST_DIR, pathname));
    // DIST_DIR 밖으로 나가는 경로(../ 등)는 차단 — 커스텀 프로토콜은 우리가
    // 직접 경로를 풀어주는 것이라 이 검사가 없으면 임의 파일 읽기가 된다.
    if (!filePath.startsWith(DIST_DIR)) {
      return new Response('Forbidden', { status: 403 });
    }

    try {
      return await net.fetch(pathToFileURL(filePath).toString());
    } catch {
      return new Response('Not Found', { status: 404 });
    }
  });
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    fullscreen: true,
    minWidth: 960,
    minHeight: 540,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // 개발자도구 비활성 — 요구사항. openDevTools()를 아예 안 부르는 것보다
      // 확실하다(단축키·메뉴로 여는 길까지 이 옵션 하나가 막는다).
      devTools: false,
    },
  });

  // 메뉴바 완전 제거. autoHideMenuBar만으로는 Alt로 다시 나타나므로 아예 없앤다.
  Menu.setApplicationMenu(null);

  // F11 창 모드 전환. ★ DOM Fullscreen API(document.requestFullscreen)가 아니라
  // 네이티브 창(win.setFullScreen)을 직접 토글한다 — 이유는 아래 ESC 처리와
  // 같다. before-input-event는 이 webContents로 오는 모든 키 입력을 렌더러보다
  // 먼저 보므로, 포커스가 어디 있든 F11을 잡을 수 있다.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      event.preventDefault();
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });

  // ★ ESC 관련 핵심 사실(실측으로 확인): 페이지가 document.documentElement.
  //   requestFullscreen()으로 켠 "DOM Fullscreen API" 전체화면은 Chromium이
  //   ESC를 UA 차원에서 가로채 강제로 끈다 — before-input-event에서
  //   preventDefault()해도 못 막는다(스펙상 사용자가 언제든 빠져나갈 수 있어야
  //   하는 보안장치라 페이지가 취소할 수 없다). 반면 여기처럼 메인 프로세스가
  //   win.setFullScreen(true)로 켠 "네이티브 창" 전체화면은 이 UA 개입 대상이
  //   아니다 — ESC를 눌러도 전체화면이 그대로 유지되고, keydown 이벤트도
  //   평소처럼 페이지(js/ui/settingsPanel.js의 handleSettingsKey)로 전달돼
  //   설정창이 열린다. 그래서 이 프로젝트는 전체화면을 절대 DOM API로 걸지
  //   않는다 — 이 window 옵션(fullscreen:true)과 위 F11 토글, 그리고
  //   settingsPanel.js의 IPC 분기(platform.isDesktopApp())가 항상 네이티브
  //   경로만 쓰도록 맞춰져 있다.
  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.send('fullscreen-changed', true);
  });
  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.send('fullscreen-changed', false);
  });

  mainWindow.loadURL('app://bundle/index.html');
}

ipcMain.handle('set-fullscreen', (_event, value) => {
  mainWindow?.setFullScreen(!!value);
});
ipcMain.handle('is-fullscreen', () => !!mainWindow?.isFullScreen());
ipcMain.on('quit-app', () => app.quit());

app.whenReady().then(() => {
  registerAppProtocol();
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});
