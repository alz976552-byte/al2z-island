const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the Electron IPC API without exposing the entire API
contextBridge.exposeInMainWorld('al2z', {
  listMusic: () => ipcRenderer.invoke('listMusic'),
  readLyrics: (url) => ipcRenderer.invoke('readLyrics', url),
  getWeather: () => ipcRenderer.invoke('getWeather'),
  screenshot: () => ipcRenderer.invoke('screenshot'),
  setIslandState: (state) => ipcRenderer.send('island-state', state),
  onCursor: (callback) => {
    ipcRenderer.on('cursor', (event, pos) => {
      callback(pos);
    });
  },
  onNotify: (callback) => {
    ipcRenderer.on('notify', (event, title, text) => {
      callback(title, text);
    });
  }
});