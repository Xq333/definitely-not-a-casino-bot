// ===========================================================
// Partouche Blackjack Bot v2 - Injected into MAIN world
// Basic strategy + Hi-Lo card counting
// Reads cards via spriteFrame, no dependency on onResult
// ===========================================================

(function() {
  console.log('[BJ BOT] Waiting for PlayCanvas...');

  let retries = 0;
  const waitForPC = setInterval(() => {
    retries++;
    if (retries > 120) { clearInterval(waitForPC); return; }
    if (typeof pc === 'undefined') return;
    const app = pc.Application?.getApplication?.();
    if (!app) return;
    const root = app.root?.findByName?.('Root');
    const gl = root?.script?.gameLogic;
    if (!gl || !gl.inputHit) return;

    clearInterval(waitForPC);
    console.log('[BJ BOT] Blackjack detected!');
    setupBot(app, gl);
  }, 500);

  function setupBot(app, gl) {
    const table = gl.table;

    let running = false;
    let interval = null;
    let betAmount = 1000;
    let numHands = 1;
    let runningCount = 0;
    let cardsDealt = 0;
    let roundInProgress = false;

    // --- Overlay ---
    function makeOverlay() {
      let el = document.getElementById('bj-bot-overlay');
      if (el) return el;
      el = document.createElement('div');
      el.id = 'bj-bot-overlay';
      el.style.cssText = 'position:fixed;top:8px;right:8px;background:rgba(0,0,0,0.9);color:#0f0;' +
        'font:bold 11px monospace;padding:10px 14px;border-radius:8px;z-index:999999;pointer-events:none;' +
        'border:1px solid #0f0;min-width:250px;white-space:pre;line-height:1.5;';
      document.body.appendChild(el);
      return el;
    }
    function setOverlay(text, color) {
      const el = makeOverlay();
      el.textContent = text;
      el.style.color = color || '#0f0';
      el.style.borderColor = color || '#0f0';
    }
    function emit(type, detail) {
      window.dispatchEvent(new CustomEvent(type, { detail }));
    }

    // --- Sprite frame → card rank mapping ---
    // 4 suits x 13 ranks. Frame = suit*13 + rank_index
    // rank_index: 0=A, 1=2, 2=3, ..., 8=9, 9=10, 10=J, 11=Q, 12=K
    function frameToRank(frame) {
      const rankIdx = frame % 13;
      const ranks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10]; // A=1, J/Q/K=10
      return ranks[rankIdx];
    }

    function frameToName(frame) {
      const rankIdx = frame % 13;
      const suitIdx = Math.floor(frame / 13);
      const names = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
      const suits = ['♠','♥','♦','♣'];
      return names[rankIdx] + (suits[suitIdx] || '?');
    }

    // --- Read cards from hand entity ---
    function readHand(handEntity) {
      const cards = [];
      if (!handEntity || !handEntity.children) return cards;
      for (const child of handEntity.children) {
        if (child.name !== 'Card') continue;
        const face = child.children?.[0];
        if (!face) continue;
        const frame = face.element?.spriteFrame;
        if (frame === undefined || frame === null) continue;
        // Skip face-down cards (flipped)
        const cardScript = child.script?.card;
        if (cardScript && !cardScript.flipped) {
          // face-down card, skip
          continue;
        }
        cards.push({ frame, rank: frameToRank(frame), name: frameToName(frame) });
      }
      return cards;
    }

    function handTotal(cards) {
      let total = 0, aces = 0;
      for (const c of cards) {
        if (c.rank === 1) { total += 11; aces++; }
        else { total += c.rank; }
      }
      while (total > 21 && aces > 0) { total -= 10; aces--; }
      return { total, soft: aces > 0 };
    }

    // --- Card counting (Hi-Lo) ---
    function hiLoValue(rank) {
      if (rank >= 2 && rank <= 6) return 1;
      if (rank >= 7 && rank <= 9) return 0;
      return -1; // 10, J, Q, K, A
    }

    // --- Basic Strategy ---
    function basicStrategy(total, soft, canSplit, dealerUp, pairRank) {
      if (canSplit && pairRank) {
        if (pairRank === 1 || pairRank === 8) return 'P';
        if (pairRank === 10 || pairRank === 5) return basicStrategy(total, false, false, dealerUp);
        if (pairRank === 4) return (dealerUp >= 5 && dealerUp <= 6) ? 'P' : 'H';
        if (pairRank === 9) return (dealerUp === 7 || dealerUp >= 10) ? 'S' : 'P';
        if (pairRank === 7) return dealerUp <= 7 ? 'P' : 'H';
        if (pairRank === 6) return dealerUp <= 6 ? 'P' : 'H';
        if (pairRank === 3 || pairRank === 2) return dealerUp <= 7 ? 'P' : 'H';
      }
      if (soft) {
        if (total >= 19) return 'S';
        if (total === 18) return dealerUp <= 8 ? 'S' : 'H';
        if (total === 17) return (dealerUp >= 3 && dealerUp <= 6) ? 'D' : 'H';
        if (total >= 15) return (dealerUp >= 4 && dealerUp <= 6) ? 'D' : 'H';
        return (dealerUp >= 5 && dealerUp <= 6) ? 'D' : 'H';
      }
      if (total >= 17) return 'S';
      if (total >= 13) return dealerUp <= 6 ? 'S' : 'H';
      if (total === 12) return (dealerUp >= 4 && dealerUp <= 6) ? 'S' : 'H';
      if (total === 11) return 'D';
      if (total === 10) return dealerUp <= 9 ? 'D' : 'H';
      if (total === 9) return (dealerUp >= 3 && dealerUp <= 6) ? 'D' : 'H';
      return 'H';
    }

    // --- Main game loop ---
    function tick() {
      if (!running) return;

      const bal = gl.balance;
      const state = gl.state;
      const canPlay = gl.canPlay;

      if (bal < betAmount) {
        stop();
        emit('PARTOUCHE_BOT_LOG', { msg: 'Balance too low', type: 'warn' });
        return;
      }

      // --- BETTING PHASE ---
      if (!roundInProgress && !canPlay) {
        const decksRemaining = Math.max(1, (312 - cardsDealt) / 52);
        const trueCount = runningCount / decksRemaining;
        let adjBet = betAmount;
        if (trueCount >= 2) adjBet = betAmount * 2;
        if (trueCount >= 4) adjBet = betAmount * 4;
        adjBet = Math.min(adjBet, gl.maxBet, Math.floor(bal / 2));

        setOverlay(
          'BJ BOT | BETTING\n' +
          'Bal: ' + bal.toLocaleString() + '\n' +
          'Count: ' + runningCount + ' TC: ' + trueCount.toFixed(1) + '\n' +
          'Bet: ' + adjBet.toLocaleString(),
          trueCount >= 2 ? '#ff0' : '#0f0'
        );

        // Use same bet (quick) or place new bet
        try {
          gl.inputSameBet();
        } catch(e) {
          // First time or error - try manual bet
          try {
            gl.inputNewBet();
            gl.inputSelectSpot(1);
            gl.inputBet(adjBet);
          } catch(e2) {}
        }

        // Deal after a delay
        roundInProgress = true;
        setTimeout(() => {
          if (running) {
            try { gl.inputDeal(); } catch(e) {}
          }
        }, 2000);
        return;
      }

      // --- PLAYING PHASE ---
      if (canPlay) {
        // Read player hands from table entities
        const hands = table.hands || [];
        const stacks = table.stacks || [];

        // Find dealer's up card (first card of dealer's hand/stack)
        let dealerUp = 10; // default assumption
        let dealerCards = [];
        if (stacks[0]) {
          dealerCards = readHand(stacks[0]);
          if (dealerCards.length > 0) dealerUp = dealerCards[0].rank;
        }

        // Find the active player hand (the one we need to act on)
        let playerCards = [];
        let playerHandStr = '?';
        for (const hand of hands) {
          const cards = readHand(hand);
          if (cards.length > 0) {
            playerCards = cards;
            break;
          }
        }

        if (playerCards.length === 0) {
          // Can't read cards - stand to be safe
          setOverlay('BJ BOT | PLAYING\nCan\'t read cards\nSTANDING (safe)', '#f90');
          gl.inputStand();
          return;
        }

        const hand = handTotal(playerCards);
        const cardNames = playerCards.map(c => c.name).join(' ');
        const dealerName = dealerCards.length > 0 ? dealerCards[0].name : '?';
        const isPair = playerCards.length === 2 && playerCards[0].rank === playerCards[1].rank;
        const pairRank = isPair ? playerCards[0].rank : null;

        const action = basicStrategy(hand.total, hand.soft, gl.canSplit && isPair, dealerUp, pairRank);
        const actionName = {H:'HIT', S:'STAND', D:'DOUBLE', P:'SPLIT'}[action];

        setOverlay(
          'BJ BOT | PLAYING\n' +
          'You: ' + cardNames + ' = ' + hand.total + (hand.soft ? ' soft' : '') + '\n' +
          'Dealer: ' + dealerName + '\n' +
          'Action: ' + actionName + '\n' +
          'Count: ' + runningCount,
          action === 'S' ? '#0f0' : '#ff0'
        );

        console.log('[BJ BOT]', cardNames, '(' + hand.total + ')', 'vs', dealerName, '→', actionName);

        switch (action) {
          case 'H': gl.inputHit(); break;
          case 'S': gl.inputStand(); break;
          case 'D': gl.canDouble ? gl.inputDouble() : gl.inputHit(); break;
          case 'P': gl.canSplit ? gl.inputSplit() : gl.inputHit(); break;
        }
        return;
      }

      // --- WAITING (between rounds, animations) ---
      if (roundInProgress && !canPlay) {
        // Round ended - count cards and reset
        // Try to read all visible cards for counting
        const allCards = [];
        for (const hand of (table.hands || [])) {
          allCards.push(...readHand(hand));
        }
        for (const stack of (table.stacks || [])) {
          allCards.push(...readHand(stack));
        }

        if (allCards.length > 0 && roundInProgress) {
          for (const c of allCards) {
            runningCount += hiLoValue(c.rank);
            cardsDealt++;
          }
          roundInProgress = false;
        }

        setOverlay(
          'BJ BOT | WAITING\n' +
          'Bal: ' + bal.toLocaleString() + '\n' +
          'Count: ' + runningCount + ' Cards: ' + cardsDealt + '\n' +
          'State: ' + state,
          '#0ff'
        );
      }
    }

    // --- Start/Stop ---
    function start(bet, hands) {
      if (running) return;
      running = true;
      betAmount = bet || 1000;
      numHands = hands || 1;
      roundInProgress = false;
      emit('PARTOUCHE_BOT_LOG', { msg: 'BJ bot started! Bet: ' + betAmount, type: 'success' });
      interval = setInterval(tick, 2500);
      setTimeout(tick, 1000);
    }

    function stop() {
      running = false;
      roundInProgress = false;
      if (interval) { clearInterval(interval); interval = null; }
      emit('PARTOUCHE_BOT_LOG', { msg: 'BJ bot stopped', type: 'warn' });
      setOverlay('BJ BOT OFF', '#f44');
    }

    // --- Commands ---
    window.addEventListener('PARTOUCHE_BOT_CMD', (event) => {
      const cmd = event.detail;
      if (cmd.action === 'start') start(cmd.betAmount || 1000, cmd.numHands || 1);
      else if (cmd.action === 'stop') stop();
      else if (cmd.action === 'getState') {
        emit('PARTOUCHE_BOT_STATE', { balance: gl.balance, running });
      }
    });

    setInterval(() => {
      emit('PARTOUCHE_BOT_STATE', { balance: gl.balance, running });
    }, 3000);

    setOverlay(
      'BJ BOT READY\n' +
      'Bal: ' + gl.balance.toLocaleString() + '\n' +
      'Min: ' + gl.minBet.toLocaleString() + ' Max: ' + gl.maxBet.toLocaleString(),
      '#0ff'
    );
    emit('PARTOUCHE_BOT_LOG', { msg: 'BJ bot ready! Bal: ' + gl.balance.toLocaleString(), type: 'success' });
  }
})();
