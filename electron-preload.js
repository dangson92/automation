const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  runAutomation: (data) => ipcRenderer.invoke('automation-run', data),
  stopAutomation: () => ipcRenderer.invoke('automation-stop'),
  openLoginWindow: (url) => ipcRenderer.invoke('login-window-open', url),
  pickSelector: (url) => ipcRenderer.invoke('selector-picker-open', url),
  saveQueue: (queueData) => ipcRenderer.invoke('queue-save', queueData),
  loadQueue: () => ipcRenderer.invoke('queue-load'),
  exportSettings: (settings) => ipcRenderer.invoke('settings-export', settings),
  importSettings: () => ipcRenderer.invoke('settings-import'),
  searchPerplexityImages: (data) => ipcRenderer.invoke('perplexity-search-images', data),
  savePublishData: (data) => ipcRenderer.invoke('save-publish-data', data),
  // License management
  activateLicense: (licenseKey) => ipcRenderer.invoke('license-activate', licenseKey),
  verifyLicense: () => ipcRenderer.invoke('license-verify'),
  getLicenseInfo: () => ipcRenderer.invoke('license-info'),
  getUserInfo: () => ipcRenderer.invoke('get-user-info'),
  removeLicense: () => ipcRenderer.invoke('license-remove'),
  licenseActivated: () => ipcRenderer.invoke('license-activated')
});
