const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stocksWidget', {
  getQuote: () => ipcRenderer.invoke('stocks:fetch'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSymbol: (symbol) => ipcRenderer.invoke('settings:setSymbol', symbol),
  setActiveSymbol: (symbol) => ipcRenderer.invoke('settings:setActiveSymbol', symbol),
  removeSymbol: (symbol) => ipcRenderer.invoke('settings:removeSymbol', symbol),
  reorderSymbols: (symbols) => ipcRenderer.invoke('settings:reorderSymbols', symbols),
});
