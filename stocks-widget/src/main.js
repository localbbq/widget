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
  name: 'stocks-widget-settings',
  defaults: {
    symbols: ['AAPL', 'MSFT', 'NVDA'],
    activeSymbol: 'AAPL',
  },
});

function normalizeSymbol(symbol) {
  return String(symbol ?? '').trim().toUpperCase();
}

function getSymbolsState() {
  const raw = store.get('symbols');
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
  const active = normalizeSymbol(store.get('activeSymbol'));
  const activeSymbol = deduped.includes(active) ? active : deduped[0];
  return { symbols: deduped, activeSymbol };
}

function persistSymbolsState(state) {
  store.set('symbols', state.symbols);
  store.set('activeSymbol', state.activeSymbol);
}

async function fetchStockQuote() {
  const { activeSymbol } = getSymbolsState();
  const apiKey = process.env.FINNHUB_API_KEY?.trim();
  if (!apiKey) {
    return {
      error:
        'Missing FINNHUB_API_KEY. Add it to stocks-widget/.env (or root .env).',
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
  const fallbackChange = Number.isFinite(baseline) && baseline > 0 ? close - baseline : 0;
  const change = Number.isFinite(changeRaw) ? changeRaw : fallbackChange;
  const changePct =
    Number.isFinite(changePctRaw)
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
  mainWindow.once('ready-to-show', () => mainWindow?.show());
}

app.whenReady().then(() => {
  ipcMain.handle('stocks:fetch', () => fetchStockQuote());
  ipcMain.handle('settings:get', () => getSymbolsState());

  ipcMain.handle('settings:setSymbol', (_event, symbol) => {
    const next = normalizeSymbol(symbol);
    if (!next) return { ok: false, error: 'Symbol cannot be empty.' };
    const state = getSymbolsState();
    if (!state.symbols.includes(next)) state.symbols.push(next);
    state.activeSymbol = next;
    persistSymbolsState(state);
    return { ok: true, ...state };
  });

  ipcMain.handle('settings:setActiveSymbol', (_event, symbol) => {
    const next = normalizeSymbol(symbol);
    const state = getSymbolsState();
    if (!state.symbols.includes(next)) return { ok: false, error: 'Symbol is not tracked.' };
    state.activeSymbol = next;
    persistSymbolsState(state);
    return { ok: true, ...state };
  });

  ipcMain.handle('settings:removeSymbol', (_event, symbol) => {
    const next = normalizeSymbol(symbol);
    const state = getSymbolsState();
    if (state.symbols.length <= 1) return { ok: false, error: 'Keep at least one symbol.' };
    state.symbols = state.symbols.filter((s) => s !== next);
    if (state.symbols.length === 0) return { ok: false, error: 'Keep at least one symbol.' };
    if (state.activeSymbol === next) state.activeSymbol = state.symbols[0];
    persistSymbolsState(state);
    return { ok: true, ...state };
  });

  ipcMain.handle('settings:reorderSymbols', (_event, symbols) => {
    const next = Array.isArray(symbols) ? symbols.map(normalizeSymbol).filter(Boolean) : [];
    const state = getSymbolsState();
    if (next.length !== state.symbols.length) return { ok: false, error: 'Invalid reorder payload.' };
    const current = new Set(state.symbols);
    for (const symbol of next) {
      if (!current.has(symbol)) return { ok: false, error: 'Invalid reorder payload.' };
    }
    state.symbols = next;
    if (!state.symbols.includes(state.activeSymbol)) state.activeSymbol = state.symbols[0];
    persistSymbolsState(state);
    return { ok: true, ...state };
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
