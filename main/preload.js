'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getFolderTree: folder => ipcRenderer.invoke('get-folder-tree', folder),
  runTest: (folder, preset) => ipcRenderer.invoke('run-test', folder, preset),
  generateFiles: (folder, options) => ipcRenderer.invoke('generate-files', folder, options),
  pushToRemote: (folder, remoteUrl, branch, token) =>
    ipcRenderer.invoke('push-to-remote', folder, remoteUrl, branch, token),
  openSecurityGuide: () => ipcRenderer.invoke('open-security-guide')
});