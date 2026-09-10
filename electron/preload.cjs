// contextIsolation:true라 렌더러는 Node/Electron API에 직접 못 닿는다. 여기서
// window.electronAPI로 딱 필요한 것만 좁게 노출한다(electron/main.cjs 참고).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // core/platform.js의 isDesktopApp()이 이 값 하나로 데스크톱 여부를 판단한다.
  isElectron: true,
  setFullscreen: (value) => ipcRenderer.invoke('set-fullscreen', value),
  isFullscreen: () => ipcRenderer.invoke('is-fullscreen'),
  // F11(메인 프로세스가 직접 토글)처럼 렌더러 밖에서 상태가 바뀔 때도
  // ui/settingsPanel.js의 체크박스가 맞게 따라오도록 하는 구독.
  onFullscreenChange: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on('fullscreen-changed', handler);
    return () => ipcRenderer.removeListener('fullscreen-changed', handler);
  },
  quit: () => ipcRenderer.send('quit-app'),
});
