// ===========================================================
// Partouche Blackjack Bot - Injected into MAIN world
// Features: basic strategy + Hi-Lo card counting
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
    if (!gl || !gl.inputHit) return; // not a blackjack game

    clearInterval(waitForPC);
    console.log('[BJ BOT] Blackjack detected! Setting up...');
    setupBot(app, gl);
  }, 500);

  function setupBot(app, gl) {
    let running = false;
    let interval = null;
    let betAmount = 1000;
    let runningCount = 0; // Hi-Lo running count
    let cardsDealt = 0;
    let lastResult = null;

    // --- Intercept onResult to capture card data ---
    const origOnResult = gl.onResult.bind(gl);
    gl.onResult = function(data) {
      lastResult = data;
      console.log('[BJ BOT] Result received:', JSON.stringify(data).substring(0, 1000));
      processResult(data);
      return origOnResult(data);
    };

    // --- Card counting (Hi-Lo) ---
    function hiLoValue(rank) {
      if (rank >= 2 && rank <= 6) return 1;
      if (rank >= 7 && rank <= 9) return 0;
      // 10, J(11), Q(12), K(13), A(1 or 14)
      return -1;
    }

    function countCards(cards) {
      for (const card of cards) {
        const rank = card.rank || card.value || card.v;
        if (rank) {
          runningCount += hiLoValue(rank);
          cardsDealt++;
        }
      }
    }

    function processResult(data) {
      // Try to extract cards from result data
      // The format depends on what the server sends - we log it to figure out
      try {
        if (data.hands) {
          for (const hand of data.hands) {
            if (hand.cards) countCards(hand.cards);
          }
        }
        if (data.dealer?.cards) countCards(data.dealer.cards);
        // Also try flat arrays
        if (data.cards) countCards(data.cards);
      } catch(e) {
        console.log('[BJ BOT] Error processing result:', e.message);
      }
    }

    // --- Parse hand from result data ---
    function getHandTotal(cards) {
      let total = 0;
      let aces = 0;
      for (const card of cards) {
        const rank = card.rank || card.value || card.v || 0;
        if (rank === 1 || rank === 14) { // Ace
          total += 11;
          aces++;
        } else if (rank >= 10 || rank === 11 || rank === 12 || rank === 13) {
          total += 10;
        } else {
          total += rank;
        }
      }
      while (total > 21 && aces > 0) {
        total -= 10;
        aces--;
      }
      return { total, soft: aces > 0 };
    }

    // --- Basic Strategy ---
    // Returns: 'H' (hit), 'S' (stand), 'D' (double), 'P' (split)
    function basicStrategy(playerTotal, soft, canSplit, dealerUp, pairRank) {
      // --- Pairs ---
      if (canSplit && pairRank) {
        if (pairRank === 1 || pairRank === 8) return 'P'; // Always split A,8
        if (pairRank === 10 || pairRank === 5) return basicStrategy(playerTotal, false, false, dealerUp); // Never split 10,5
        if (pairRank === 4) return dealerUp >= 5 && dealerUp <= 6 ? 'P' : 'H';
        if (pairRank === 9) return (dealerUp === 7 || dealerUp >= 10) ? 'S' : 'P';
        if (pairRank === 7) return dealerUp <= 7 ? 'P' : 'H';
        if (pairRank === 6) return dealerUp <= 6 ? 'P' : 'H';
        if (pairRank === 3 || pairRank === 2) return dealerUp <= 7 ? 'P' : 'H';
      }

      // --- Soft hands ---
      if (soft) {
        if (playerTotal >= 19) return 'S';
        if (playerTotal === 18) {
          if (dealerUp <= 8) return 'S';
          return 'H';
        }
        if (playerTotal === 17) {
          if (dealerUp >= 3 && dealerUp <= 6) return 'D';
          return 'H';
        }
        if (playerTotal <= 16 && playerTotal >= 15) {
          if (dealerUp >= 4 && dealerUp <= 6) return 'D';
          return 'H';
        }
        if (playerTotal <= 14) {
          if (dealerUp >= 5 && dealerUp <= 6) return 'D';
          return 'H';
        }
        return 'H';
      }

      // --- Hard hands ---
      if (playerTotal >= 17) return 'S';
      if (playerTotal >= 13 && playerTotal <= 16) {
        return dealerUp <= 6 ? 'S' : 'H';
      }
      if (playerTotal === 12) {
        return (dealerUp >= 4 && dealerUp <= 6) ? 'S' : 'H';
      }
      if (playerTotal === 11) return 'D';
      if (playerTotal === 10) {
        return dealerUp <= 9 ? 'D' : 'H';
      }
      if (playerTotal === 9) {
        return (dealerUp >= 3 && dealerUp <= 6) ? 'D' : 'H';
      }
      return 'H'; // 8 or less
    }

    // --- Read cards from spriteFrame (fallback) ---
    // Standard deck sprite: 13 cards per suit, 4 suits
    // We'll calibrate this from the first onResult data
    let spriteMap = null;

    function readHandFromSprites(handEntity) {
      const cards = [];
      for (const child of handEntity.children) {
        const frame = child.children?.[0]?.element?.spriteFrame;
        if (frame !== undefined && spriteMap) {
          cards.push(spriteMap[frame] || {rank: 0});
        }
      }
      return cards;
    }

    // --- Overlay ---
    function makeOverlay() {
      let el = document.getElementById('bj-bot-overlay');
      if (el) return el;
      el = document.createElement('div');
      el.id = 'bj-bot-overlay';
      el.style.cssText = 'position:fixed;top:8px;right:8px;background:rgba(0,0,0,0.9);color:#0f0;' +
        'font:bold 11px monospace;padding:10px 14px;border-radius:8px;z-index:999999;pointer-events:none;' +
        'border:1px solid #0f0;min-width:220px;white-space:pre;line-height:1.5;';
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

    // --- Bot game loop ---
    function tick() {
      if (!running) return;

      const bal = gl.balance;
      if (bal < betAmount * 2) {
        stop();
        emit('PARTOUCHE_BOT_LOG', { msg: 'Balance too low for blackjack', type: 'warn' });
        return;
      }

      const state = gl.state;

      // State 1: betting phase → place bet and deal
      if (state === 1) {
        // Adjust bet based on count (card counting!)
        const decksRemaining = Math.max(1, (312 - cardsDealt) / 52); // 6 deck shoe
        const trueCount = runningCount / decksRemaining;
        let adjBet = betAmount;
        if (trueCount >= 2) adjBet = betAmount * 2;
        if (trueCount >= 4) adjBet = betAmount * 4;
        if (trueCount >= 6) adjBet = betAmount * 8;
        adjBet = Math.min(adjBet, gl.maxBet, Math.floor(bal / 2));

        setOverlay(
          'BJ BOT | Bal: ' + bal.toLocaleString() + '\n' +
          'Count: ' + runningCount + ' (TC: ' + trueCount.toFixed(1) + ')\n' +
          'Cards seen: ' + cardsDealt + '\n' +
          'Bet: ' + adjBet.toLocaleString(),
          trueCount >= 2 ? '#ff0' : '#0f0'
        );

        // Place bet on middle spot only (1 hand)
        gl.inputSelectSpot(1); // select middle
        gl.bets = [0, adjBet, 0]; // bet only middle
        gl.inputSameBet();

        setTimeout(() => {
          if (running && gl.state === 1) gl.inputDeal();
        }, 1000);
        return;
      }

      // State 2: playing phase → make decisions
      if (state === 2 && gl.canPlay) {
        // Read current hand from last result
        if (!lastResult) {
          setOverlay('BJ BOT | Waiting for cards...', '#ff0');
          return;
        }

        makeDecision();
        return;
      }

      // Other states: waiting for animations/results
      setOverlay(
        'BJ BOT | Bal: ' + bal.toLocaleString() + '\n' +
        'Count: ' + runningCount + ' (Cards: ' + cardsDealt + ')\n' +
        'State: ' + state + ' | Waiting...',
        '#0ff'
      );
    }

    function makeDecision() {
      if (!lastResult || !gl.canPlay) return;

      try {
        // Try to get hand data from result
        const hands = lastResult.hands || lastResult.spots || [];
        const dealer = lastResult.dealer || {};
        const dealerCards = dealer.cards || [];
        const dealerUp = dealerCards[0]?.rank || dealerCards[0]?.value || dealerCards[0]?.v || 10;

        // Find the active player hand
        let playerCards = [];
        for (const h of hands) {
          if (h && h.cards && h.cards.length > 0) {
            playerCards = h.cards;
            break;
          }
        }

        if (playerCards.length === 0) {
          console.log('[BJ BOT] No player cards found in result, standing');
          gl.inputStand();
          return;
        }

        const hand = getHandTotal(playerCards);
        const isPair = playerCards.length === 2 &&
          (playerCards[0].rank || playerCards[0].value) === (playerCards[1].rank || playerCards[1].value);
        const pairRank = isPair ? (playerCards[0].rank || playerCards[0].value) : null;

        const action = basicStrategy(hand.total, hand.soft, gl.canSplit && isPair, dealerUp, pairRank);

        setOverlay(
          'BJ BOT | ' + hand.total + (hand.soft ? ' soft' : '') + ' vs ' + dealerUp + '\n' +
          'Action: ' + {H:'HIT',S:'STAND',D:'DOUBLE',P:'SPLIT'}[action] + '\n' +
          'Count: ' + runningCount + ' | Bal: ' + gl.balance.toLocaleString(),
          action === 'S' ? '#0f0' : '#ff0'
        );

        console.log('[BJ BOT] Hand:', hand.total, hand.soft ? 'soft' : 'hard', 'vs dealer', dealerUp, '→', action);

        switch (action) {
          case 'H': gl.inputHit(); break;
          case 'S': gl.inputStand(); break;
          case 'D': gl.canDouble ? gl.inputDouble() : gl.inputHit(); break;
          case 'P': gl.canSplit ? gl.inputSplit() : gl.inputHit(); break;
        }
      } catch(e) {
        console.log('[BJ BOT] Decision error:', e.message, 'standing');
        gl.inputStand();
      }
    }

    // --- Start/Stop ---
    function start(bet) {
      if (running) return;
      running = true;
      betAmount = bet || 1000;
      console.log('[BJ BOT] Started! bet=' + betAmount);
      emit('PARTOUCHE_BOT_LOG', { msg: 'Blackjack bot started! Bet: ' + betAmount.toLocaleString(), type: 'success' });
      setOverlay('BJ BOT ON | Bet: ' + betAmount.toLocaleString(), '#0f0');
      interval = setInterval(tick, 2000);
      setTimeout(tick, 1000);
    }

    function stop() {
      running = false;
      if (interval) { clearInterval(interval); interval = null; }
      emit('PARTOUCHE_BOT_LOG', { msg: 'Blackjack bot stopped', type: 'warn' });
      setOverlay('BJ BOT OFF', '#f44');
    }

    // --- Commands ---
    window.addEventListener('PARTOUCHE_BOT_CMD', (event) => {
      const cmd = event.detail;
      console.log('[BJ BOT] CMD:', cmd.action);
      if (cmd.action === 'start') start(cmd.betAmount || cmd.betPercent * gl.balance / 100 || 1000);
      else if (cmd.action === 'stop') stop();
      else if (cmd.action === 'getState') {
        emit('PARTOUCHE_BOT_STATE', { balance: gl.balance, bet: gl.totalBet, running });
      }
      else if (cmd.action === 'resetCount') {
        runningCount = 0;
        cardsDealt = 0;
        emit('PARTOUCHE_BOT_LOG', { msg: 'Card count reset', type: 'info' });
      }
    });

    // Periodic state report
    setInterval(() => {
      emit('PARTOUCHE_BOT_STATE', { balance: gl.balance, bet: gl.totalBet, running });
    }, 3000);

    setOverlay('BJ BOT READY\nMin bet: ' + gl.minBet.toLocaleString() + '\nMax bet: ' + gl.maxBet.toLocaleString(), '#0ff');
    emit('PARTOUCHE_BOT_LOG', { msg: 'Blackjack bot ready! Bal: ' + gl.balance.toLocaleString(), type: 'success' });
  }
})();
