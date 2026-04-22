const $ = (id) => document.getElementById(id);
let running = false;

function calcBetPreview(balance, pct) {
  if (!balance) return '';
  const raw = Math.floor(balance * pct / 100);
  const bet = Math.max(1000, Math.floor(raw / 1000) * 1000);
  return `${(balance/1000).toFixed(0)}K balance = ${bet.toLocaleString('fr-FR')} bet`;
}

async function loadState() {
  const state = await chrome.storage.local.get([
    'running', 'toggleBonus', 'toggleWheel', 'toggleSlots',
    'slotGame', 'betPercent', 'logs', 'balance', 'currentBet'
  ]);

  running = state.running || false;
  $('toggleBonus').checked = state.toggleBonus !== false;
  $('toggleWheel').checked = state.toggleWheel !== false;
  $('toggleSlots').checked = state.toggleSlots !== false;
  $('slotGame').value = state.slotGame || 'slots-joker';
  $('betPercent').value = state.betPercent || 1;
  $('betPercentLabel').textContent = (state.betPercent || 1) + '%';

  if (state.balance) {
    $('balance').textContent = Number(state.balance).toLocaleString('fr-FR');
    $('betPreview').textContent = calcBetPreview(state.balance, state.betPercent || 1);
  }
  if (state.currentBet) {
    $('betInfo').textContent = `Current bet: ${Number(state.currentBet).toLocaleString('fr-FR')}`;
  }

  updateUI();
  renderLogs(state.logs || []);
}

function updateUI() {
  $('statusDot').className = running ? 'status-dot active' : 'status-dot';
  $('statusText').textContent = running ? 'Running' : 'Stopped';
  $('btnStart').style.display = running ? 'none' : 'block';
  $('btnStop').style.display = running ? 'block' : 'none';
}

function renderLogs(logs) {
  const area = $('logArea');
  area.innerHTML = '';
  for (const log of logs.slice(-25)) {
    const div = document.createElement('div');
    div.className = `log-entry ${log.type || 'info'}`;
    div.textContent = `[${log.time}] ${log.msg}`;
    area.appendChild(div);
  }
  area.scrollTop = area.scrollHeight;
}

async function saveSettings() {
  await chrome.storage.local.set({
    toggleBonus: $('toggleBonus').checked,
    toggleWheel: $('toggleWheel').checked,
    toggleSlots: $('toggleSlots').checked,
    slotGame: $('slotGame').value,
    betPercent: parseFloat($('betPercent').value) || 1,
  });
}

// --- Events ---
$('btnStart').addEventListener('click', async () => {
  running = true;
  await saveSettings();
  await chrome.storage.local.set({ running: true });
  chrome.runtime.sendMessage({ action: 'start' });
  updateUI();
});

$('btnStop').addEventListener('click', async () => {
  running = false;
  await chrome.storage.local.set({ running: false });
  chrome.runtime.sendMessage({ action: 'stop' });
  updateUI();
});

$('betPercent').addEventListener('input', () => {
  const pct = parseFloat($('betPercent').value);
  $('betPercentLabel').textContent = pct + '%';
  chrome.storage.local.get('balance').then(s => {
    if (s.balance) $('betPreview').textContent = calcBetPreview(s.balance, pct);
  });
});

for (const id of ['toggleBonus', 'toggleWheel', 'toggleSlots', 'slotGame', 'betPercent']) {
  $(id).addEventListener('change', saveSettings);
}

// --- Live updates ---
chrome.storage.onChanged.addListener((changes) => {
  if (changes.balance) {
    const bal = changes.balance.newValue;
    $('balance').textContent = Number(bal).toLocaleString('fr-FR');
    const pct = parseFloat($('betPercent').value) || 1;
    $('betPreview').textContent = calcBetPreview(bal, pct);
  }
  if (changes.currentBet) {
    $('betInfo').textContent = `Current bet: ${Number(changes.currentBet.newValue).toLocaleString('fr-FR')}`;
  }
  if (changes.logs) renderLogs(changes.logs.newValue || []);
  if (changes.running) { running = changes.running.newValue; updateUI(); }
});

loadState();
