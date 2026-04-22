// ===========================================================
// Partouche Auto-Player v2.3 - Injected into MAIN world
// Supports Type A (playerInfo) and Type B (gameLogic) games
// Fast mode = press spin every ~1s (like holding space)
// ===========================================================

(function() {
  console.log('[PARTOUCHE BOT] Waiting for PlayCanvas...');

  let retries = 0;
  const waitForPC = setInterval(() => {
    retries++;
    if (retries > 120) { clearInterval(waitForPC); return; }
    if (typeof pc === 'undefined') return;
    const app = pc.Application?.getApplication?.();
    if (!app) return;
    const root = app.root?.findByName?.('Root');
    if (!root?.script) return;
    if (!root.script.playerInfo && !root.script.gameLogic) return;

    clearInterval(waitForPC);
    console.log('[PARTOUCHE BOT] PlayCanvas ready (' + (retries * 0.5) + 's)');
    setupBot(app);
  }, 500);

  function setupBot(app) {
    const root = app.root.findByName('Root');
    const gameType = root.script.playerInfo ? 'A' : 'B';
    const spinBtn = app.root.findByName('Spin Button');

    // --- Build adapter ---
    let getBalance, getBet, setBet, clickSpin, getBetLevels;

    if (gameType === 'A') {
      const pi = root.script.playerInfo;
      const BET_LEVELS = [500, 1000, 2500, 5000, 10000, 25000, 50000];
      getBalance = () => pi.balance;
      getBet = () => pi.bet;
      setBet = (v) => { pi.bet = v; };
      clickSpin = () => { spinBtn.fire('click'); };
      getBetLevels = () => BET_LEVELS;
    } else {
      const gl = root.script.gameLogic;
      const coinChoices = gl.coinChoices || [50, 100, 250, 500, 1250, 2500];
      const lines = gl.lines || 20;
      const BET_LEVELS = coinChoices.map(c => c * lines);
      getBalance = () => gl.balance;
      getBet = () => gl.totalBet;
      setBet = (totalBet) => {
        const targetCoin = Math.round(totalBet / lines);
        let bestCoin = coinChoices[0];
        for (const c of coinChoices) {
          if (c <= targetCoin) bestCoin = c; else break;
        }
        gl.coin = bestCoin;
      };
      // Use sendClick if available (like pressing space), fallback to inputSpin
      const bk = spinBtn?.script?.buttonKey;
      clickSpin = bk ? () => { bk.sendClick(); } : () => { gl.inputSpin(); };
      getBetLevels = () => BET_LEVELS;
    }

    function calcBet(balance, pct) {
      const levels = getBetLevels();
      const target = Math.floor(balance * pct / 100);
      let best = levels[0];
      for (const lvl of levels) {
        if (lvl <= target) best = lvl; else break;
      }
      return best;
    }

    // --- Bot state ---
    let running = false;
    let interval = null;
    let betPercent = 1;
    let fastMode = false;
    let spinCount = 0;

    // --- Overlay ---
    function makeOverlay() {
      const el = document.createElement('div');
      el.id = 'partouche-bot-overlay';
      el.style.cssText = 'position:fixed;top:8px;right:8px;background:rgba(0,0,0,0.85);color:#0f0;' +
        'font:bold 12px monospace;padding:8px 12px;border-radius:8px;z-index:999999;pointer-events:none;' +
        'border:1px solid #0f0;min-width:200px;white-space:pre;';
      document.body.appendChild(el);
      return el;
    }
    let overlay = makeOverlay();

    function setOverlay(text, color) {
      if (!overlay || !document.body.contains(overlay)) overlay = makeOverlay();
      overlay.textContent = text;
      overlay.style.color = color || '#0f0';
      overlay.style.borderColor = color || '#0f0';
    }

    function emit(type, detail) {
      window.dispatchEvent(new CustomEvent(type, { detail }));
    }

    function report() {
      emit('PARTOUCHE_BOT_STATE', { balance: getBalance(), bet: getBet(), running });
      if (running) {
        const m = fastMode ? ' FAST' : '';
        setOverlay('BOT [' + gameType + ']' + m + ' #' + spinCount + '\nBal: ' + getBalance().toLocaleString() + '\nBet: ' + getBet().toLocaleString(), fastMode ? '#ff0' : '#0f0');
      }
    }

    // --- The core loop: just click spin, like pressing space ---
    let wasPaused = false;

    function tick() {
      if (!running) return;

      // Don't click during bonus/mini-games (spin button disappears)
      if (!spinBtn.enabled || !spinBtn.button.active) {
        if (!wasPaused) {
          setOverlay('BOT PAUSED (mini-game)', '#f90');
          emit('PARTOUCHE_BOT_LOG', { msg: 'Mini-game detected, pausing...', type: 'info' });
          wasPaused = true;
        }
        return;
      }
      if (wasPaused) {
        emit('PARTOUCHE_BOT_LOG', { msg: 'Mini-game over, resuming', type: 'success' });
        wasPaused = false;
      }

      const bal = getBalance();
      if (bal < 10000) {
        stop();
        emit('PARTOUCHE_BOT_LOG', { msg: 'Balance too low (' + bal + ')', type: 'warn' });
        return;
      }

      // Set bet (only takes effect when game is idle)
      const target = calcBet(bal, betPercent);
      if (getBet() !== target) setBet(target);

      // Just click. Like pressing space.
      clickSpin();
      spinCount++;
      report();
    }

    function start(pct, fast) {
      if (running) return;
      running = true;
      betPercent = pct || 1;
      fastMode = fast;
      spinCount = 0;

      setBet(calcBet(getBalance(), betPercent));

      const ms = fastMode ? 1000 : 7000;
      console.log('[PARTOUCHE BOT] Started! type=' + gameType + ' fast=' + fast + ' interval=' + ms + 'ms');
      emit('PARTOUCHE_BOT_LOG', { msg: 'Bot started [' + gameType + '] ' + (fast ? 'FAST' : 'normal'), type: 'success' });

      interval = setInterval(tick, ms);
      setTimeout(tick, 1000);
      report();
    }

    function stop() {
      running = false;
      if (interval) { clearInterval(interval); interval = null; }
      emit('PARTOUCHE_BOT_LOG', { msg: 'Stopped after ' + spinCount + ' spins', type: 'warn' });
      setOverlay('BOT OFF', '#f44');
      report();
    }

    // --- Commands ---
    window.addEventListener('PARTOUCHE_BOT_CMD', (event) => {
      const cmd = event.detail;
      console.log('[PARTOUCHE BOT] CMD:', cmd.action);
      if (cmd.action === 'start') start(cmd.betPercent, cmd.fastMode);
      else if (cmd.action === 'stop') stop();
      else if (cmd.action === 'getState') report();
    });

    setInterval(report, 3000);

    const levels = getBetLevels();
    setOverlay('BOT READY [' + gameType + ']\nBets: ' + levels.map(l => l.toLocaleString()).join(', '), '#0ff');
    console.log('[PARTOUCHE BOT] Ready! Type=' + gameType + ' Bal=' + getBalance());
    emit('PARTOUCHE_BOT_LOG', { msg: 'Bot ready [' + gameType + ']! Bal: ' + getBalance().toLocaleString(), type: 'success' });
    report();
  }
})();
