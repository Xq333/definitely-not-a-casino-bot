// ===========================================================
// Partouche Online Auto-Player v2 - Content Script
// Runs on: https://online.partouche.com/*
// ===========================================================

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function bgLog(msg, type = 'info') {
  chrome.runtime.sendMessage({ action: 'log', msg, type }).catch(() => {});
}

// --- Balance reading from DOM ---
function getBalance() {
  const headerLink = document.querySelector('a[href*="popup=Menu"]');
  if (headerLink) {
    for (const node of headerLink.querySelectorAll('div, span')) {
      const text = node.textContent.trim();
      if (/^[\d\s]+$/.test(text)) {
        const num = parseInt(text.replace(/\s/g, ''));
        if (num > 100) return num;
      }
    }
  }
  return null;
}

// --- Dismiss all overlays ---
function dismissOverlays() {
  document.querySelectorAll('.calendarPopup, .popupBack').forEach(el => {
    el.style.display = 'none';
  });
  document.querySelectorAll('button').forEach(btn => {
    if (btn.textContent.trim() === 'Tout refuser') btn.click();
  });
}

// --- Daily Bonus ---
async function claimDailyBonus() {
  if (window.location.pathname !== '/calendrier' && window.location.pathname !== '/') {
    window.location.href = '/';
    return { success: false, error: 'Navigating to home...' };
  }
  await wait(2000);

  const popup = document.querySelector('.calendarPopup');
  if (!popup || getComputedStyle(popup).display === 'none') {
    return { success: false, error: 'Calendar popup not visible' };
  }

  // Find the claimable day (no checkmark, has action text)
  const days = popup.querySelectorAll('.calendar > div');
  for (const day of days) {
    const text = day.textContent.toLowerCase();
    if (text.includes('ouvrir') || text.includes('lancer') || text.includes('tirage')) {
      const img = day.querySelector('img[src*="check"], svg');
      const style = getComputedStyle(day);
      // Skip already-claimed days (typically have a check or different style)
      if (img) continue;

      day.click();
      await wait(2000);
      bgLog('Daily bonus claimed!', 'success');
      return { success: true };
    }
  }
  return { success: false, error: 'No bonus available today' };
}

// --- Daily Wheel ---
async function spinDailyWheel() {
  if (!window.location.pathname.startsWith('/wheel')) {
    window.location.href = '/wheel';
    return { success: false, error: 'Navigating to wheel...' };
  }

  dismissOverlays();
  await wait(1500);

  // Find the Daily Wheel section
  const els = document.querySelectorAll('div');
  for (const el of els) {
    if (!el.textContent.includes('Daily Wheel')) continue;
    const timer = el.textContent.match(/(\d{2}:\d{2}:\d{2})/);
    if (timer) {
      return { success: false, error: `Wheel cooldown: ${timer[1]}` };
    }
    el.click();
    await wait(3000);
    bgLog('Daily wheel spun!', 'success');
    return { success: true };
  }
  return { success: false, error: 'Daily wheel not found' };
}

// --- Slot Auto-Play ---
async function startSlotPlay(game, betPercent, fastMode, bjBet, bjHands) {
  const gamePath = `/jeux-casino-gratuit/${game}`;

  if (window.location.pathname !== gamePath) {
    window.location.href = gamePath;
    return { success: false, error: 'Navigating to game...' };
  }

  dismissOverlays();
  await wait(2000);

  const iframe = document.querySelector('#game');
  if (!iframe) {
    return { success: false, error: 'Game iframe not found' };
  }

  // Send start command to game bot inside iframe
  iframe.contentWindow.postMessage({
    type: 'PARTOUCHE_AUTO',
    action: 'start',
    betPercent: betPercent || 1,
    fastMode: !!fastMode,
    betAmount: bjBet || 1000,
    numHands: bjHands || 1,
  }, '*');

  return { success: true };
}

async function stopSlotPlay() {
  const iframe = document.querySelector('#game');
  if (iframe) {
    iframe.contentWindow.postMessage({
      type: 'PARTOUCHE_AUTO',
      action: 'stop',
    }, '*');
  }
  return { success: true };
}

// --- Message Handler (from background.js) ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handle = async () => {
    switch (msg.action) {
      case 'getBalance':
        return { balance: getBalance() };
      case 'claimDailyBonus':
        return await claimDailyBonus();
      case 'spinDailyWheel':
        return await spinDailyWheel();
      case 'startSlotPlay':
        return await startSlotPlay(msg.game, msg.betPercent, msg.fastMode, msg.bjBet, msg.bjHands);
      case 'stopSlotPlay':
        return await stopSlotPlay();
      case 'dismissOverlays':
        dismissOverlays();
        return { success: true };
      case 'ping':
        return { pong: true, path: window.location.pathname };
      default:
        return { error: 'Unknown action' };
    }
  };
  handle().then(sendResponse).catch(err => sendResponse({ error: err.message }));
  return true;
});

// --- Listen for state/log from game iframe ---
window.addEventListener('message', (event) => {
  if (event.data?.type === 'PARTOUCHE_GAME_STATE') {
    chrome.runtime.sendMessage({
      action: 'gameState',
      balance: event.data.balance,
      bet: event.data.bet,
      lastWin: event.data.lastWin,
      running: event.data.running,
    }).catch(() => {});
  }
  if (event.data?.type === 'PARTOUCHE_GAME_LOG') {
    bgLog(event.data.msg, event.data.type);
  }
});

// --- Auto-actions on page load ---
window.addEventListener('load', () => {
  setTimeout(dismissOverlays, 2000);

  // If on a game page and automation is running, auto-start the bot
  setTimeout(async () => {
    const state = await chrome.storage.local.get(['running', 'toggleSlots', 'slotGame', 'betPercent', 'toggleFast', 'bjBet', 'bjHands']);
    if (!state.running || state.toggleSlots === false) return;

    const expectedPath = `/jeux-casino-gratuit/${state.slotGame || 'slots-joker'}`;
    if (window.location.pathname === expectedPath) {
      bgLog('On game page, sending start to bot...', 'info');
      await wait(5000);
      dismissOverlays();
      const iframe = document.querySelector('#game');
      if (iframe) {
        iframe.contentWindow.postMessage({
          type: 'PARTOUCHE_AUTO',
          action: 'start',
          betPercent: state.betPercent || 1,
          fastMode: !!state.toggleFast,
          betAmount: state.bjBet || 1000,
          numHands: state.bjHands || 1,
        }, '*');
      }
    }
  }, 3000);

  // Periodic balance report
  setInterval(() => {
    const balance = getBalance();
    if (balance) {
      chrome.runtime.sendMessage({ action: 'updateBalance', balance }).catch(() => {});
    }
  }, 10000);

  // Initial balance
  setTimeout(() => {
    const balance = getBalance();
    if (balance) chrome.runtime.sendMessage({ action: 'updateBalance', balance }).catch(() => {});
  }, 2000);
});
