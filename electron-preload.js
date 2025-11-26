const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  runAutomation: (data) => ipcRenderer.invoke('automation-run', data),
  stopAutomation: () => ipcRenderer.invoke('automation-stop'),
  openLoginWindow: (url) => ipcRenderer.invoke('login-window-open', url),
  pickSelector: (url) => ipcRenderer.invoke('selector-picker-open', url),
  saveQueue: (queueData) => ipcRenderer.invoke('queue-save', queueData),
  loadQueue: () => ipcRenderer.invoke('queue-load'),
  exportSettings: (settings) => ipcRenderer.invoke('settings-export', settings),
  importSettings: () => ipcRenderer.invoke('settings-import')
});
