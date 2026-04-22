// ===========================================================
// Partouche Auto-Player v2.2 - Injected into MAIN world
// Supports both game engine types:
//   Type A (Joker, etc): Root > playerInfo script
//   Type B (Megapot, etc): Root > gameLogic script
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
    if (!root?.script) return;

    // Detect game type
    const hasPlayerInfo = !!root.script.playerInfo;
    const hasGameLogic = !!root.script.gameLogic;
    if (!hasPlayerInfo && !hasGameLogic) return; // not ready yet

    clearInterval(waitForPC);
    const type = hasPlayerInfo ? 'A' : 'B';
    console.log('[PARTOUCHE BOT] PlayCanvas ready (' + (retries * 0.5) + 's), game type ' + type);
    setupBot(app, type);
  }, 500);

  function setupBot(app, gameType) {
    const root = app.root.findByName('Root');

    // --- Game adapter: unifies both engine types ---
    let adapter;

    if (gameType === 'A') {
      // Type A: playerInfo (Joker, Classic Wild, etc.)
      const pi = root.script.playerInfo;
      const spinBtn = app.root.findByName('Spin Button');
      const BET_LEVELS = [500, 1000, 2500, 5000, 10000, 25000, 50000];

      adapter = {
        getBalance()  { return pi.balance; },
        getBet()      { return pi.bet; },
        setBet(v)     { pi.bet = v; },
        isIdle()      { return pi.gameplay === 0; },
        canSpin()     { return spinBtn.button.active; },
        spin()        { spinBtn.fire('click'); },
        getBetLevels() { return BET_LEVELS; },
        calcBet(balance, pct) {
          const target = Math.floor(balance * pct / 100);
          let best = BET_LEVELS[0];
          for (const lvl of BET_LEVELS) {
            if (lvl <= target) best = lvl; else break;
          }
          return best;
        },
      };
    } else {
      // Type B: gameLogic (Megapot, etc.)
      const gl = root.script.gameLogic;
      const coinChoices = gl.coinChoices || [50, 100, 250, 500, 1250, 2500];
      const lines = gl.lines || 20;
      const BET_LEVELS = coinChoices.map(c => c * lines);

      adapter = {
        getBalance()  { return gl.balance; },
        getBet()      { return gl.totalBet; },
        setBet(totalBet) {
          // Find the coin value that gives us the closest totalBet
          const targetCoin = Math.round(totalBet / lines);
          let bestCoin = coinChoices[0];
          for (const c of coinChoices) {
            if (c <= targetCoin) bestCoin = c; else break;
          }
          gl.coin = bestCoin;
        },
        isIdle()      { return gl.state === 1; },
        canSpin()     { return gl.canSpin; },
        spin()        { gl.inputSpin(); },
        getBetLevels() { return BET_LEVELS; },
        calcBet(balance, pct) {
          const target = Math.floor(balance * pct / 100);
          let best = BET_LEVELS[0];
          for (const lvl of BET_LEVELS) {
            if (lvl <= target) best = lvl; else break;
          }
          return best;
        },
      };
    }

    // --- Bot logic (engine-agnostic) ---
    let botRunning = false;
    let spinInterval = null;
    let betPercent = 1;
    let spinCount = 0;
    let fastMode = false;

    function createOverlay() {
      const el = document.createElement('div');
      el.id = 'partouche-bot-overlay';
      el.style.cssText = 'position:fixed;top:8px;right:8px;background:rgba(0,0,0,0.85);color:#0f0;' +
        'font:bold 12px monospace;padding:8px 12px;border-radius:8px;z-index:999999;pointer-events:none;' +
        'border:1px solid #0f0;min-width:200px;white-space:pre;';
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
        balance: adapter.getBalance(),
        bet: adapter.getBet(),
        running: botRunning,
      });
      if (botRunning) {
        const mode = fastMode ? ' FAST' : '';
        updateOverlay(
          'BOT ON [' + gameType + ']' + mode + ' #' + spinCount + '\n' +
          'Bal: ' + adapter.getBalance().toLocaleString() + '\n' +
          'Bet: ' + adapter.getBet().toLocaleString(),
          fastMode ? '#ff0' : '#0f0'
        );
      }
    }

    // --- Fast mode spin loop ---
    // Fast mode: click to spin, wait, click again to speed up reels, wait for idle, repeat
    async function fastSpin() {
      if (!botRunning || !fastMode) return;
      const balance = adapter.getBalance();

      if (balance < 10000) {
        stopBot();
        emit('PARTOUCHE_BOT_LOG', { msg: 'Balance too low (' + balance + '), stopping', type: 'warn' });
        return;
      }

      // Set bet
      const targetBet = adapter.calcBet(balance, betPercent);
      if (adapter.getBet() !== targetBet) adapter.setBet(targetBet);

      // 1. Wait for spin button to be available
      while (botRunning && fastMode && !adapter.canSpin()) {
        await sleep(200);
      }
      if (!botRunning || !fastMode) return;

      // 2. Click to start spin
      adapter.spin();
      spinCount++;
      reportState();

      // 3. Wait 300ms then click again to speed up reels
      await sleep(300);
      if (!botRunning || !fastMode) return;
      adapter.spin();

      // 4. Wait until game returns to idle
      while (botRunning && fastMode && !adapter.isIdle()) {
        await sleep(200);
      }
      if (!botRunning || !fastMode) return;

      // 5. Wait for win display to finish, then loop
      await sleep(500);
      if (botRunning && fastMode) fastSpin();
    }

    function sleep(ms) {
      return new Promise(r => setTimeout(r, ms));
    }

    // --- Normal mode spin (simple interval) ---
    function doSpin() {
      if (!botRunning) return;
      const balance = adapter.getBalance();

      if (balance < 10000) {
        stopBot();
        emit('PARTOUCHE_BOT_LOG', { msg: 'Balance too low (' + balance + '), stopping', type: 'warn' });
        return;
      }

      if (!adapter.isIdle()) return;

      const targetBet = adapter.calcBet(balance, betPercent);
      if (adapter.getBet() !== targetBet) {
        adapter.setBet(targetBet);
        emit('PARTOUCHE_BOT_LOG', {
          msg: 'Bet: ' + adapter.getBet().toLocaleString() + ' (' + betPercent + '% of ' + balance.toLocaleString() + ')',
          type: 'info'
        });
      }

      adapter.spin();
      spinCount++;
      console.log('[PARTOUCHE BOT] Spin #' + spinCount + ' bal=' + balance + ' bet=' + adapter.getBet());
      reportState();
    }

    function startBot(pct) {
      if (botRunning) return;
      botRunning = true;
      betPercent = pct || 1;
      spinCount = 0;

      const targetBet = adapter.calcBet(adapter.getBalance(), betPercent);
      adapter.setBet(targetBet);

      console.log('[PARTOUCHE BOT] Started! type=' + gameType + ' bet=' + adapter.getBet() + ' pct=' + betPercent);
      emit('PARTOUCHE_BOT_LOG', {
        msg: 'Bot started [' + gameType + ']! Bet: ' + adapter.getBet().toLocaleString() + ' (' + betPercent + '%)',
        type: 'success'
      });
      updateOverlay('BOT ON [' + gameType + '] Starting...', '#0f0');

      if (fastMode) {
        // Fast mode: async loop that reacts to game state
        setTimeout(fastSpin, 2000);
      } else {
        // Normal mode: simple interval
        spinInterval = setInterval(doSpin, 7000);
        setTimeout(doSpin, 2000);
      }
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
        case 'start':
          fastMode = !!cmd.fastMode;
          startBot(cmd.betPercent || 1);
          break;
        case 'stop': stopBot(); break;
        case 'spin': if (adapter.isIdle()) adapter.spin(); break;
        case 'getState': reportState(); break;
      }
    });

    setInterval(reportState, 3000);

    const levels = adapter.getBetLevels();
    updateOverlay('BOT READY [' + gameType + ']\nBets: ' + levels.map(l => l.toLocaleString()).join(', '), '#0ff');
    console.log('[PARTOUCHE BOT] Ready! Type=' + gameType + ' Bal=' + adapter.getBalance() + ' Bets=' + JSON.stringify(levels));
    emit('PARTOUCHE_BOT_LOG', { msg: 'Bot ready [' + gameType + ']! Balance: ' + adapter.getBalance().toLocaleString(), type: 'success' });
    reportState();
  }
})();
