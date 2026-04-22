// ===========================================================
// Partouche Auto-Player v2 (Firefox) - Background Script
// ===========================================================

// --- Logging ---
async function log(msg, type = 'info') {
  const state = await browser.storage.local.get('logs');
  const logs = state.logs || [];
  const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  logs.push({ time, msg, type });
  if (logs.length > 60) logs.splice(0, logs.length - 60);
  await browser.storage.local.set({ logs });
}

// --- Tab management ---
async function getPartoucheTab() {
  const tabs = await browser.tabs.query({ url: 'https://online.partouche.com/*' });
  if (tabs.length > 0) return tabs[0];
  const tab = await browser.tabs.create({ url: 'https://online.partouche.com/', active: false });
  await new Promise(resolve => {
    const listener = (tabId, info) => {
      if (tabId === tab.id && info.status === 'complete') {
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    browser.tabs.onUpdated.addListener(listener);
  });
  return tab;
}

async function sendToContent(action, data = {}) {
  try {
    const tab = await getPartoucheTab();
    return await browser.tabs.sendMessage(tab.id, { action, ...data });
  } catch (err) {
    return null;
  }
}

// --- Main automation loop ---
let loopInterval = null;

async function runLoop() {
  const state = await browser.storage.local.get([
    'running', 'toggleBonus', 'toggleWheel', 'toggleSlots',
    'slotGame', 'betPercent', 'lastBonusClaim', 'lastWheelSpin',
  ]);

  if (!state.running) { stopLoop(); return; }

  const now = Date.now();

  // 1. Daily bonus (once per day)
  if (state.toggleBonus !== false) {
    const lastBonus = state.lastBonusClaim || 0;
    if (now - lastBonus > 24 * 60 * 60 * 1000) {
      await log('Checking daily bonus...', 'info');
      const result = await sendToContent('claimDailyBonus');
      if (result?.success) {
        await browser.storage.local.set({ lastBonusClaim: now });
        await log('Daily bonus claimed!', 'success');
      } else if (result?.error && !result.error.includes('Navigating')) {
        await log(result.error, 'warn');
        if (result.error.includes('No bonus')) {
          await browser.storage.local.set({ lastBonusClaim: now - 23 * 60 * 60 * 1000 });
        }
      }
      return;
    }
  }

  // 2. Daily wheel (every 3 hours)
  if (state.toggleWheel !== false) {
    const lastWheel = state.lastWheelSpin || 0;
    if (now - lastWheel > 3 * 60 * 60 * 1000) {
      await log('Checking daily wheel...', 'info');
      const result = await sendToContent('spinDailyWheel');
      if (result?.success) {
        await browser.storage.local.set({ lastWheelSpin: now });
        await log('Daily wheel spun!', 'success');
      } else if (result?.error) {
        if (result.error.includes('cooldown')) {
          await browser.storage.local.set({ lastWheelSpin: now - 2 * 60 * 60 * 1000 });
        }
        await log(result.error, 'warn');
      }
      return;
    }
  }

  // 3. Auto-play slots
  if (state.toggleSlots !== false) {
    const game = state.slotGame || 'slots-joker';
    const betPct = state.betPercent || 1;

    const ping = await sendToContent('ping');
    const expectedPath = `/jeux-casino-gratuit/${game}`;

    if (ping?.path !== expectedPath) {
      await log(`Navigating to ${game}...`, 'info');
      await sendToContent('startSlotPlay', { game, betPercent: betPct });
    }
  }

  // 4. Update balance
  const balResult = await sendToContent('getBalance');
  if (balResult?.balance) {
    await browser.storage.local.set({ balance: balResult.balance });
  }
}

function startLoop() {
  if (loopInterval) return;
  log('Automation started', 'success');
  runLoop();
  loopInterval = setInterval(runLoop, 20000);
}

function stopLoop() {
  if (loopInterval) {
    clearInterval(loopInterval);
    loopInterval = null;
  }
  sendToContent('stopSlotPlay');
  log('Automation stopped', 'warn');
}

// --- Alarm for wheel ---
browser.alarms.create('wheelReminder', { periodInMinutes: 180 });
browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'wheelReminder') {
    const state = await browser.storage.local.get('running');
    if (state.running) runLoop();
  }
});

// --- Message handling ---
browser.runtime.onMessage.addListener((msg, sender) => {
  switch (msg.action) {
    case 'start':
      startLoop();
      return Promise.resolve({ ok: true });
    case 'stop':
      stopLoop();
      return Promise.resolve({ ok: true });
    case 'log':
      log(msg.msg, msg.type);
      return Promise.resolve({ ok: true });
    case 'updateBalance':
      browser.storage.local.set({ balance: msg.balance });
      return Promise.resolve({ ok: true });
    case 'gameState':
      browser.storage.local.set({ balance: msg.balance, currentBet: msg.bet });
      return Promise.resolve({ ok: true });
  }
  return Promise.resolve({ ok: true });
});

// --- Resume on startup ---
browser.runtime.onStartup.addListener(async () => {
  const state = await browser.storage.local.get('running');
  if (state.running) {
    await log('Resuming after browser restart', 'info');
    startLoop();
  }
});

browser.runtime.onInstalled.addListener(() => {
  log('Extension installed v2.0 Firefox - PlayCanvas API mode', 'success');
});
