import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain } from 'electron';
import dotenv from 'dotenv';
import Store from 'electron-store';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const localEnvPath = path.join(__dirname, '..', '.env');
const legacyEnvPath = path.join(__dirname, '..', '..', '.env');
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
} else if (fs.existsSync(legacyEnvPath)) {
  dotenv.config({ path: legacyEnvPath });
}

const store = new Store({
  defaults: {
    city: 'Delray Beach',
    cities: ['Delray Beach'],
    activeCity: 'Delray Beach',
    temperatureUnit: 'fahrenheit',
  },
});

const WEATHER_URL = 'https://api.openweathermap.org/data/2.5/weather';
const FORECAST_URL = 'https://api.openweathermap.org/data/2.5/forecast';

function utcCalendarKeyFromUnix(dtUtc, tzOffsetSec) {
  const localMs = dtUtc * 1000 + tzOffsetSec * 1000;
  const d = new Date(localMs);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

function mapForecastPayload(body) {
  const list = body?.list;
  if (!Array.isArray(list) || list.length === 0) {
    return [];
  }

  const tz = Number(body.city?.timezone ?? 0);
  const nowKey = utcCalendarKeyFromUnix(Math.floor(Date.now() / 1000), tz);

  /** @type {Map<string, { temps: number[], slots: { temp: number, icon: string }[] }>} */
  const byDay = new Map();

  for (const item of list) {
    const dt = item.dt;
    if (dt == null) continue;
    const key = utcCalendarKeyFromUnix(dt, tz);
    const m = item.main;
    const icon = item.weather?.[0]?.icon ?? '01d';
    const nums = [];
    if (m?.temp != null) nums.push(Number(m.temp));
    if (m?.temp_min != null) nums.push(Number(m.temp_min));
    if (m?.temp_max != null) nums.push(Number(m.temp_max));
    if (nums.length === 0) continue;

    if (!byDay.has(key)) {
      byDay.set(key, { temps: [], slots: [] });
    }
    const g = byDay.get(key);
    for (const n of nums) {
      g.temps.push(n);
    }
    if (m?.temp != null) {
      g.slots.push({ temp: Number(m.temp), icon });
    }
  }

  const sortedKeys = [...byDay.keys()].sort();
  const keys = sortedKeys.slice(0, 5);

  return keys.map((key) => {
    const g = byDay.get(key);
    const low = Math.min(...g.temps);
    const high = Math.max(...g.temps);
    let iconCode = '01d';
    if (g.slots.length > 0) {
      const hottest = g.slots.reduce((a, b) => (b.temp > a.temp ? b : a));
      iconCode = hottest.icon;
    }
    let dayLabel = '—';
    if (key === nowKey) {
      dayLabel = 'Today';
    } else {
      const [y, m, d] = key.split('-').map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      dayLabel = date.toLocaleDateString('en', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    }
    return {
      dayLabel,
      low: Math.round(low),
      high: Math.round(high),
      iconUrl: `https://openweathermap.org/img/wn/${iconCode}@2x.png`,
    };
  });
}

function mapWeatherPayload(data) {
  const w = data.weather?.[0];
  const iconCode = w?.icon ?? '01d';
  return {
    cityName: data.name,
    country: data.sys?.country,
    temp: data.main?.temp,
    feelsLike: data.main?.feels_like,
    description: w?.description ?? '',
    humidity: data.main?.humidity,
    windSpeed: data.wind?.speed,
    iconUrl: `https://openweathermap.org/img/wn/${iconCode}@2x.png`,
  };
}

async function fetchWeather() {
  const apiKey = process.env.OPENWEATHER_API_KEY?.trim();
  if (!apiKey) {
    return {
      error:
        'Missing API key. Copy .env.example to .env and set OPENWEATHER_API_KEY.',
    };
  }

  const city = String(store.get('activeCity') ?? store.get('city') ?? '').trim();
  if (!city) {
    return { error: 'Set a city in Settings.' };
  }

  const fahrenheit = store.get('temperatureUnit') === 'fahrenheit';
  const params = new URLSearchParams({
    q: city,
    appid: apiKey,
    units: fahrenheit ? 'imperial' : 'metric',
  });

  const weatherUrl = `${WEATHER_URL}?${params}`;
  const forecastUrl = `${FORECAST_URL}?${params}`;

  let weatherRes;
  let forecastRes;
  try {
    [weatherRes, forecastRes] = await Promise.all([
      fetch(weatherUrl),
      fetch(forecastUrl),
    ]);
  } catch {
    return { error: 'Network error. Check your connection.' };
  }

  let weatherBody;
  let forecastBody;
  try {
    weatherBody = await weatherRes.json();
  } catch {
    return { error: 'Invalid response from weather service.' };
  }

  if (!weatherRes.ok) {
    const msg =
      typeof weatherBody.message === 'string'
        ? weatherBody.message
        : `Weather request failed (${weatherRes.status}).`;
    return { error: msg };
  }

  try {
    forecastBody = await forecastRes.json();
  } catch {
    forecastBody = null;
  }

  const current = mapWeatherPayload(weatherBody);
  let forecast = [];
  if (forecastRes.ok && forecastBody?.list) {
    forecast = mapForecastPayload(forecastBody);
  }

  const tempUnit = fahrenheit ? 'fahrenheit' : 'celsius';
  const windUnit = fahrenheit ? 'mph' : 'm/s';

  return { data: { ...current, forecast, tempUnit, windUnit } };
}

function normalizeCity(city) {
  return String(city ?? '').trim();
}

function getCitiesState() {
  const legacyCity = normalizeCity(store.get('city'));
  const rawCities = store.get('cities');
  const cities = Array.isArray(rawCities)
    ? rawCities.map((v) => normalizeCity(v)).filter(Boolean)
    : [];
  if (cities.length === 0 && legacyCity) {
    cities.push(legacyCity);
  }
  if (cities.length === 0) {
    cities.push('Delray Beach');
  }
  const seen = new Set();
  const deduped = [];
  for (const city of cities) {
    const key = city.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(city);
  }

  const requestedActive = normalizeCity(store.get('activeCity'));
  const activeCity =
    deduped.find((c) => c.toLowerCase() === requestedActive.toLowerCase()) ??
    deduped[0];

  return { cities: deduped, activeCity };
}

function persistCitiesState({ cities, activeCity }) {
  store.set('cities', cities);
  store.set('activeCity', activeCity);
  store.set('city', activeCity);
}

function normalizeCitiesInput(cities) {
  if (!Array.isArray(cities)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of cities) {
    const city = normalizeCity(raw);
    if (!city) continue;
    const key = city.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(city);
  }
  return out;
}

/** @type {BrowserWindow | null} */
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 320,
    height: 700,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    resizable: true,
    minWidth: 320,
    minHeight: 700,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (!app.isPackaged && process.env.ELECTRON_OPEN_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(() => {
  ipcMain.handle('weather:fetch', () => fetchWeather());

  ipcMain.handle('settings:get', () => {
    const { cities, activeCity } = getCitiesState();
    return {
      city: activeCity,
      cities,
      activeCity,
      temperatureUnit: store.get('temperatureUnit') ?? 'celsius',
    };
  });

  ipcMain.handle('settings:setCity', (_event, city) => {
    const next = normalizeCity(city);
    if (!next) {
      return { ok: false, error: 'City cannot be empty.' };
    }
    const state = getCitiesState();
    const exists = state.cities.some((c) => c.toLowerCase() === next.toLowerCase());
    if (!exists) {
      state.cities.push(next);
    }
    state.activeCity = state.cities.find((c) => c.toLowerCase() === next.toLowerCase()) ?? next;
    persistCitiesState(state);
    return { ok: true, cities: state.cities, activeCity: state.activeCity };
  });

  ipcMain.handle('settings:setActiveCity', (_event, city) => {
    const next = normalizeCity(city);
    if (!next) {
      return { ok: false, error: 'City cannot be empty.' };
    }
    const state = getCitiesState();
    const existing = state.cities.find((c) => c.toLowerCase() === next.toLowerCase());
    if (!existing) {
      return { ok: false, error: 'City is not in your tracked list.' };
    }
    state.activeCity = existing;
    persistCitiesState(state);
    return { ok: true, cities: state.cities, activeCity: state.activeCity };
  });

  ipcMain.handle('settings:removeCity', (_event, city) => {
    const next = normalizeCity(city);
    if (!next) {
      return { ok: false, error: 'City cannot be empty.' };
    }
    const state = getCitiesState();
    if (state.cities.length <= 1) {
      return { ok: false, error: 'Keep at least one tracked city.' };
    }
    const remaining = state.cities.filter((c) => c.toLowerCase() !== next.toLowerCase());
    if (remaining.length === state.cities.length) {
      return { ok: false, error: 'City is not in your tracked list.' };
    }
    state.cities = remaining;
    if (state.activeCity.toLowerCase() === next.toLowerCase()) {
      state.activeCity = state.cities[0];
    }
    persistCitiesState(state);
    return { ok: true, cities: state.cities, activeCity: state.activeCity };
  });

  ipcMain.handle('settings:reorderCities', (_event, cities) => {
    const requested = normalizeCitiesInput(cities);
    const current = getCitiesState();
    if (requested.length !== current.cities.length) {
      return { ok: false, error: 'Reorder payload does not match tracked cities.' };
    }
    const currSet = new Set(current.cities.map((c) => c.toLowerCase()));
    for (const city of requested) {
      if (!currSet.has(city.toLowerCase())) {
        return { ok: false, error: 'Reorder payload includes unknown city.' };
      }
    }
    const activeCity =
      requested.find((c) => c.toLowerCase() === current.activeCity.toLowerCase()) ??
      requested[0];
    persistCitiesState({ cities: requested, activeCity });
    return { ok: true, cities: requested, activeCity };
  });

  ipcMain.handle('settings:setTemperatureUnit', (_event, unit) => {
    const u = String(unit ?? '').toLowerCase();
    if (u !== 'celsius' && u !== 'fahrenheit') {
      return { ok: false, error: 'Temperature unit must be celsius or fahrenheit.' };
    }
    store.set('temperatureUnit', u);
    return { ok: true };
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
