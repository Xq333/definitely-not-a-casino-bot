// ===========================================================
// Partouche Auto-Player v2 - Game Iframe Content Script
// Runs inside: https://jeux-v2.ptech.fr/* (game iframes)
//
// Strategy: inject a <script> into the MAIN world to access
// the PlayCanvas engine API directly.
// Communication: MAIN world <-> ISOLATED world via CustomEvent
// ===========================================================

// --- Inject into the page's MAIN world ---
function injectGameBot() {
  const script = document.createElement('script');
  script.textContent = `(${mainWorldBot.toString()})();`;
  document.documentElement.appendChild(script);
  script.remove();
}

// --- This function runs in the page's MAIN world ---
function mainWorldBot() {
  // Wait for PlayCanvas to be ready
  let retries = 0;
  const waitForPC = setInterval(() => {
    retries++;
    if (retries > 60) { clearInterval(waitForPC); return; } // give up after 30s

    if (typeof pc === 'undefined') return;
    const app = pc.Application?.getApplication?.();
    if (!app) return;
    const root = app.root?.findByName?.('Root');
    if (!root?.script?.playerInfo) return;

    clearInterval(waitForPC);
    setupBot(app);
  }, 500);

  function setupBot(app) {
    const root = app.root.findByName('Root');
    const pi = root.script.playerInfo;
    const spinBtn = app.root.findByName('Spin Button');
    const autoPlayBtn = app.root.findByName('AutoPlay Button');

    let botRunning = false;
    let spinInterval = null;
    let betPercent = 1; // 1% of balance

    // --- Smart bet calculation ---
    // Bet = balance * betPercent / 100, rounded down to nearest 1000
    // Min 1000, max 100000
    function calcBet(balance, pct) {
      const raw = Math.floor(balance * pct / 100);
      const rounded = Math.max(1000, Math.floor(raw / 1000) * 1000);
      return Math.min(rounded, 100000);
    }

    // --- Report state to content script ---
    function reportState() {
      window.dispatchEvent(new CustomEvent('PARTOUCHE_BOT_STATE', {
        detail: {
          balance: pi.balance,
          bet: pi.bet,
          lastWin: pi.lastWin,
          freespin: pi.freespin,
          gameplay: pi.gameplay,
          running: botRunning,
        }
      }));
    }

    // --- Spin logic ---
    function doSpin() {
      if (!botRunning) return;

      const balance = pi.balance;

      // Safety: stop if balance is very low
      if (balance < 10000) {
        stopBot();
        window.dispatchEvent(new CustomEvent('PARTOUCHE_BOT_LOG', {
          detail: { msg: 'Balance too low (' + balance + '), stopping', type: 'warn' }
        }));
        return;
      }

      // Calculate and set smart bet
      const targetBet = calcBet(balance, betPercent);
      if (pi.bet !== targetBet) {
        pi.bet = targetBet;
        window.dispatchEvent(new CustomEvent('PARTOUCHE_BOT_LOG', {
          detail: { msg: 'Bet adjusted to ' + targetBet.toLocaleString() + ' (balance: ' + balance.toLocaleString() + ')', type: 'info' }
        }));
      }

      // Only spin if game is idle (gameplay === 0)
      if (pi.gameplay === 0 && spinBtn?.button?.active) {
        spinBtn.fire('click');
      }

      reportState();
    }

    // --- Start / Stop ---
    function startBot(pct) {
      if (botRunning) return;
      botRunning = true;
      betPercent = pct || 1;

      // Initial bet set
      const targetBet = calcBet(pi.balance, betPercent);
      pi.bet = targetBet;

      window.dispatchEvent(new CustomEvent('PARTOUCHE_BOT_LOG', {
        detail: { msg: 'Bot started! Bet: ' + targetBet.toLocaleString() + ' (' + betPercent + '% of balance)', type: 'success' }
      }));

      // Spin every 5 seconds (enough time for animations)
      spinInterval = setInterval(doSpin, 5000);
      // Also do first spin immediately after a short delay
      setTimeout(doSpin, 1000);

      reportState();
    }

    function stopBot() {
      botRunning = false;
      if (spinInterval) {
        clearInterval(spinInterval);
        spinInterval = null;
      }
      window.dispatchEvent(new CustomEvent('PARTOUCHE_BOT_LOG', {
        detail: { msg: 'Bot stopped', type: 'warn' }
      }));
      reportState();
    }

    // --- Listen for commands from content script ---
    window.addEventListener('PARTOUCHE_BOT_CMD', (event) => {
      const cmd = event.detail;
      switch (cmd.action) {
        case 'start':
          startBot(cmd.betPercent || 1);
          break;
        case 'stop':
          stopBot();
          break;
        case 'spin':
          if (pi.gameplay === 0 && spinBtn?.button?.active) {
            spinBtn.fire('click');
          }
          break;
        case 'setBet':
          pi.bet = cmd.value;
          reportState();
          break;
        case 'getState':
          reportState();
          break;
      }
    });

    // Report state periodically
    setInterval(reportState, 3000);

    // Notify ready
    window.dispatchEvent(new CustomEvent('PARTOUCHE_BOT_LOG', {
      detail: { msg: 'Game bot ready! PlayCanvas engine detected.', type: 'success' }
    }));
    reportState();
  }
}

// --- Content script (ISOLATED world) ---
// Bridge between the injected MAIN world script and the extension

// Forward state to the parent page (content.js on partouche.com)
window.addEventListener('PARTOUCHE_BOT_STATE', (event) => {
  window.parent.postMessage({
    type: 'PARTOUCHE_GAME_STATE',
    ...event.detail
  }, '*');
});

// Forward logs to the parent page
window.addEventListener('PARTOUCHE_BOT_LOG', (event) => {
  window.parent.postMessage({
    type: 'PARTOUCHE_GAME_LOG',
    ...event.detail
  }, '*');
});

// Listen for commands from parent page (content.js)
window.addEventListener('message', (event) => {
  if (event.data?.type === 'PARTOUCHE_AUTO') {
    window.dispatchEvent(new CustomEvent('PARTOUCHE_BOT_CMD', {
      detail: event.data
    }));
  }
});

// Inject the bot after a short delay to let the game load
setTimeout(injectGameBot, 2000);
