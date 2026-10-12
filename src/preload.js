const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('raidAPI', {
  onState(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('raid-state', listener);
    return () => ipcRenderer.removeListener('raid-state', listener);
  },
  refresh: () => ipcRenderer.invoke('refresh-now'),
  version: () => ipcRenderer.invoke('app-version'),
});
