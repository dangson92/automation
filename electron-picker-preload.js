const { contextBridge, ipcRenderer } = require('electron');

// Expose minimal API for picker window to send result back
contextBridge.exposeInMainWorld('pickerAPI', {
  sendResult: (selector) => ipcRenderer.send('picker-result', selector)
});
