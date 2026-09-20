const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('focusflow', {
  loadState: () => ipcRenderer.invoke('focusflow:load-state'),
  saveState: (state) => ipcRenderer.invoke('focusflow:save-state', state),
  saveAndClose: (state) => ipcRenderer.invoke('focusflow:save-and-close', state),
  minimize: () => ipcRenderer.invoke('focusflow:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('focusflow:toggle-maximize'),
  onBeforeClose: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('focusflow:before-close', listener);
    return () => ipcRenderer.removeListener('focusflow:before-close', listener);
  }
});

