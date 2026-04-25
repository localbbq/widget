const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sportsWidget', {
  getGames: () => ipcRenderer.invoke('sports:fetch'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setLeague: (league) => ipcRenderer.invoke('settings:setLeague', league),
});
