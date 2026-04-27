import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain } from 'electron';
import dotenv from 'dotenv';
import Store from 'electron-store';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const localEnvPath = path.join(__dirname, '..', '.env');
const rootEnvPath = path.join(__dirname, '..', '..', '.env');
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
} else if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}

const store = new Store({
  name: 'dashboard-widget-settings',
  defaults: {
    weather: {
      city: 'Delray Beach',
      cities: ['Delray Beach'],
      activeCity: 'Delray Beach',
      temperatureUnit: 'fahrenheit',
    },
    stocks: {
      symbols: ['AAPL', 'MSFT', 'NVDA'],
      activeSymbol: 'AAPL',
    },
    sports: {
      league: 'nba',
    },
    layout: {
      positions: {
        weather: { x: 24, y: 24, z: 1 },
        stocks: { x: 376, y: 24, z: 2 },
        sports: { x: 728, y: 24, z: 3 },
      },
    },
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
  if (!Array.isArray(list) || list.length === 0) return [];

  const tz = Number(body.city?.timezone ?? 0);
  const nowKey = utcCalendarKeyFromUnix(Math.floor(Date.now() / 1000), tz);
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
    for (const n of nums) g.temps.push(n);
    if (m?.temp != null) g.slots.push({ temp: Number(m.temp), icon });
  }

  const sortedKeys = [...byDay.keys()].sort().slice(0, 5);
  return sortedKeys.map((key) => {
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

function normalizeCity(city) {
  return String(city ?? '').trim();
}

function getWeatherState() {
  const state = store.get('weather') ?? {};
  const legacyCity = normalizeCity(state.city);
  const rawCities = state.cities;
  const cities = Array.isArray(rawCities)
    ? rawCities.map((v) => normalizeCity(v)).filter(Boolean)
    : [];
  if (cities.length === 0 && legacyCity) cities.push(legacyCity);
  if (cities.length === 0) cities.push('Delray Beach');

  const seen = new Set();
  const deduped = [];
  for (const city of cities) {
    const key = city.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(city);
  }
  const requestedActive = normalizeCity(state.activeCity);
  const activeCity =
    deduped.find((c) => c.toLowerCase() === requestedActive.toLowerCase()) ??
    deduped[0];
  const temperatureUnit =
    state.temperatureUnit === 'fahrenheit' ? 'fahrenheit' : 'celsius';

  return { city: activeCity, cities: deduped, activeCity, temperatureUnit };
}

function persistWeatherState(state) {
  store.set('weather', {
    city: state.activeCity,
    cities: state.cities,
    activeCity: state.activeCity,
    temperatureUnit: state.temperatureUnit,
  });
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

async function fetchWeather() {
  const apiKey = process.env.OPENWEATHER_API_KEY?.trim();
  if (!apiKey) {
    return {
      error:
        'Missing API key. Set OPENWEATHER_API_KEY in dashboard-widget/.env or root .env.',
    };
  }

  const state = getWeatherState();
  const city = String(state.activeCity ?? state.city ?? '').trim();
  if (!city) return { error: 'Set a city in Settings.' };

  const fahrenheit = state.temperatureUnit === 'fahrenheit';
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
  const forecast =
    forecastRes.ok && forecastBody?.list ? mapForecastPayload(forecastBody) : [];
  const tempUnit = fahrenheit ? 'fahrenheit' : 'celsius';
  const windUnit = fahrenheit ? 'mph' : 'm/s';
  return { data: { ...current, forecast, tempUnit, windUnit } };
}

function normalizeSymbol(symbol) {
  return String(symbol ?? '').trim().toUpperCase();
}

function getStocksState() {
  const rawState = store.get('stocks') ?? {};
  const raw = rawState.symbols;
  const values = Array.isArray(raw) ? raw : [];
  const deduped = [];
  const seen = new Set();
  for (const value of values) {
    const symbol = normalizeSymbol(value);
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    deduped.push(symbol);
  }
  if (deduped.length === 0) deduped.push('AAPL');
  const active = normalizeSymbol(rawState.activeSymbol);
  const activeSymbol = deduped.includes(active) ? active : deduped[0];
  return { symbols: deduped, activeSymbol };
}

function persistStocksState(state) {
  store.set('stocks', {
    symbols: state.symbols,
    activeSymbol: state.activeSymbol,
  });
}

async function fetchStockQuote() {
  const { activeSymbol } = getStocksState();
  const apiKey = process.env.FINNHUB_API_KEY?.trim();
  if (!apiKey) {
    return {
      error:
        'Missing FINNHUB_API_KEY. Add it to dashboard-widget/.env (or root .env).',
    };
  }
  const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(activeSymbol)}&token=${encodeURIComponent(apiKey)}`;
  let response;
  try {
    response = await fetch(quoteUrl);
  } catch {
    return { error: 'Network error. Check your connection.' };
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return { error: 'Finnhub rejected your API key. Verify FINNHUB_API_KEY.' };
    }
    return { error: `Stock request failed (${response.status}).` };
  }

  let quote;
  try {
    quote = await response.json();
  } catch {
    return { error: 'Invalid response from Finnhub.' };
  }
  const close = Number(quote?.c);
  const open = Number(quote?.o);
  const high = Number(quote?.h);
  const low = Number(quote?.l);
  const prevClose = Number(quote?.pc);
  const changeRaw = Number(quote?.d);
  const changePctRaw = Number(quote?.dp);
  const ts = Number(quote?.t);
  if (!Number.isFinite(close) || close <= 0) {
    return { error: `No stock data found for ${activeSymbol}.` };
  }
  const baseline = Number.isFinite(prevClose) && prevClose > 0 ? prevClose : open;
  const fallbackChange =
    Number.isFinite(baseline) && baseline > 0 ? close - baseline : 0;
  const change = Number.isFinite(changeRaw) ? changeRaw : fallbackChange;
  const changePct = Number.isFinite(changePctRaw)
    ? changePctRaw
    : baseline > 0
      ? (change / baseline) * 100
      : 0;

  return {
    data: {
      symbol: activeSymbol,
      price: close,
      change,
      changePct,
      open: Number.isFinite(open) ? open : null,
      high: Number.isFinite(high) ? high : null,
      low: Number.isFinite(low) ? low : null,
      date: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : null,
      volume: null,
    },
  };
}

function normalizeLeague(league) {
  const value = String(league ?? '').trim().toLowerCase();
  if (value === 'nba' || value === 'nfl' || value === 'mlb' || value === 'nhl') {
    return value;
  }
  return 'nba';
}

function getSportsState() {
  const state = store.get('sports') ?? {};
  return { league: normalizeLeague(state.league) };
}

async function fetchScore() {
  const { league } = getSportsState();
  const leagueMap = {
    nba: { sport: 'basketball', leaguePath: 'nba', label: 'NBA' },
    nfl: { sport: 'football', leaguePath: 'nfl', label: 'NFL' },
    mlb: { sport: 'baseball', leaguePath: 'mlb', label: 'MLB' },
    nhl: { sport: 'hockey', leaguePath: 'nhl', label: 'NHL' },
  };
  const selected = leagueMap[league] ?? leagueMap.nba;
  const url = `https://site.api.espn.com/apis/site/v2/sports/${selected.sport}/${selected.leaguePath}/scoreboard`;
  let response;
  try {
    response = await fetch(url);
  } catch {
    return { error: 'Network error. Check your connection.' };
  }
  if (!response.ok) return { error: `Sports request failed (${response.status}).` };
  const body = await response.json();
  const events = Array.isArray(body.events) ? body.events : [];
  const games = events
    .map((event) => {
      const comp = event.competitions?.[0];
      const teams = comp?.competitors ?? [];
      if (teams.length < 2) return null;
      const home = teams.find((team) => team.homeAway === 'home') ?? teams[0];
      const away = teams.find((team) => team.homeAway === 'away') ?? teams[1];
      const statusType = comp?.status?.type;
      const shortDetail =
        statusType?.shortDetail ?? statusType?.description ?? 'Scheduled';
      return {
        id: event.id ?? `${away.team?.abbreviation}-${home.team?.abbreviation}`,
        matchup: `${away.team?.abbreviation ?? 'TBD'} @ ${home.team?.abbreviation ?? 'TBD'}`,
        score: `${away.score ?? '0'} - ${home.score ?? '0'}`,
        status: statusType?.completed ? 'Final' : shortDetail,
        statusState: statusType?.state ?? 'pre',
        completed: Boolean(statusType?.completed),
        date: event.date ?? comp?.date ?? null,
        away: {
          abbr: away.team?.abbreviation ?? 'TBD',
          name: away.team?.shortDisplayName ?? away.team?.displayName ?? 'Away',
          logo: away.team?.logo ?? away.team?.logos?.[0]?.href ?? '',
        },
        home: {
          abbr: home.team?.abbreviation ?? 'TBD',
          name: home.team?.shortDisplayName ?? home.team?.displayName ?? 'Home',
          logo: home.team?.logo ?? home.team?.logos?.[0]?.href ?? '',
        },
      };
    })
    .filter(Boolean);

  return {
    data: {
      league: selected.label,
      games,
    },
  };
}

const defaultPositions = store.get('layout.positions');
function getLayoutPositions() {
  const positions = store.get('layout.positions');
  return positions && typeof positions === 'object' ? positions : defaultPositions;
}

function sanitizePosition(input, fallback = { x: 0, y: 0, z: 1 }) {
  const x = Number(input?.x);
  const y = Number(input?.y);
  const z = Number(input?.z);
  return {
    x: Number.isFinite(x) ? Math.round(x) : fallback.x,
    y: Number.isFinite(y) ? Math.round(y) : fallback.y,
    z: Number.isFinite(z) ? Math.round(z) : fallback.z,
  };
}

/** @type {BrowserWindow | null} */
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 920,
    minWidth: 980,
    minHeight: 720,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow?.show());
}

app.whenReady().then(() => {
  ipcMain.handle('weather:fetch', () => fetchWeather());
  ipcMain.handle('weather:settings:get', () => getWeatherState());
  ipcMain.handle('weather:settings:setCity', (_event, city) => {
    const next = normalizeCity(city);
    if (!next) return { ok: false, error: 'City cannot be empty.' };
    const state = getWeatherState();
    const exists = state.cities.some((c) => c.toLowerCase() === next.toLowerCase());
    if (!exists) state.cities.push(next);
    state.activeCity =
      state.cities.find((c) => c.toLowerCase() === next.toLowerCase()) ?? next;
    persistWeatherState(state);
    return { ok: true, cities: state.cities, activeCity: state.activeCity };
  });
  ipcMain.handle('weather:settings:setActiveCity', (_event, city) => {
    const next = normalizeCity(city);
    if (!next) return { ok: false, error: 'City cannot be empty.' };
    const state = getWeatherState();
    const existing = state.cities.find((c) => c.toLowerCase() === next.toLowerCase());
    if (!existing) return { ok: false, error: 'City is not in your tracked list.' };
    state.activeCity = existing;
    persistWeatherState(state);
    return { ok: true, cities: state.cities, activeCity: state.activeCity };
  });
  ipcMain.handle('weather:settings:removeCity', (_event, city) => {
    const next = normalizeCity(city);
    if (!next) return { ok: false, error: 'City cannot be empty.' };
    const state = getWeatherState();
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
    persistWeatherState(state);
    return { ok: true, cities: state.cities, activeCity: state.activeCity };
  });
  ipcMain.handle('weather:settings:reorderCities', (_event, cities) => {
    const requested = normalizeCitiesInput(cities);
    const state = getWeatherState();
    if (requested.length !== state.cities.length) {
      return { ok: false, error: 'Reorder payload does not match tracked cities.' };
    }
    const currSet = new Set(state.cities.map((c) => c.toLowerCase()));
    for (const city of requested) {
      if (!currSet.has(city.toLowerCase())) {
        return { ok: false, error: 'Reorder payload includes unknown city.' };
      }
    }
    const activeCity =
      requested.find((c) => c.toLowerCase() === state.activeCity.toLowerCase()) ??
      requested[0];
    persistWeatherState({ ...state, cities: requested, activeCity });
    return { ok: true, cities: requested, activeCity };
  });
  ipcMain.handle('weather:settings:setTemperatureUnit', (_event, unit) => {
    const u = String(unit ?? '').toLowerCase();
    if (u !== 'celsius' && u !== 'fahrenheit') {
      return { ok: false, error: 'Temperature unit must be celsius or fahrenheit.' };
    }
    const state = getWeatherState();
    state.temperatureUnit = u;
    persistWeatherState(state);
    return { ok: true };
  });

  ipcMain.handle('stocks:fetch', () => fetchStockQuote());
  ipcMain.handle('stocks:settings:get', () => getStocksState());
  ipcMain.handle('stocks:settings:setSymbol', (_event, symbol) => {
    const next = normalizeSymbol(symbol);
    if (!next) return { ok: false, error: 'Symbol cannot be empty.' };
    const state = getStocksState();
    if (!state.symbols.includes(next)) state.symbols.push(next);
    state.activeSymbol = next;
    persistStocksState(state);
    return { ok: true, ...state };
  });
  ipcMain.handle('stocks:settings:setActiveSymbol', (_event, symbol) => {
    const next = normalizeSymbol(symbol);
    const state = getStocksState();
    if (!state.symbols.includes(next)) return { ok: false, error: 'Symbol is not tracked.' };
    state.activeSymbol = next;
    persistStocksState(state);
    return { ok: true, ...state };
  });
  ipcMain.handle('stocks:settings:removeSymbol', (_event, symbol) => {
    const next = normalizeSymbol(symbol);
    const state = getStocksState();
    if (state.symbols.length <= 1) return { ok: false, error: 'Keep at least one symbol.' };
    state.symbols = state.symbols.filter((s) => s !== next);
    if (state.symbols.length === 0) return { ok: false, error: 'Keep at least one symbol.' };
    if (state.activeSymbol === next) state.activeSymbol = state.symbols[0];
    persistStocksState(state);
    return { ok: true, ...state };
  });
  ipcMain.handle('stocks:settings:reorderSymbols', (_event, symbols) => {
    const next = Array.isArray(symbols) ? symbols.map(normalizeSymbol).filter(Boolean) : [];
    const state = getStocksState();
    if (next.length !== state.symbols.length) {
      return { ok: false, error: 'Invalid reorder payload.' };
    }
    const current = new Set(state.symbols);
    for (const symbol of next) {
      if (!current.has(symbol)) return { ok: false, error: 'Invalid reorder payload.' };
    }
    state.symbols = next;
    if (!state.symbols.includes(state.activeSymbol)) state.activeSymbol = state.symbols[0];
    persistStocksState(state);
    return { ok: true, ...state };
  });

  ipcMain.handle('sports:fetch', () => fetchScore());
  ipcMain.handle('sports:settings:get', () => getSportsState());
  ipcMain.handle('sports:settings:setLeague', (_event, league) => {
    const next = normalizeLeague(league);
    store.set('sports.league', next);
    return { ok: true, league: next };
  });

  ipcMain.handle('layout:getPositions', () => getLayoutPositions());
  ipcMain.handle('layout:setPositions', (_event, positions) => {
    const current = getLayoutPositions();
    const next = {
      weather: sanitizePosition(positions?.weather, current?.weather),
      stocks: sanitizePosition(positions?.stocks, current?.stocks),
      sports: sanitizePosition(positions?.sports, current?.sports),
    };
    store.set('layout.positions', next);
    return { ok: true, positions: next };
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
