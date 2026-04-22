// ===========================================================
// Partouche Auto-Player v2.1 - Game Iframe Content Script
// Runs inside: https://jeux-v2.ptech.fr/* (game iframes)
//
// Injects game-bot-inject.js into the MAIN world via script.src
// (avoids CSP inline script blocking)
// ===========================================================

console.log('[PARTOUCHE BOT] Content script loaded in iframe:', window.location.href);

function injectGameBot() {
  console.log('[PARTOUCHE BOT] Injecting bot via script.src...');
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('game-bot-inject.js');
  script.onload = () => {
    console.log('[PARTOUCHE BOT] Inject script loaded successfully');
    script.remove();
  };
  script.onerror = (e) => {
    console.error('[PARTOUCHE BOT] Failed to load inject script:', e);
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

// Inject after delay for game to start loading
setTimeout(injectGameBot, 3000);
