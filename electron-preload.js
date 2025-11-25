const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  runAutomation: (data) => ipcRenderer.invoke('automation-run', data),
  stopAutomation: () => ipcRenderer.invoke('automation-stop'),
  openLoginWindow: (url) => ipcRenderer.invoke('login-window-open', url),
  pickSelector: (url) => ipcRenderer.invoke('selector-picker-open', url)
});