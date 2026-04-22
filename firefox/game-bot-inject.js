// ===========================================================
// Partouche Auto-Player v2.1 - Injected into MAIN world
// This file runs in the page context with access to PlayCanvas
// ===========================================================

(function() {
  console.log('[PARTOUCHE BOT] Main world bot starting, waiting for PlayCanvas...');

  let retries = 0;
  const waitForPC = setInterval(() => {
    retries++;
    if (retries > 120) {
      clearInterval(waitForPC);
      console.error('[PARTOUCHE BOT] Gave up waiting for PlayCanvas after 60s');
      return;
    }
    if (typeof pc === 'undefined') return;
    const app = pc.Application?.getApplication?.();
    if (!app) return;
    const root = app.root?.findByName?.('Root');
    if (!root?.script?.playerInfo) return;

    clearInterval(waitForPC);
    console.log('[PARTOUCHE BOT] PlayCanvas ready after ' + (retries * 0.5) + 's');
    setupBot(app);
  }, 500);

  function setupBot(app) {
    const root = app.root.findByName('Root');
    const pi = root.script.playerInfo;
    const spinBtn = app.root.findByName('Spin Button');

    let botRunning = false;
    let spinInterval = null;
    let betPercent = 1;
    let spinCount = 0;

    const BET_LEVELS = [500, 1000, 2500, 5000, 10000, 25000, 50000];

    function calcBet(balance, pct) {
      const target = Math.floor(balance * pct / 100);
      let best = BET_LEVELS[0];
      for (const lvl of BET_LEVELS) {
        if (lvl <= target) best = lvl;
        else break;
      }
      return best;
    }

    // --- On-page status overlay ---
    function createOverlay() {
      const el = document.createElement('div');
      el.id = 'partouche-bot-overlay';
      el.style.cssText = 'position:fixed;top:8px;right:8px;background:rgba(0,0,0,0.85);color:#0f0;' +
        'font:bold 12px monospace;padding:8px 12px;border-radius:8px;z-index:999999;pointer-events:none;' +
        'border:1px solid #0f0;min-width:180px;white-space:pre;';
      el.textContent = 'BOT: waiting...';
      document.body.appendChild(el);
      return el;
    }

    let overlay = createOverlay();

    function updateOverlay(text, color) {
      if (!overlay || !document.body.contains(overlay)) overlay = createOverlay();
      overlay.textContent = text;
      overlay.style.color = color || '#0f0';
      overlay.style.borderColor = color || '#0f0';
    }

    function emit(type, detail) {
      window.dispatchEvent(new CustomEvent(type, { detail }));
    }

    function reportState() {
      emit('PARTOUCHE_BOT_STATE', {
        balance: pi.balance, bet: pi.bet, lastWin: pi.lastWin,
        freespin: pi.freespin, gameplay: pi.gameplay, running: botRunning,
      });
      if (botRunning) {
        updateOverlay(
          'BOT ON | Spins: ' + spinCount + '\n' +
          'Bal: ' + pi.balance.toLocaleString() + '\n' +
          'Bet: ' + pi.bet.toLocaleString(),
          '#0f0'
        );
      }
    }

    function doSpin() {
      if (!botRunning) return;
      const balance = pi.balance;

      if (balance < 10000) {
        stopBot();
        emit('PARTOUCHE_BOT_LOG', { msg: 'Balance too low (' + balance + '), stopping', type: 'warn' });
        return;
      }

      if (pi.gameplay !== 0) {
        console.log('[PARTOUCHE BOT] Waiting, gameplay=' + pi.gameplay);
        return;
      }

      const targetBet = calcBet(balance, betPercent);
      if (pi.bet !== targetBet) {
        pi.bet = targetBet;
        emit('PARTOUCHE_BOT_LOG', {
          msg: 'Bet: ' + targetBet.toLocaleString() + ' (' + betPercent + '% of ' + balance.toLocaleString() + ')',
          type: 'info'
        });
      }

      spinBtn.fire('click');
      spinCount++;
      console.log('[PARTOUCHE BOT] Spin #' + spinCount + ' bal=' + balance + ' bet=' + pi.bet);
      reportState();
    }

    function startBot(pct) {
      if (botRunning) return;
      botRunning = true;
      betPercent = pct || 1;
      spinCount = 0;

      const targetBet = calcBet(pi.balance, betPercent);
      pi.bet = targetBet;

      console.log('[PARTOUCHE BOT] Started! bet=' + targetBet + ' pct=' + betPercent);
      emit('PARTOUCHE_BOT_LOG', {
        msg: 'Bot started! Bet: ' + targetBet.toLocaleString() + ' (' + betPercent + '%)',
        type: 'success'
      });
      updateOverlay('BOT ON | Starting...', '#0f0');

      spinInterval = setInterval(doSpin, 7000);
      setTimeout(doSpin, 2000);
      reportState();
    }

    function stopBot() {
      botRunning = false;
      if (spinInterval) { clearInterval(spinInterval); spinInterval = null; }
      emit('PARTOUCHE_BOT_LOG', { msg: 'Bot stopped after ' + spinCount + ' spins', type: 'warn' });
      updateOverlay('BOT OFF', '#f44');
      reportState();
    }

    window.addEventListener('PARTOUCHE_BOT_CMD', (event) => {
      const cmd = event.detail;
      console.log('[PARTOUCHE BOT] Command:', cmd.action);
      switch (cmd.action) {
        case 'start': startBot(cmd.betPercent || 1); break;
        case 'stop': stopBot(); break;
        case 'spin':
          if (pi.gameplay === 0) spinBtn.fire('click');
          break;
        case 'setBet': pi.bet = cmd.value; reportState(); break;
        case 'getState': reportState(); break;
      }
    });

    setInterval(reportState, 3000);

    updateOverlay('BOT READY', '#0ff');
    console.log('[PARTOUCHE BOT] Setup complete. Balance: ' + pi.balance);
    emit('PARTOUCHE_BOT_LOG', { msg: 'Game bot ready! Balance: ' + pi.balance.toLocaleString(), type: 'success' });
    reportState();
  }
})();
