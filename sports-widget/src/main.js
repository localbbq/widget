import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain } from 'electron';
import Store from 'electron-store';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const store = new Store({
  name: 'sports-widget-settings',
  defaults: {
    league: 'nba',
  },
});

function normalizeLeague(league) {
  const value = String(league ?? '').trim().toLowerCase();
  if (value === 'nba' || value === 'nfl' || value === 'mlb' || value === 'nhl') {
    return value;
  }
  return 'nba';
}

function getSportsState() {
  return {
    league: normalizeLeague(store.get('league')),
  };
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
  ipcMain.handle('sports:fetch', () => fetchScore());
  ipcMain.handle('settings:get', () => getSportsState());
  ipcMain.handle('settings:setLeague', (_event, league) => {
    const next = normalizeLeague(league);
    store.set('league', next);
    return { ok: true, league: next };
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
