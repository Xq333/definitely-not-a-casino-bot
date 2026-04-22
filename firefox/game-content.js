// ===========================================================
// Partouche Auto-Player v2.4 - Game Iframe Content Script
// Runs inside: https://jeux-v2.ptech.fr/* (game iframes)
//
// Detects game type and injects the right bot:
// - Slots → game-bot-inject.js
// - Blackjack → blackjack-bot-inject.js
// ===========================================================

console.log('[PARTOUCHE BOT] Content script loaded in iframe:', window.location.href);

function injectBot() {
  // Detect game type from URL
  const url = window.location.href.toLowerCase();
  const isBlackjack = url.includes('blackjack');
  const botFile = isBlackjack ? 'blackjack-bot-inject.js' : 'game-bot-inject.js';

  console.log('[PARTOUCHE BOT] Detected:', isBlackjack ? 'BLACKJACK' : 'SLOTS', '→', botFile);

  const script = document.createElement('script');
  script.src = browser.runtime.getURL(botFile);
  script.onload = () => {
    console.log('[PARTOUCHE BOT] ' + botFile + ' loaded');
    script.remove();
  };
  script.onerror = (e) => {
    console.error('[PARTOUCHE BOT] Failed to load ' + botFile, e);
  };
  (document.head || document.documentElement).appendChild(script);
}

// --- ISOLATED world bridge ---
window.addEventListener('PARTOUCHE_BOT_STATE', (event) => {
  window.parent.postMessage({ type: 'PARTOUCHE_GAME_STATE', ...event.detail }, '*');
});

window.addEventListener('PARTOUCHE_BOT_LOG', (event) => {
  window.parent.postMessage({ type: 'PARTOUCHE_GAME_LOG', ...event.detail }, '*');
});

window.addEventListener('message', (event) => {
  if (event.data?.type === 'PARTOUCHE_AUTO') {
    console.log('[PARTOUCHE BOT] Received command from parent:', event.data.action);
    window.dispatchEvent(new CustomEvent('PARTOUCHE_BOT_CMD', { detail: event.data }));
  }
});

setTimeout(injectBot, 3000);

// Auto-restart: if the iframe reloaded (e.g. after error), check if bot should be running
setTimeout(async () => {
  try {
    const state = await browser.storage.local.get(['running', 'toggleSlots', 'slotGame', 'betPercent', 'toggleFast', 'takeProfit', 'bjBet', 'bjHands']);
    if (state.running && state.toggleSlots !== false) {
      console.log('[PARTOUCHE BOT] Auto-restarting bot after reload...');
      // Wait for the injected bot to be ready
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('PARTOUCHE_BOT_CMD', {
          detail: {
            action: 'start',
            betPercent: state.betPercent || 1,
            fastMode: !!state.toggleFast,
            takeProfit: state.takeProfit || 0,
            betAmount: state.bjBet || 1000,
            numHands: state.bjHands || 1,
          }
        }));
      }, 5000);
    }
  } catch(e) {}
}, 4000);
