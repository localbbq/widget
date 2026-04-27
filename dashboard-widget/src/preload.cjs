const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widgets', {
  weather: {
    getWeather: () => ipcRenderer.invoke('weather:fetch'),
    getSettings: () => ipcRenderer.invoke('weather:settings:get'),
    setCity: (city) => ipcRenderer.invoke('weather:settings:setCity', city),
    setActiveCity: (city) =>
      ipcRenderer.invoke('weather:settings:setActiveCity', city),
    removeCity: (city) => ipcRenderer.invoke('weather:settings:removeCity', city),
    reorderCities: (cities) =>
      ipcRenderer.invoke('weather:settings:reorderCities', cities),
    setTemperatureUnit: (unit) =>
      ipcRenderer.invoke('weather:settings:setTemperatureUnit', unit),
  },
  stocks: {
    getQuote: () => ipcRenderer.invoke('stocks:fetch'),
    getSettings: () => ipcRenderer.invoke('stocks:settings:get'),
    setSymbol: (symbol) => ipcRenderer.invoke('stocks:settings:setSymbol', symbol),
    setActiveSymbol: (symbol) =>
      ipcRenderer.invoke('stocks:settings:setActiveSymbol', symbol),
    removeSymbol: (symbol) =>
      ipcRenderer.invoke('stocks:settings:removeSymbol', symbol),
    reorderSymbols: (symbols) =>
      ipcRenderer.invoke('stocks:settings:reorderSymbols', symbols),
  },
  sports: {
    getGames: () => ipcRenderer.invoke('sports:fetch'),
    getSettings: () => ipcRenderer.invoke('sports:settings:get'),
    setLeague: (league) => ipcRenderer.invoke('sports:settings:setLeague', league),
  },
  layout: {
    getPositions: () => ipcRenderer.invoke('layout:getPositions'),
    setPositions: (positions) =>
      ipcRenderer.invoke('layout:setPositions', positions),
  },
});
