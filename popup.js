const $ = (id) => document.getElementById(id);
let running = false;

function isBlackjack() {
  return $('slotGame').value.includes('blackjack');
}

function toggleGameSettings() {
  const bj = isBlackjack();
  $('slotSettings').style.display = bj ? 'none' : 'block';
  $('bjSettings').style.display = bj ? 'block' : 'none';
}

function calcBetPreview(balance, pct) {
  if (!balance) return '';
  const raw = Math.floor(balance * pct / 100);
  const bet = Math.max(1000, Math.floor(raw / 1000) * 1000);
  return `${(balance/1000).toFixed(0)}K balance = ${bet.toLocaleString('fr-FR')} bet`;
}

async function loadState() {
  const state = await chrome.storage.local.get([
    'running', 'toggleBonus', 'toggleWheel', 'toggleSlots', 'toggleFast',
    'slotGame', 'betPercent', 'bjBet', 'bjHands', 'logs', 'balance', 'currentBet'
  ]);

  running = state.running || false;
  $('toggleBonus').checked = state.toggleBonus || false;
  $('toggleWheel').checked = state.toggleWheel || false;
  $('toggleSlots').checked = state.toggleSlots !== false;
  $('toggleFast').checked = state.toggleFast !== false;
  $('slotGame').value = state.slotGame || 'slots-joker';
  $('betPercent').value = state.betPercent || 1;
  $('betPercentLabel').textContent = (state.betPercent || 1) + '%';
  $('bjBet').value = state.bjBet || 1000;
  $('bjHands').value = state.bjHands || '1';

  if (state.balance) {
    $('balance').textContent = Number(state.balance).toLocaleString('fr-FR');
    $('betPreview').textContent = calcBetPreview(state.balance, state.betPercent || 1);
  }
  if (state.currentBet) {
    $('betInfo').textContent = `Current bet: ${Number(state.currentBet).toLocaleString('fr-FR')}`;
  }

  toggleGameSettings();
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
    toggleFast: $('toggleFast').checked,
    slotGame: $('slotGame').value,
    betPercent: parseFloat($('betPercent').value) || 1,
    bjBet: parseInt($('bjBet').value) || 1000,
    bjHands: parseInt($('bjHands').value) || 1,
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

$('slotGame').addEventListener('change', () => {
  toggleGameSettings();
  saveSettings();
});

$('betPercent').addEventListener('input', () => {
  const pct = parseFloat($('betPercent').value);
  $('betPercentLabel').textContent = pct + '%';
  chrome.storage.local.get('balance').then(s => {
    if (s.balance) $('betPreview').textContent = calcBetPreview(s.balance, pct);
  });
});

for (const id of ['toggleBonus', 'toggleWheel', 'toggleSlots', 'toggleFast', 'betPercent', 'bjBet', 'bjHands']) {
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
