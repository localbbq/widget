const REFRESH_MS = 15 * 60 * 1000;

const api = window.weatherWidget;

const el = {
  cityTabs: document.getElementById('city-tabs'),
  errorMsg: document.getElementById('error-msg'),
  loadingMsg: document.getElementById('loading-msg'),
  weatherContent: document.getElementById('weather-content'),
  locationLine: document.getElementById('location-line'),
  weatherIcon: document.getElementById('weather-icon'),
  temp: document.getElementById('temp'),
  tempUnit: document.getElementById('temp-unit'),
  description: document.getElementById('description'),
  feels: document.getElementById('feels'),
  humidity: document.getElementById('humidity'),
  wind: document.getElementById('wind'),
  windUnit: document.getElementById('wind-unit'),
  forecast: document.getElementById('forecast'),
  viewMain: document.getElementById('view-main'),
  viewSettings: document.getElementById('view-settings'),
  cityInput: document.getElementById('city-input'),
  settingsError: document.getElementById('settings-error'),
  btnRefresh: document.getElementById('btn-refresh'),
  btnEditTags: document.getElementById('btn-edit-tags'),
  btnSettings: document.getElementById('btn-settings'),
  btnSave: document.getElementById('btn-save'),
  btnCancel: document.getElementById('btn-cancel'),
};

const state = {
  cities: [],
  activeCity: '',
  cityEditMode: false,
};
let dragCity = '';

function renderCityEditModeButton() {
  el.btnEditTags.classList.toggle('icon-btn--active', state.cityEditMode);
  el.btnEditTags.setAttribute('aria-pressed', String(state.cityEditMode));
  el.btnEditTags.title = state.cityEditMode
    ? 'Done editing city tags'
    : 'Edit city tags';
}

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
  el.humidity.textContent =
    data.humidity != null ? String(data.humidity) : '—';
  el.wind.textContent =
    data.windSpeed != null ? String(data.windSpeed) : '—';
  el.windUnit.textContent = windSuffix;
  renderForecast(data.forecast, data.tempUnit);
}

async function loadWeather() {
  setLoading(true);
  const result = await api.getWeather();
  if (result.error) {
    showError(result.error);
    return;
  }
  if (result.data) {
    renderWeather(result.data);
  }
}

function renderCityTabs() {
  el.cityTabs.replaceChildren();
  for (const city of state.cities) {
    const tab = document.createElement('div');
    tab.className = 'city-tab';
    tab.draggable = true;
    tab.dataset.city = city;
    if (city.toLowerCase() === state.activeCity.toLowerCase()) {
      tab.classList.add('city-tab--active');
      tab.setAttribute('aria-current', 'true');
    }

    const cityBtn = document.createElement('button');
    cityBtn.type = 'button';
    cityBtn.className = 'city-tab__label';
    cityBtn.textContent = city;
    cityBtn.addEventListener('click', async () => {
      if (city.toLowerCase() === state.activeCity.toLowerCase()) return;
      const res = await api.setActiveCity(city);
      if (!res.ok) {
        showError(res.error || 'Could not switch city.');
        return;
      }
      state.cities = res.cities ?? state.cities;
      state.activeCity = res.activeCity ?? city;
      renderCityTabs();
      await loadWeather();
    });

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'city-tab__remove';
    removeBtn.title = `Remove ${city}`;
    removeBtn.setAttribute('aria-label', `Remove ${city}`);
    removeBtn.textContent = '×';
    removeBtn.hidden = !state.cityEditMode;
    removeBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      const res = await api.removeCity(city);
      if (!res.ok) {
        showError(res.error || 'Could not remove city.');
        return;
      }
      state.cities = res.cities ?? state.cities;
      state.activeCity = res.activeCity ?? state.activeCity;
      renderCityTabs();
      await loadWeather();
    });

    tab.addEventListener('dragstart', (event) => {
      dragCity = city;
      tab.classList.add('city-tab--dragging');
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', city);
      }
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
      const res = await api.reorderCities(next);
      if (!res.ok) {
        showError(res.error || 'Could not reorder cities.');
        return;
      }
      state.cities = res.cities ?? next;
      state.activeCity = res.activeCity ?? state.activeCity;
      renderCityTabs();
    });

    tab.append(cityBtn, removeBtn);
    el.cityTabs.appendChild(tab);
  }
}

async function syncSettingsState() {
  const settings = await api.getSettings();
  state.cities = Array.isArray(settings.cities) ? settings.cities : [];
  state.activeCity = settings.activeCity ?? settings.city ?? state.cities[0] ?? '';
  if (state.cities.length === 0 && state.activeCity) {
    state.cities = [state.activeCity];
  }
  renderCityTabs();
  return settings;
}

function showSettings() {
  el.viewMain.hidden = true;
  el.viewSettings.hidden = false;
  el.settingsError.hidden = true;
  api.getSettings().then(({ activeCity, city, temperatureUnit }) => {
    el.cityInput.value = city ?? '';
    if (activeCity) {
      el.cityInput.value = activeCity;
    }
    const unit = temperatureUnit === 'fahrenheit' ? 'fahrenheit' : 'celsius';
    const radio = document.querySelector(
      `input[name="temp-unit"][value="${unit}"]`,
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

el.btnRefresh.addEventListener('click', () => {
  loadWeather();
});

el.btnEditTags.addEventListener('click', () => {
  state.cityEditMode = !state.cityEditMode;
  renderCityEditModeButton();
  renderCityTabs();
});

el.btnSettings.addEventListener('click', () => {
  showSettings();
});

el.btnCancel.addEventListener('click', () => {
  hideSettings();
});

el.btnSave.addEventListener('click', async () => {
  el.settingsError.hidden = true;
  const city = el.cityInput.value;
  const unitRadio = document.querySelector('input[name="temp-unit"]:checked');
  const temperatureUnit = unitRadio?.value ?? 'celsius';

  const resUnit = await api.setTemperatureUnit(temperatureUnit);
  if (!resUnit.ok) {
    el.settingsError.textContent =
      resUnit.error || 'Could not save temperature unit.';
    el.settingsError.hidden = false;
    return;
  }

  const res = await api.setCity(city);
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

setInterval(() => {
  loadWeather();
}, REFRESH_MS);

renderCityEditModeButton();
syncSettingsState().then(loadWeather);
