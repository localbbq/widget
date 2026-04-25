const REFRESH_MS = 60 * 1000;
const api = window.sportsWidget;

const el = {
  leagueTitle: document.getElementById('league-title'),
  gamesHeading: document.getElementById('games-heading'),
  gamesList: document.getElementById('games-list'),
  errorMsg: document.getElementById('error-msg'),
  loadingMsg: document.getElementById('loading-msg'),
  content: document.getElementById('content'),
  viewMain: document.getElementById('view-main'),
  viewSettings: document.getElementById('view-settings'),
  leagueSelect: document.getElementById('league-select'),
  settingsError: document.getElementById('settings-error'),
  btnRefresh: document.getElementById('btn-refresh'),
  btnSettings: document.getElementById('btn-settings'),
  btnSave: document.getElementById('btn-save'),
  btnCancel: document.getElementById('btn-cancel'),
};

const state = { league: 'nba' };

function showError(message) {
  el.errorMsg.textContent = message;
  el.errorMsg.hidden = false;
  el.content.hidden = true;
  el.loadingMsg.hidden = true;
}

function setLoading(loading) {
  el.loadingMsg.hidden = !loading;
  if (loading) {
    el.errorMsg.hidden = true;
    el.content.hidden = true;
  }
}

function formatGameDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function isSameCalendarDay(iso, refDate = new Date()) {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  return (
    date.getFullYear() === refDate.getFullYear() &&
    date.getMonth() === refDate.getMonth() &&
    date.getDate() === refDate.getDate()
  );
}

function selectDisplayGames(games) {
  const list = Array.isArray(games) ? games : [];
  const currentOrToday = list.filter(
    (game) => !game.completed || isSameCalendarDay(game.date),
  );
  if (currentOrToday.length > 0) {
    return { heading: 'Current games', games: currentOrToday };
  }
  const recent = [...list]
    .sort((a, b) => {
      const aTime = new Date(a.date ?? 0).getTime();
      const bTime = new Date(b.date ?? 0).getTime();
      return bTime - aTime;
    })
    .slice(0, 12);
  return { heading: 'Recent results', games: recent };
}

function renderGames(games, heading) {
  el.gamesList.replaceChildren();
  el.gamesHeading.textContent = heading;
  if (!Array.isArray(games) || games.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'widget__desc';
    empty.textContent = 'No games in progress right now.';
    el.gamesList.appendChild(empty);
    return;
  }

  for (const game of games) {
    const row = document.createElement('div');
    row.className = 'game-row';

    const logos = document.createElement('div');
    logos.className = 'game-row__logos';
    const awayLogo = document.createElement('img');
    awayLogo.className = 'game-row__logo';
    awayLogo.src = game.away?.logo || '';
    awayLogo.alt = `${game.away?.abbr ?? 'Away'} logo`;
    awayLogo.loading = 'lazy';
    const homeLogo = document.createElement('img');
    homeLogo.className = 'game-row__logo';
    homeLogo.src = game.home?.logo || '';
    homeLogo.alt = `${game.home?.abbr ?? 'Home'} logo`;
    homeLogo.loading = 'lazy';
    logos.append(awayLogo, homeLogo);

    const matchup = document.createElement('div');
    matchup.className = 'game-row__matchup';
    matchup.textContent =
      game.matchup ??
      `${game.away?.abbr ?? 'TBD'} @ ${game.home?.abbr ?? 'TBD'}`;

    const score = document.createElement('div');
    score.className = 'game-row__score';
    score.textContent = game.score ?? '0 - 0';

    const status = document.createElement('div');
    status.className = 'game-row__status';
    const dateLabel = formatGameDate(game.date);
    if (game.completed && dateLabel) {
      status.textContent = `Final • ${dateLabel}`;
    } else if (game.completed) {
      status.textContent = 'Final';
    } else {
      status.textContent = game.status ?? 'Scheduled';
    }

    row.append(logos, matchup, score, status);
    el.gamesList.appendChild(row);
  }
}

function renderData(data) {
  el.errorMsg.hidden = true;
  el.loadingMsg.hidden = true;
  el.content.hidden = false;
  const league = (data.league ?? state.league ?? 'sports').toUpperCase();
  el.leagueTitle.textContent = `${league} Live`;
  const display = selectDisplayGames(data.games);
  renderGames(display.games, display.heading);
}

async function loadGames() {
  setLoading(true);
  const result = await api.getGames();
  if (result.error) return showError(result.error);
  if (result.data) renderData(result.data);
}

async function syncSettings() {
  const settings = await api.getSettings();
  state.league = settings.league || 'nba';
  el.leagueSelect.value = state.league;
}

function showSettings() {
  el.viewMain.hidden = true;
  el.viewSettings.hidden = false;
  el.settingsError.hidden = true;
  el.leagueSelect.value = state.league;
  el.leagueSelect.focus();
}

function hideSettings() {
  el.viewMain.hidden = false;
  el.viewSettings.hidden = true;
  el.settingsError.hidden = true;
}

el.btnRefresh.addEventListener('click', loadGames);
el.btnSettings.addEventListener('click', showSettings);
el.btnCancel.addEventListener('click', hideSettings);
el.btnSave.addEventListener('click', async () => {
  const res = await api.setLeague(el.leagueSelect.value);
  if (!res.ok) {
    el.settingsError.textContent = res.error || 'Could not save league.';
    el.settingsError.hidden = false;
    return;
  }
  state.league = res.league ?? state.league;
  hideSettings();
  await loadGames();
});

setInterval(loadGames, REFRESH_MS);
syncSettings().then(loadGames);
