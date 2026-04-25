const REFRESH_MS = 2 * 60 * 1000;
const api = window.stocksWidget;

const el = {
  symbolTabs: document.getElementById('symbol-tabs'),
  errorMsg: document.getElementById('error-msg'),
  loadingMsg: document.getElementById('loading-msg'),
  content: document.getElementById('content'),
  symbolName: document.getElementById('symbol-name'),
  price: document.getElementById('price'),
  change: document.getElementById('change'),
  open: document.getElementById('open'),
  high: document.getElementById('high'),
  low: document.getElementById('low'),
  viewMain: document.getElementById('view-main'),
  viewSettings: document.getElementById('view-settings'),
  symbolInput: document.getElementById('symbol-input'),
  settingsError: document.getElementById('settings-error'),
  btnRefresh: document.getElementById('btn-refresh'),
  btnEdit: document.getElementById('btn-edit'),
  btnSettings: document.getElementById('btn-settings'),
  btnSave: document.getElementById('btn-save'),
  btnCancel: document.getElementById('btn-cancel'),
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
  const result = await api.getQuote();
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
      const res = await api.setActiveSymbol(symbol);
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
      const res = await api.removeSymbol(symbol);
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
      const res = await api.reorderSymbols(next);
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
  const settings = await api.getSettings();
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
  const res = await api.setSymbol(el.symbolInput.value);
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

setInterval(loadQuote, REFRESH_MS);
renderEditButton();
syncSettings().then(loadQuote);
