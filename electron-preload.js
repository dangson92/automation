const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  runAutomation: (data) => ipcRenderer.invoke('automation-run', data)
});