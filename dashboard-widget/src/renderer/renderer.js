const WEATHER_REFRESH_MS = 15 * 60 * 1000;
const STOCKS_REFRESH_MS = 2 * 60 * 1000;
const SPORTS_REFRESH_MS = 60 * 1000;

const api = window.widgets;

function bindWeather() {
  const weatherApi = api.weather;
  const el = {
    panel: document.getElementById('weather-panel'),
    cityTabs: document.getElementById('weather-city-tabs'),
    errorMsg: document.getElementById('weather-error-msg'),
    loadingMsg: document.getElementById('weather-loading-msg'),
    weatherContent: document.getElementById('weather-content'),
    locationLine: document.getElementById('weather-location-line'),
    weatherIcon: document.getElementById('weather-icon'),
    temp: document.getElementById('weather-temp'),
    tempUnit: document.getElementById('weather-temp-unit'),
    description: document.getElementById('weather-description'),
    feels: document.getElementById('weather-feels'),
    humidity: document.getElementById('weather-humidity'),
    wind: document.getElementById('weather-wind'),
    windUnit: document.getElementById('weather-wind-unit'),
    forecast: document.getElementById('weather-forecast'),
    viewMain: document.getElementById('weather-view-main'),
    viewSettings: document.getElementById('weather-view-settings'),
    cityInput: document.getElementById('weather-city-input'),
    settingsError: document.getElementById('weather-settings-error'),
    btnRefresh: document.getElementById('weather-btn-refresh'),
    btnEditTags: document.getElementById('weather-btn-edit-tags'),
    btnSettings: document.getElementById('weather-btn-settings'),
    btnSave: document.getElementById('weather-btn-save'),
    btnCancel: document.getElementById('weather-btn-cancel'),
  };

  const state = { cities: [], activeCity: '', cityEditMode: false };
  let dragCity = '';

  function formatTemp(n) {
    if (n == null || Number.isNaN(Number(n))) return '—';
    return Math.round(Number(n)).toString();
  }

  function setLoading(loading) {
    el.loadingMsg.hidden = !loading;
    if (loading) {
      el.weatherContent.hidden = true;
      el.errorMsg.hidden = true;
    }
  }

  function showError(message) {
    el.errorMsg.textContent = message;
    el.errorMsg.hidden = false;
    el.weatherContent.hidden = true;
    el.loadingMsg.hidden = true;
  }

  function renderForecast(forecast, tempUnit) {
    el.forecast.replaceChildren();
    if (!forecast?.length) {
      el.forecast.hidden = true;
      return;
    }
    const deg = tempUnit === 'fahrenheit' ? '°F' : '°C';
    const title = document.createElement('h3');
    title.className = 'widget__forecast-title';
    title.textContent = '5-day outlook';
    el.forecast.appendChild(title);

    for (const row of forecast) {
      const wrap = document.createElement('div');
      wrap.className = 'forecast-row';
      const img = document.createElement('img');
      img.className = 'forecast-row__icon';
      img.src = row.iconUrl;
      img.alt = '';
      const day = document.createElement('span');
      day.className = 'forecast-row__day';
      day.textContent = row.dayLabel ?? '—';
      const temps = document.createElement('span');
      temps.className = 'forecast-row__temps';
      const lo = row.low != null ? String(row.low) : '—';
      const hi = row.high != null ? String(row.high) : '—';
      temps.append(`${lo}${deg} / `);
      const hiSpan = document.createElement('span');
      hiSpan.className = 'hi';
      hiSpan.textContent = `${hi}${deg}`;
      temps.appendChild(hiSpan);
      wrap.append(img, day, temps);
      el.forecast.appendChild(wrap);
    }
    el.forecast.hidden = false;
  }

  function renderWeather(data) {
    el.errorMsg.hidden = true;
    el.loadingMsg.hidden = true;
    el.weatherContent.hidden = false;
    const fahrenheit = data.tempUnit === 'fahrenheit';
    const deg = fahrenheit ? '°F' : '°C';
    const windSuffix = data.windUnit ?? (fahrenheit ? 'mph' : 'm/s');
    const place = [data.cityName, data.country].filter(Boolean).join(', ');
    el.locationLine.textContent = place || '—';
    el.weatherIcon.src = data.iconUrl;
    el.weatherIcon.alt = data.description || 'Weather';
    el.temp.textContent = formatTemp(data.temp);
    el.tempUnit.textContent = deg;
    el.description.textContent = data.description || '';
    el.feels.textContent = `Feels like ${formatTemp(data.feelsLike)}${deg}`;
    el.humidity.textContent = data.humidity != null ? String(data.humidity) : '—';
    el.wind.textContent = data.windSpeed != null ? String(data.windSpeed) : '—';
    el.windUnit.textContent = windSuffix;
    renderForecast(data.forecast, data.tempUnit);
  }

  async function loadWeather() {
    setLoading(true);
    const result = await weatherApi.getWeather();
    if (result.error) return showError(result.error);
    if (result.data) renderWeather(result.data);
  }

  function renderCityEditModeButton() {
    el.btnEditTags.classList.toggle('icon-btn--active', state.cityEditMode);
    el.btnEditTags.setAttribute('aria-pressed', String(state.cityEditMode));
  }

  function renderCityTabs() {
    el.cityTabs.replaceChildren();
    for (const city of state.cities) {
      const tab = document.createElement('div');
      tab.className = 'city-tab';
      tab.draggable = true;
      if (city.toLowerCase() === state.activeCity.toLowerCase()) {
        tab.classList.add('city-tab--active');
      }

      const cityBtn = document.createElement('button');
      cityBtn.type = 'button';
      cityBtn.className = 'city-tab__label';
      cityBtn.textContent = city;
      cityBtn.addEventListener('click', async () => {
        if (city.toLowerCase() === state.activeCity.toLowerCase()) return;
        const res = await weatherApi.setActiveCity(city);
        if (!res.ok) return showError(res.error || 'Could not switch city.');
        state.cities = res.cities ?? state.cities;
        state.activeCity = res.activeCity ?? city;
        renderCityTabs();
        await loadWeather();
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'city-tab__remove';
      removeBtn.textContent = '×';
      removeBtn.hidden = !state.cityEditMode;
      removeBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        const res = await weatherApi.removeCity(city);
        if (!res.ok) return showError(res.error || 'Could not remove city.');
        state.cities = res.cities ?? state.cities;
        state.activeCity = res.activeCity ?? state.activeCity;
        renderCityTabs();
        await loadWeather();
      });

      tab.addEventListener('dragstart', () => {
        dragCity = city;
        tab.classList.add('city-tab--dragging');
      });
      tab.addEventListener('dragend', () => {
        dragCity = '';
        tab.classList.remove('city-tab--dragging');
        for (const node of el.cityTabs.children) {
          node.classList.remove('city-tab--drop-target');
        }
      });
      tab.addEventListener('dragover', (event) => {
        if (!dragCity || dragCity === city) return;
        event.preventDefault();
        tab.classList.add('city-tab--drop-target');
      });
      tab.addEventListener('dragleave', () => {
        tab.classList.remove('city-tab--drop-target');
      });
      tab.addEventListener('drop', async (event) => {
        event.preventDefault();
        tab.classList.remove('city-tab--drop-target');
        if (!dragCity || dragCity === city) return;
        const from = state.cities.findIndex((c) => c.toLowerCase() === dragCity.toLowerCase());
        const to = state.cities.findIndex((c) => c.toLowerCase() === city.toLowerCase());
        if (from < 0 || to < 0) return;
        const next = [...state.cities];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        const res = await weatherApi.reorderCities(next);
        if (!res.ok) return showError(res.error || 'Could not reorder cities.');
        state.cities = res.cities ?? next;
        state.activeCity = res.activeCity ?? state.activeCity;
        renderCityTabs();
      });
      tab.append(cityBtn, removeBtn);
      el.cityTabs.appendChild(tab);
    }
  }

  async function syncSettingsState() {
    const settings = await weatherApi.getSettings();
    state.cities = Array.isArray(settings.cities) ? settings.cities : [];
    state.activeCity = settings.activeCity ?? settings.city ?? state.cities[0] ?? '';
    if (state.cities.length === 0 && state.activeCity) state.cities = [state.activeCity];
    renderCityTabs();
  }

  function showSettings() {
    el.viewMain.hidden = true;
    el.viewSettings.hidden = false;
    el.settingsError.hidden = true;
    weatherApi.getSettings().then(({ activeCity, city, temperatureUnit }) => {
      el.cityInput.value = activeCity ?? city ?? '';
      const unit = temperatureUnit === 'fahrenheit' ? 'fahrenheit' : 'celsius';
      const radio = document.querySelector(
        `input[name="weather-temp-unit"][value="${unit}"]`,
      );
      if (radio) radio.checked = true;
      el.cityInput.focus();
      el.cityInput.select();
    });
  }

  function hideSettings() {
    el.viewMain.hidden = false;
    el.viewSettings.hidden = true;
    el.settingsError.hidden = true;
  }

  el.btnRefresh.addEventListener('click', loadWeather);
  el.btnEditTags.addEventListener('click', () => {
    state.cityEditMode = !state.cityEditMode;
    renderCityEditModeButton();
    renderCityTabs();
  });
  el.btnSettings.addEventListener('click', showSettings);
  el.btnCancel.addEventListener('click', hideSettings);
  el.btnSave.addEventListener('click', async () => {
    el.settingsError.hidden = true;
    const city = el.cityInput.value;
    const unitRadio = document.querySelector('input[name="weather-temp-unit"]:checked');
    const temperatureUnit = unitRadio?.value ?? 'celsius';
    const resUnit = await weatherApi.setTemperatureUnit(temperatureUnit);
    if (!resUnit.ok) {
      el.settingsError.textContent = resUnit.error || 'Could not save temperature unit.';
      el.settingsError.hidden = false;
      return;
    }
    const res = await weatherApi.setCity(city);
    if (!res.ok) {
      el.settingsError.textContent = res.error || 'Could not save city.';
      el.settingsError.hidden = false;
      return;
    }
    state.cities = res.cities ?? state.cities;
    state.activeCity = res.activeCity ?? state.activeCity;
    renderCityTabs();
    hideSettings();
    await loadWeather();
  });

  renderCityEditModeButton();
  syncSettingsState().then(loadWeather);
  setInterval(loadWeather, WEATHER_REFRESH_MS);
}

function bindStocks() {
  const stocksApi = api.stocks;
  const el = {
    symbolTabs: document.getElementById('stocks-symbol-tabs'),
    errorMsg: document.getElementById('stocks-error-msg'),
    loadingMsg: document.getElementById('stocks-loading-msg'),
    content: document.getElementById('stocks-content'),
    symbolName: document.getElementById('stocks-symbol-name'),
    price: document.getElementById('stocks-price'),
    change: document.getElementById('stocks-change'),
    open: document.getElementById('stocks-open'),
    high: document.getElementById('stocks-high'),
    low: document.getElementById('stocks-low'),
    viewMain: document.getElementById('stocks-view-main'),
    viewSettings: document.getElementById('stocks-view-settings'),
    symbolInput: document.getElementById('stocks-symbol-input'),
    settingsError: document.getElementById('stocks-settings-error'),
    btnRefresh: document.getElementById('stocks-btn-refresh'),
    btnEdit: document.getElementById('stocks-btn-edit'),
    btnSettings: document.getElementById('stocks-btn-settings'),
    btnSave: document.getElementById('stocks-btn-save'),
    btnCancel: document.getElementById('stocks-btn-cancel'),
  };

  const state = { symbols: [], activeSymbol: '', editMode: false };
  let dragSymbol = '';

  function money(value) {
    return Number.isFinite(Number(value)) ? `$${Number(value).toFixed(2)}` : '—';
  }

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

  function renderData(data) {
    el.errorMsg.hidden = true;
    el.loadingMsg.hidden = true;
    el.content.hidden = false;
    el.symbolName.textContent = data.symbol;
    el.price.textContent = money(data.price);
    const sign = data.change > 0 ? '+' : '';
    el.change.textContent = `${sign}${data.change.toFixed(2)} (${sign}${data.changePct.toFixed(2)}%)`;
    el.change.className = `widget__desc ${data.change >= 0 ? 'trend-up' : 'trend-down'}`;
    el.open.textContent = money(data.open);
    el.high.textContent = money(data.high);
    el.low.textContent = money(data.low);
  }

  async function loadQuote() {
    setLoading(true);
    const result = await stocksApi.getQuote();
    if (result.error) return showError(result.error);
    if (result.data) renderData(result.data);
  }

  function renderEditButton() {
    el.btnEdit.classList.toggle('icon-btn--active', state.editMode);
    el.btnEdit.setAttribute('aria-pressed', String(state.editMode));
  }

  function renderTabs() {
    el.symbolTabs.replaceChildren();
    for (const symbol of state.symbols) {
      const tab = document.createElement('div');
      tab.className = 'city-tab';
      tab.draggable = true;
      if (symbol === state.activeSymbol) tab.classList.add('city-tab--active');

      const label = document.createElement('button');
      label.type = 'button';
      label.className = 'city-tab__label';
      label.textContent = symbol;
      label.addEventListener('click', async () => {
        const res = await stocksApi.setActiveSymbol(symbol);
        if (!res.ok) return showError(res.error || 'Could not switch symbol.');
        state.symbols = res.symbols;
        state.activeSymbol = res.activeSymbol;
        renderTabs();
        await loadQuote();
      });

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'city-tab__remove';
      remove.textContent = '×';
      remove.hidden = !state.editMode;
      remove.addEventListener('click', async (event) => {
        event.stopPropagation();
        const res = await stocksApi.removeSymbol(symbol);
        if (!res.ok) return showError(res.error || 'Could not remove symbol.');
        state.symbols = res.symbols;
        state.activeSymbol = res.activeSymbol;
        renderTabs();
        await loadQuote();
      });

      tab.addEventListener('dragstart', () => {
        dragSymbol = symbol;
        tab.classList.add('city-tab--dragging');
      });
      tab.addEventListener('dragend', () => {
        dragSymbol = '';
        tab.classList.remove('city-tab--dragging');
      });
      tab.addEventListener('dragover', (event) => {
        if (!dragSymbol || dragSymbol === symbol) return;
        event.preventDefault();
        tab.classList.add('city-tab--drop-target');
      });
      tab.addEventListener('dragleave', () => tab.classList.remove('city-tab--drop-target'));
      tab.addEventListener('drop', async (event) => {
        event.preventDefault();
        tab.classList.remove('city-tab--drop-target');
        const from = state.symbols.indexOf(dragSymbol);
        const to = state.symbols.indexOf(symbol);
        if (from < 0 || to < 0) return;
        const next = [...state.symbols];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        const res = await stocksApi.reorderSymbols(next);
        if (!res.ok) return showError(res.error || 'Could not reorder symbols.');
        state.symbols = res.symbols;
        state.activeSymbol = res.activeSymbol;
        renderTabs();
      });
      tab.append(label, remove);
      el.symbolTabs.appendChild(tab);
    }
  }

  async function syncSettings() {
    const settings = await stocksApi.getSettings();
    state.symbols = settings.symbols || [];
    state.activeSymbol = settings.activeSymbol || state.symbols[0] || 'AAPL';
    renderTabs();
  }

  function showSettings() {
    el.viewMain.hidden = true;
    el.viewSettings.hidden = false;
    el.settingsError.hidden = true;
    el.symbolInput.value = state.activeSymbol || '';
    el.symbolInput.focus();
    el.symbolInput.select();
  }

  function hideSettings() {
    el.viewMain.hidden = false;
    el.viewSettings.hidden = true;
    el.settingsError.hidden = true;
  }

  el.btnRefresh.addEventListener('click', loadQuote);
  el.btnEdit.addEventListener('click', () => {
    state.editMode = !state.editMode;
    renderEditButton();
    renderTabs();
  });
  el.btnSettings.addEventListener('click', showSettings);
  el.btnCancel.addEventListener('click', hideSettings);
  el.btnSave.addEventListener('click', async () => {
    const res = await stocksApi.setSymbol(el.symbolInput.value);
    if (!res.ok) {
      el.settingsError.textContent = res.error || 'Could not save symbol.';
      el.settingsError.hidden = false;
      return;
    }
    state.symbols = res.symbols;
    state.activeSymbol = res.activeSymbol;
    renderTabs();
    hideSettings();
    await loadQuote();
  });

  renderEditButton();
  syncSettings().then(loadQuote);
  setInterval(loadQuote, STOCKS_REFRESH_MS);
}

function bindSports() {
  const sportsApi = api.sports;
  const el = {
    leagueTitle: document.getElementById('sports-league-title'),
    gamesHeading: document.getElementById('sports-games-heading'),
    gamesList: document.getElementById('sports-games-list'),
    errorMsg: document.getElementById('sports-error-msg'),
    loadingMsg: document.getElementById('sports-loading-msg'),
    content: document.getElementById('sports-content'),
    viewMain: document.getElementById('sports-view-main'),
    viewSettings: document.getElementById('sports-view-settings'),
    leagueSelect: document.getElementById('sports-league-select'),
    settingsError: document.getElementById('sports-settings-error'),
    btnRefresh: document.getElementById('sports-btn-refresh'),
    btnSettings: document.getElementById('sports-btn-settings'),
    btnSave: document.getElementById('sports-btn-save'),
    btnCancel: document.getElementById('sports-btn-cancel'),
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
    const currentOrToday = list.filter((game) => !game.completed || isSameCalendarDay(game.date));
    if (currentOrToday.length > 0) {
      return { heading: 'Current games', games: currentOrToday };
    }
    const recent = [...list]
      .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())
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
      matchup.textContent = game.matchup ?? `${game.away?.abbr ?? 'TBD'} @ ${game.home?.abbr ?? 'TBD'}`;

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
    const result = await sportsApi.getGames();
    if (result.error) return showError(result.error);
    if (result.data) renderData(result.data);
  }

  async function syncSettings() {
    const settings = await sportsApi.getSettings();
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
    const res = await sportsApi.setLeague(el.leagueSelect.value);
    if (!res.ok) {
      el.settingsError.textContent = res.error || 'Could not save league.';
      el.settingsError.hidden = false;
      return;
    }
    state.league = res.league ?? state.league;
    hideSettings();
    await loadGames();
  });

  syncSettings().then(loadGames);
  setInterval(loadGames, SPORTS_REFRESH_MS);
}

function enablePanelDrag() {
  const panels = [...document.querySelectorAll('.widget-panel')];
  let maxZ = 1;

  function readPosition(panel) {
    return {
      x: Number.parseInt(panel.style.left, 10) || 0,
      y: Number.parseInt(panel.style.top, 10) || 0,
      z: Number.parseInt(panel.style.zIndex, 10) || 1,
    };
  }

  function bumpZ(panel) {
    maxZ += 1;
    panel.style.zIndex = String(maxZ);
  }

  async function persistPositions() {
    const positions = {};
    for (const panel of panels) {
      const key = panel.dataset.widget;
      positions[key] = readPosition(panel);
    }
    await api.layout.setPositions(positions);
  }

  for (const panel of panels) {
    const handle = panel.querySelector('.widget-handle');
    if (!handle) continue;
    let dragging = false;
    let pointerId = null;
    let offsetX = 0;
    let offsetY = 0;

    panel.addEventListener('pointerdown', () => {
      bumpZ(panel);
    });

    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      if (event.target.closest('button, input, select, textarea, a')) return;
      dragging = true;
      pointerId = event.pointerId;
      const rect = panel.getBoundingClientRect();
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      bumpZ(panel);
      handle.setPointerCapture(pointerId);
      event.preventDefault();
    });

    handle.addEventListener('pointermove', (event) => {
      if (!dragging || event.pointerId !== pointerId) return;
      panel.style.left = `${Math.round(event.clientX - offsetX)}px`;
      panel.style.top = `${Math.round(event.clientY - offsetY)}px`;
    });

    const stopDrag = async (event) => {
      if (!dragging || event.pointerId !== pointerId) return;
      dragging = false;
      handle.releasePointerCapture(pointerId);
      pointerId = null;
      await persistPositions();
    };

    handle.addEventListener('pointerup', stopDrag);
    handle.addEventListener('pointercancel', stopDrag);
  }

  api.layout.getPositions().then((positions) => {
    for (const panel of panels) {
      const key = panel.dataset.widget;
      const pos = positions?.[key];
      if (!pos) continue;
      panel.style.left = `${pos.x}px`;
      panel.style.top = `${pos.y}px`;
      panel.style.zIndex = String(pos.z);
      maxZ = Math.max(maxZ, Number(pos.z) || 1);
    }
  });
}

bindWeather();
bindStocks();
bindSports();
enablePanelDrag();
