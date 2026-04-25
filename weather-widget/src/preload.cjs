const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('weatherWidget', {
  getWeather: () => ipcRenderer.invoke('weather:fetch'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setCity: (city) => ipcRenderer.invoke('settings:setCity', city),
  setActiveCity: (city) => ipcRenderer.invoke('settings:setActiveCity', city),
  removeCity: (city) => ipcRenderer.invoke('settings:removeCity', city),
  reorderCities: (cities) => ipcRenderer.invoke('settings:reorderCities', cities),
  setTemperatureUnit: (unit) =>
    ipcRenderer.invoke('settings:setTemperatureUnit', unit),
});
