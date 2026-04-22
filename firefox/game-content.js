// ===========================================================
// Partouche Auto-Player v2 (Firefox) - Game Iframe Content Script
// Runs inside: https://jeux-v2.ptech.fr/* (game iframes)
//
// Injects into MAIN world to access PlayCanvas engine API.
// Firefox supports page script injection via <script> tag or
// wrappedJSObject / exportFunction for cross-world access.
// ===========================================================

function injectGameBot() {
  // Firefox method: inject via script tag into the page's MAIN world
  const script = document.createElement('script');
  script.textContent = `(${mainWorldBot.toString()})();`;
  document.documentElement.appendChild(script);
  script.remove();
}

function mainWorldBot() {
  let retries = 0;
  const waitForPC = setInterval(() => {
    retries++;
    if (retries > 60) { clearInterval(waitForPC); return; }

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

    let botRunning = false;
    let spinInterval = null;
    let betPercent = 1;

    function calcBet(balance, pct) {
      const raw = Math.floor(balance * pct / 100);
      const rounded = Math.max(1000, Math.floor(raw / 1000) * 1000);
      return Math.min(rounded, 100000);
    }

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

    function doSpin() {
      if (!botRunning) return;

      const balance = pi.balance;
      if (balance < 10000) {
        stopBot();
        window.dispatchEvent(new CustomEvent('PARTOUCHE_BOT_LOG', {
          detail: { msg: 'Balance too low (' + balance + '), stopping', type: 'warn' }
        }));
        return;
      }

      const targetBet = calcBet(balance, betPercent);
      if (pi.bet !== targetBet) {
        pi.bet = targetBet;
        window.dispatchEvent(new CustomEvent('PARTOUCHE_BOT_LOG', {
          detail: { msg: 'Bet adjusted to ' + targetBet.toLocaleString() + ' (balance: ' + balance.toLocaleString() + ')', type: 'info' }
        }));
      }

      if (pi.gameplay === 0 && spinBtn?.button?.active) {
        spinBtn.fire('click');
      }

      reportState();
    }

    function startBot(pct) {
      if (botRunning) return;
      botRunning = true;
      betPercent = pct || 1;

      const targetBet = calcBet(pi.balance, betPercent);
      pi.bet = targetBet;

      window.dispatchEvent(new CustomEvent('PARTOUCHE_BOT_LOG', {
        detail: { msg: 'Bot started! Bet: ' + targetBet.toLocaleString() + ' (' + betPercent + '% of balance)', type: 'success' }
      }));

      spinInterval = setInterval(doSpin, 5000);
      setTimeout(doSpin, 1000);
      reportState();
    }

    function stopBot() {
      botRunning = false;
      if (spinInterval) { clearInterval(spinInterval); spinInterval = null; }
      window.dispatchEvent(new CustomEvent('PARTOUCHE_BOT_LOG', {
        detail: { msg: 'Bot stopped', type: 'warn' }
      }));
      reportState();
    }

    window.addEventListener('PARTOUCHE_BOT_CMD', (event) => {
      const cmd = event.detail;
      switch (cmd.action) {
        case 'start': startBot(cmd.betPercent || 1); break;
        case 'stop': stopBot(); break;
        case 'spin':
          if (pi.gameplay === 0 && spinBtn?.button?.active) spinBtn.fire('click');
          break;
        case 'setBet': pi.bet = cmd.value; reportState(); break;
        case 'getState': reportState(); break;
      }
    });

    setInterval(reportState, 3000);

    window.dispatchEvent(new CustomEvent('PARTOUCHE_BOT_LOG', {
      detail: { msg: 'Game bot ready! PlayCanvas engine detected.', type: 'success' }
    }));
    reportState();
  }
}

// --- Content script (ISOLATED world) - bridge ---
window.addEventListener('PARTOUCHE_BOT_STATE', (event) => {
  window.parent.postMessage({ type: 'PARTOUCHE_GAME_STATE', ...event.detail }, '*');
});

window.addEventListener('PARTOUCHE_BOT_LOG', (event) => {
  window.parent.postMessage({ type: 'PARTOUCHE_GAME_LOG', ...event.detail }, '*');
});

window.addEventListener('message', (event) => {
  if (event.data?.type === 'PARTOUCHE_AUTO') {
    window.dispatchEvent(new CustomEvent('PARTOUCHE_BOT_CMD', { detail: event.data }));
  }
});

setTimeout(injectGameBot, 2000);
