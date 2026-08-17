// --- CONSTANTES & VARIABLES GLOBALES ---
const SUITS = ['♠', '♥', '♦', '♣'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

let gameState = {
  status: 'IDLE',
  pot: 0,
  deck: [],
  communityCards: [],
  stage: 'START', 
  activePlayerIndex: 0,
  dealerIndex: 0, 
  actionsTaken: 0, 
  winnerId: null,
  players: []
};

let gameMode = 'bot'; 
let myPlayerId = 'p1'; 
let isHost = true; 
let roomCode = null;

// --- ÉLÉMENTS DOM ---
const selectMode = document.getElementById('select-mode');
const onlineLobby = document.getElementById('online-lobby');
const playerNameInput = document.getElementById('player-name-input');
const btnCreateRoom = document.getElementById('btn-create-room');
const btnJoinRoom = document.getElementById('btn-join-room');
const lobbyStatus = document.getElementById('lobby-status');

const opponentsZone = document.getElementById('opponents-zone');
const myCardsEl = document.getElementById('my-cards');
const myNameEl = document.getElementById('my-name');
const myLastActionEl = document.getElementById('my-last-action');
const myReloadsEl = document.getElementById('my-reloads');
const myChipsEl = document.getElementById('my-chips');
const elCommunityCards = document.getElementById('community-cards');
const elPot = document.getElementById('pot-amount');
const elGameMessage = document.getElementById('game-message');

const btnStart = document.getElementById('btn-start');
const btnRefill = document.getElementById('btn-refill');
const actionButtons = document.getElementById('action-buttons');
const btnFold = document.getElementById('btn-fold');
const btnCheck = document.getElementById('btn-check');
const btnRaise = document.getElementById('btn-raise');
const btnAllIn = document.getElementById('btn-all-in');
const raiseInput = document.getElementById('raise-amount');

const passOverlay = document.getElementById('pass-overlay');
const overlayTitle = document.getElementById('overlay-title');
const btnReady = document.getElementById('btn-ready');

// --- CHANGEMENT DE MODE ---
selectMode.addEventListener('change', (e) => {
  gameMode = e.target.value;
  if (gameMode === 'online') {
    onlineLobby.classList.remove('hidden');
    btnStart.classList.add('hidden');
  } else {
    onlineLobby.classList.add('hidden');
    btnStart.classList.remove('hidden');
  }
});

// --- RECAVE (REFILL) LOGIC ---
btnRefill.addEventListener('click', () => {
  const me = gameState.players.find(p => p.id === myPlayerId);
  if (me) {
    me.chips += 1000;
    me.reloads = (me.reloads || 0) + 1;
    syncState();
  }
});

// --- LOBBY ONLINE LOGIC ---
btnCreateRoom.addEventListener('click', () => {
  const maxP = parseInt(document.getElementById('player-count').value);
  const myName = playerNameInput.value.trim() || "Johnny Sins";
  roomCode = Math.floor(1000 + Math.random() * 9000).toString();
  
  isHost = true;
  myPlayerId = 'p1';

  const { ref, set } = window.firebaseRefs;
  
  set(ref(window.db, 'rooms/' + roomCode), {
    maxPlayers: maxP,
    status: 'WAITING',
    players: { p1: { id: 'p1', name: myName, chips: 1000, cards: [], state: 'ACTIVE', lastAction: '', reloads: 0 } },
    gameState: { pot: 0, stage: 'START', activePlayerIndex: 0, dealerIndex: 0, actionsTaken: 0, winnerId: null }
  }).then(() => {
    listenToRoom();
  });
});

btnJoinRoom.addEventListener('click', () => {
  roomCode = document.getElementById('room-code-input').value.trim();
  if (!roomCode) return;

  const { ref, onValue, update } = window.firebaseRefs;
  
  onValue(ref(window.db, 'rooms/' + roomCode), (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      if (data.status === 'WAITING') {
        const currentCount = Object.keys(data.players || {}).length;
        if (currentCount < data.maxPlayers) {
          isHost = false;
          myPlayerId = 'p' + (currentCount + 1);
          
          const myName = playerNameInput.value.trim() || "Joueur " + (currentCount + 1);
          
          const updates = {};
          updates['rooms/' + roomCode + '/players/' + myPlayerId] = {
            id: myPlayerId, name: myName, chips: 1000, cards: [], state: 'ACTIVE', lastAction: '', reloads: 0
          };
          update(ref(window.db), updates).then(() => {
            listenToRoom();
          });
        } else alert("Salon complet !");
      } else alert("La partie a déjà commencé !");
    } else alert("Code introuvable.");
  }, { onlyOnce: true });
});

function listenToRoom() {
  const { ref, onValue, update } = window.firebaseRefs;

  onValue(ref(window.db, 'rooms/' + roomCode), (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    const playersArr = Object.values(data.players || {});
    
    if (data.status === 'WAITING') {
      lobbyStatus.classList.remove('hidden');
      lobbyStatus.textContent = `Salon [ ${roomCode} ] : Attente (${playersArr.length}/${data.maxPlayers})...`;
      
      if (playersArr.length === data.maxPlayers && isHost) {
        update(ref(window.db, 'rooms/' + roomCode), { status: 'PLAYING' });
        initOnlineHand(playersArr, 0); 
      }
    } 
    else if (data.status === 'PLAYING') {
      onlineLobby.classList.add('hidden');
      gameState.players = playersArr;
      gameState.pot = data.gameState.pot || 0;
      gameState.communityCards = data.gameState.communityCards || [];
      gameState.stage = data.gameState.stage || 'START';
      gameState.activePlayerIndex = data.gameState.activePlayerIndex || 0;
      gameState.dealerIndex = data.gameState.dealerIndex || 0;
      gameState.actionsTaken = data.gameState.actionsTaken || 0;
      gameState.deck = data.gameState.deck || [];
      gameState.winnerId = data.gameState.winnerId || null;
      
      renderBoard();
      checkTurnLogic();
    }
  });
}

function initOnlineHand(playersArr, dealerIdx) {
  const deck = createDeck();
  playersArr.forEach(p => {
    p.chips -= 15; 
    p.state = 'ACTIVE';
    p.lastAction = ''; 
    p.reloads = p.reloads || 0;
    p.cards = [deck.pop(), deck.pop()];
  });
  
  let firstActor = (dealerIdx + 1) % playersArr.length;
  
  const { ref, update } = window.firebaseRefs;
  update(ref(window.db, 'rooms/' + roomCode), {
    'players': playersArr.reduce((acc, p) => ({ ...acc, [p.id]: p }), {}),
    'gameState': { 
        pot: playersArr.length * 15, 
        stage: 'PREFLOP', 
        activePlayerIndex: firstActor, 
        dealerIndex: dealerIdx,
        actionsTaken: 0,
        deck: deck, 
        communityCards: [],
        winnerId: null 
    }
  });
}

// --- LOGIQUE DU JEU (LOCAL & ONLINE) ---
function createDeck() {
  let d = [];
  for (let suit of SUITS) {
    for (let value of VALUES) d.push({ value, suit, isRed: suit === '♥' || suit === '♦' });
  }
  return d.sort(() => Math.random() - 0.5);
}

function createCardElement(card, hidden = false) {
  const wrapper = document.createElement('div');
  wrapper.className = 'card-wrapper deal-animation';
  
  const cardEl = document.createElement('div');
  cardEl.className = 'card';
  
  cardEl.innerHTML = `
    <div class="card-face card-back"></div>
    <div class="card-face card-front ${card.isRed ? 'red' : ''}">
      <div>${card.value}</div><div class="card-center">${card.suit}</div><div style="text-align: right;">${card.value}</div>
    </div>`;
    
  if (!hidden) {
    setTimeout(() => { cardEl.classList.add('flipped'); }, 50);
  }
  
  wrapper.appendChild(cardEl);
  return wrapper;
}

btnStart.addEventListener('click', () => {
  if (gameMode === 'online' && isHost) {
    let nextDealer = (gameState.dealerIndex + 1) % gameState.players.length;
    initOnlineHand(gameState.players, nextDealer);
  } else {
    let p1Chips = gameState.players[0] ? gameState.players[0].chips : 1000;
    let p1Reloads = gameState.players[0] ? (gameState.players[0].reloads || 0) : 0;
    
    let p2Chips = gameState.players[1] ? gameState.players[1].chips : 1000;
    let p2Reloads = gameState.players[1] ? (gameState.players[1].reloads || 0) : 0;
    
    let nextDealer = gameState.dealerIndex !== undefined ? (gameState.dealerIndex + 1) % 2 : 0;

    gameState.players = [
      { id: 'p1', name: 'Joueur 1', chips: p1Chips, cards: [], state: 'ACTIVE', lastAction: '', reloads: p1Reloads },
      { id: 'p2', name: gameMode === 'bot' ? 'Bot AI' : 'Joueur 2', chips: p2Chips, cards: [], state: 'ACTIVE', lastAction: '', reloads: p2Reloads }
    ];
    gameState.dealerIndex = nextDealer;
    myPlayerId = 'p1';
    
    startHandLocally();
  }
});

function startHandLocally() {
  gameState.deck = createDeck();
  gameState.pot = 0;
  gameState.communityCards = [];
  gameState.stage = 'PREFLOP';
  gameState.activePlayerIndex = (gameState.dealerIndex + 1) % gameState.players.length;
  gameState.actionsTaken = 0;
  gameState.winnerId = null;

  gameState.players.forEach(p => {
    p.chips -= 15;
    gameState.pot += 15;
    p.state = 'ACTIVE';
    p.lastAction = '';
    p.cards = [gameState.deck.pop(), gameState.deck.pop()];
  });

  btnStart.classList.add('hidden');
  renderBoard();
  checkTurnLogic();
}

// --- AFFICHAGE GRAPHIQUE ---
function renderBoard() {
  elPot.textContent = gameState.pot;
  opponentsZone.innerHTML = '';
  myCardsEl.innerHTML = '';
  elCommunityCards.innerHTML = '';

  const me = gameState.players.find(p => p.id === myPlayerId);
  
  const myIndex = gameState.players.findIndex(p => p.id === myPlayerId);
  const myDBadge = gameState.dealerIndex === myIndex ? `<span class="dealer-badge">D</span>` : '';
  myNameEl.innerHTML = `${me.name} ${myDBadge}`;
  
  myChipsEl.textContent = me.chips;
  myReloadsEl.textContent = me.reloads > 0 ? `🔄 ${me.reloads}` : '';
  
  if (me.chips === 0 && gameState.stage === 'END') {
    btnRefill.classList.remove('hidden');
  } else {
    btnRefill.classList.add('hidden');
  }
  
  if (me.lastAction) {
    myLastActionEl.textContent = me.lastAction;
    myLastActionEl.classList.remove('hidden');
  } else {
    myLastActionEl.classList.add('hidden');
  }
  
  if (me.cards) {
    me.cards.forEach(c => {
      let hidden = (gameMode === 'hotseat' && gameState.players[gameState.activePlayerIndex]?.id !== myPlayerId);
      myCardsEl.appendChild(createCardElement(c, hidden));
    });
  }

  const activeIndex = ['PAUSE', 'END', 'SHOWDOWN'].includes(gameState.stage) ? -1 : gameState.activePlayerIndex;

  if (myIndex === activeIndex) {
    document.getElementById('my-zone').classList.add('active-turn');
  } else {
    document.getElementById('my-zone').classList.remove('active-turn');
  }

  gameState.players.forEach((p, index) => {
    if (p.id === myPlayerId) return;

    const oppDiv = document.createElement('div');
    oppDiv.className = `player-zone ${p.state === 'FOLDED' ? 'folded' : ''} ${index === activeIndex ? 'active-turn' : ''}`;
    
    const infoDiv = document.createElement('div');
    infoDiv.className = 'player-info';
    
    const dBadge = index === gameState.dealerIndex ? `<span class="dealer-badge">D</span>` : '';
    const actionBadge = p.lastAction ? `<span class="last-action">${p.lastAction}</span>` : '';
    const reloadBadge = p.reloads > 0 ? `<span class="reload-badge">🔄 ${p.reloads}</span>` : '';
    
    infoDiv.innerHTML = `
      <span>${p.name} ${dBadge} ${reloadBadge}</span> 
      ${actionBadge}
      <span>${p.chips} €</span>
    `;

    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'cards-container';

    if (p.cards && p.cards.length > 0) {
      const showCards = (gameState.stage === 'SHOWDOWN' || gameState.stage === 'END') || (gameMode === 'hotseat' && index === gameState.activePlayerIndex);
      p.cards.forEach(c => {
         cardsContainer.appendChild(createCardElement(c, !showCards));
      });
    }

    oppDiv.appendChild(infoDiv);
    oppDiv.appendChild(cardsContainer);
    opponentsZone.appendChild(oppDiv);
  });

  gameState.communityCards.forEach(c => {
    elCommunityCards.appendChild(createCardElement(c, false));
  });
}

// --- GESTION DES TOURS ---
function checkTurnLogic() {
  if (gameState.stage === 'END') {
      actionButtons.classList.add('hidden');
      const winner = gameState.players.find(p => p.id === gameState.winnerId);
      if (winner) elGameMessage.textContent = `${winner.name} remporte la manche !`;
      
      if (gameMode !== 'online' || isHost) btnStart.classList.remove('hidden');
      return;
  }
  
  if (gameState.stage === 'PAUSE') {
      actionButtons.classList.add('hidden');
      elGameMessage.textContent = activePlayersCount() === 1 ? "Fin de la manche..." : "Distribution...";
      return;
  }
  
  if (gameState.stage === 'SHOWDOWN') {
      actionButtons.classList.add('hidden');
      elGameMessage.textContent = "Abattage des cartes !";
      return;
  }

  const activePlayer = gameState.players[gameState.activePlayerIndex];
  elGameMessage.textContent = activePlayer.id === myPlayerId ? "C'est à vous de jouer !" : `Tour de ${activePlayer.name}...`;

  if (activePlayer.id === myPlayerId) {
    if (gameMode === 'hotseat' && myCardsEl.innerHTML === '') {
       promptHotseatSwap(activePlayer.name);
    } else {
       actionButtons.classList.remove('hidden');
    }
  } else {
    actionButtons.classList.add('hidden');
    if (gameMode === 'bot' && isHost) {
      setTimeout(botPlay, 1500);
    }
  }
}

function botPlay() {
  const bot = gameState.players[gameState.activePlayerIndex];
  if (Math.random() > 0.75 && bot.chips >= 50) {
    handleAction('RAISE', 50);
  } else {
    handleAction('CHECK');
  }
}

// --- ACTIONS JOUEURS ---
btnCheck.addEventListener('click', () => handleAction('CHECK'));
btnFold.addEventListener('click', () => handleAction('FOLD'));

btnRaise.addEventListener('click', () => {
  const amount = parseInt(raiseInput.value);
  if (amount > 0) handleAction('RAISE', amount);
});

btnAllIn.addEventListener('click', () => handleAction('ALL_IN'));

function handleAction(action, amount = 0) {
  const me = gameState.players[gameState.activePlayerIndex];
  
  if (action === 'RAISE') {
    if (me.chips >= amount) {
      me.chips -= amount;
      gameState.pot += amount;
      me.lastAction = `Relance (${amount})`;
    } else {
      alert("Jetons insuffisants !");
      return;
    }
  } else if (action === 'ALL_IN') {
    if (me.chips > 0) {
      const allInAmount = me.chips;
      gameState.pot += allInAmount;
      me.chips = 0;
      me.lastAction = `Tapis ! (${allInAmount})`;
    } else {
      alert("Tu n'as plus de jetons !");
      return;
    }
  } else if (action === 'FOLD') {
    me.state = 'FOLDED';
    me.lastAction = 'Se couche';
  } else if (action === 'CHECK') {
    me.lastAction = 'Suit';
  }

  gameState.actionsTaken = (gameState.actionsTaken || 0) + 1;
  nextTurn();
}

function nextTurn() {
  do {
    gameState.activePlayerIndex = (gameState.activePlayerIndex + 1) % gameState.players.length;
  } while (gameState.players[gameState.activePlayerIndex].state === 'FOLDED' && activePlayersCount() > 1);

  if (activePlayersCount() === 1) {
    gameState.stage = 'PAUSE'; 
    syncState(); 
    setTimeout(() => {
      const winner = gameState.players.find(p => p.state === 'ACTIVE');
      endRoundWinner(winner);
    }, 2000);
    return;
  }

  if (gameState.actionsTaken >= activePlayersCount()) {
    const next = getNextStage(gameState.stage);
    
    if (next === 'SHOWDOWN') {
        gameState.stage = 'SHOWDOWN';
        
        // --- EVALUATION DES MAINS ---
        let bestScore = -1;
        let winner = null;
        
        gameState.players.forEach(p => {
            if (p.state === 'ACTIVE') {
                const handResult = getBestHand(p.cards, gameState.communityCards);
                p.lastAction = handResult.name; 
                
                if (handResult.score > bestScore) {
                    bestScore = handResult.score;
                    winner = p;
                }
            }
        });

        syncState(); 
        
        setTimeout(() => {
            endRoundWinner(winner);
        }, 4000); 
    } else {
        gameState.stage = 'PAUSE';
        syncState(); 
        setTimeout(() => {
            advanceStageActual(next);
            syncState();
        }, 2000);
    }
  } else {
    syncState(); 
  }
}

function getNextStage(current) {
  if (current === 'PREFLOP') return 'FLOP';
  if (current === 'FLOP') return 'TURN';
  if (current === 'TURN') return 'RIVER';
  return 'SHOWDOWN';
}

function advanceStageActual(nextStage) {
  gameState.stage = nextStage;
  gameState.actionsTaken = 0; 
  
  gameState.activePlayerIndex = (gameState.dealerIndex + 1) % gameState.players.length;
  while (gameState.players[gameState.activePlayerIndex].state === 'FOLDED') {
      gameState.activePlayerIndex = (gameState.activePlayerIndex + 1) % gameState.players.length;
  }
  
  if (nextStage === 'FLOP') {
    gameState.communityCards.push(gameState.deck.pop(), gameState.deck.pop(), gameState.deck.pop());
  } else if (nextStage === 'TURN') {
    gameState.communityCards.push(gameState.deck.pop());
  } else if (nextStage === 'RIVER') {
    gameState.communityCards.push(gameState.deck.pop());
  }
}

// --- ALGORITHME DE POKER ---
function getBestHand(playerCards, communityCards) {
  const allCards = [...playerCards, ...communityCards];
  if (allCards.length < 5) return { name: "Carte Haute", score: 0 };

  const valMap = {'2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9, '10':10, 'J':11, 'Q':12, 'K':13, 'A':14};
  const numCards = allCards.map(c => ({...c, num: valMap[c.value]})).sort((a,b) => b.num - a.num);

  const valCounts = {};
  const suitCounts = {};
  numCards.forEach(c => {
    valCounts[c.num] = (valCounts[c.num] || 0) + 1;
    suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
  });

  let flushSuit = Object.keys(suitCounts).find(s => suitCounts[s] >= 5);
  let flushCards = flushSuit ? numCards.filter(c => c.suit === flushSuit) : null;

  function getStraightHigh(cardsArr) {
    let uniqueVals = [...new Set(cardsArr.map(c => c.num))];
    if (uniqueVals.includes(14)) uniqueVals.push(1); 
    uniqueVals.sort((a,b) => b - a);
    let cons = 1;
    for (let i=0; i<uniqueVals.length-1; i++) {
      if (uniqueVals[i] === uniqueVals[i+1] + 1) {
        cons++;
        if (cons === 5) return uniqueVals[i-3];
      } else {
        cons = 1;
      }
    }
    return null;
  }

  const straightHigh = getStraightHigh(numCards);
  const straightFlushHigh = flushCards ? getStraightHigh(flushCards) : null;

  const countsArr = Object.entries(valCounts).map(([val, count]) => ({val: parseInt(val), count})).sort((a,b) => b.count - a.count || b.val - a.val);

  if (straightFlushHigh) {
    if (straightFlushHigh === 14) return { name: "Quinte Flush Royale", score: 9000000 };
    return { name: "Quinte Flush", score: 8000000 + straightFlushHigh };
  }
  if (countsArr[0].count === 4) {
    return { name: "Carré", score: 7000000 + countsArr[0].val * 100 + countsArr[1].val };
  }
  if (countsArr[0].count === 3 && countsArr.length > 1 && countsArr[1].count >= 2) {
    return { name: "Full", score: 6000000 + countsArr[0].val * 100 + countsArr[1].val };
  }
  if (flushCards) {
    const score = flushCards.slice(0,5).reduce((acc, c, i) => acc + c.num * Math.pow(16, 4-i), 0);
    return { name: "Couleur", score: 5000000 + score };
  }
  if (straightHigh) {
    return { name: "Quinte", score: 4000000 + straightHigh };
  }
  if (countsArr[0].count === 3) {
    return { name: "Brelan", score: 3000000 + countsArr[0].val * 10000 + countsArr[1].val * 100 + countsArr[2].val };
  }
  if (countsArr[0].count === 2 && countsArr.length > 1 && countsArr[1].count === 2) {
    return { name: "Double Paire", score: 2000000 + countsArr[0].val * 10000 + countsArr[1].val * 100 + countsArr[2].val };
  }
  if (countsArr[0].count === 2) {
    return { name: "Paire", score: 1000000 + countsArr[0].val * 100000 + countsArr[1].val * 1000 + countsArr[2].val * 10 + countsArr[3].val };
  }
  
  const score = numCards.slice(0,5).reduce((acc, c, i) => acc + c.num * Math.pow(16, 4-i), 0);
  return { name: "Carte Haute", score: score };
}

function activePlayersCount() {
  return gameState.players.filter(p => p.state === 'ACTIVE').length;
}

function endRoundWinner(winner) {
  // CORRECTION DU BUG DE LA CAGNOTTE :
  // On récupère le gagnant en cherchant son ID dans la liste actuelle des joueurs.
  // Cela empêche Firebase de cibler une ancienne version du joueur et de faire disparaître l'argent !
  const realWinner = gameState.players.find(p => p.id === winner.id);
  
  if (realWinner) {
    gameState.stage = 'END';
    gameState.winnerId = realWinner.id;
    realWinner.chips += gameState.pot;
    gameState.pot = 0;
    
    syncState();
  }
}

function syncState() {
  if (gameMode === 'online') {
    const { ref, update } = window.firebaseRefs;
    const updates = {};

    updates['rooms/' + roomCode + '/players'] = gameState.players.reduce((acc, p) => ({ ...acc, [p.id]: p }), {});
    updates['rooms/' + roomCode + '/gameState'] = { 
       pot: gameState.pot, 
       stage: gameState.stage, 
       activePlayerIndex: gameState.activePlayerIndex, 
       dealerIndex: gameState.dealerIndex,
       actionsTaken: gameState.actionsTaken,
       deck: gameState.deck || [], 
       communityCards: gameState.communityCards || [],
       winnerId: gameState.winnerId || null
    };
    
    update(ref(window.db), updates);
  } else {
    renderBoard();
    checkTurnLogic();
  }
}

function promptHotseatSwap(name) {
  document.getElementById('my-zone').classList.remove('active-turn');
  myCardsEl.innerHTML = '';
  overlayTitle.textContent = `Au tour de : ${name}`;
  passOverlay.classList.remove('hidden');
}

btnReady.addEventListener('click', () => {
  passOverlay.classList.add('hidden');
  myPlayerId = gameState.players[gameState.activePlayerIndex].id; 
  renderBoard();
  actionButtons.classList.remove('hidden');
});
