// --- CONSTANTES & VARIABLES GLOBALES ---
const SUITS = ['♠', '♥', '♦', '♣'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

let gameState = {
  status: 'IDLE',
  pot: 0,
  deck: [],
  communityCards: [],
  stage: 'START', // PREFLOP, FLOP, TURN, RIVER, SHOWDOWN
  activePlayerIndex: 0,
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
const myChipsEl = document.getElementById('my-chips');
const elCommunityCards = document.getElementById('community-cards');
const elPot = document.getElementById('pot-amount');
const elGameMessage = document.getElementById('game-message');

const btnStart = document.getElementById('btn-start');
const actionButtons = document.getElementById('action-buttons');
const btnFold = document.getElementById('btn-fold');
const btnCheck = document.getElementById('btn-check');
const btnRaise = document.getElementById('btn-raise');

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

// --- LOBBY ONLINE LOGIC ---
btnCreateRoom.addEventListener('click', () => {
  const maxP = parseInt(document.getElementById('player-count').value);
  const myName = playerNameInput.value.trim() || "Joueur 1";
  roomCode = Math.floor(1000 + Math.random() * 9000).toString();
  
  isHost = true;
  myPlayerId = 'p1';

  const { ref, set } = window.firebaseRefs;
  
  set(ref(window.db, 'rooms/' + roomCode), {
    maxPlayers: maxP,
    status: 'WAITING',
    players: { p1: { id: 'p1', name: myName, chips: 1000, cards: [], state: 'ACTIVE' } },
    gameState: { pot: 0, stage: 'START', activePlayerIndex: 0 }
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
            id: myPlayerId, name: myName, chips: 1000, cards: [], state: 'ACTIVE'
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
        initOnlineHand(playersArr);
      }
    } 
    else if (data.status === 'PLAYING') {
      onlineLobby.classList.add('hidden');
      gameState.players = playersArr;
      gameState.pot = data.gameState.pot || 0;
      gameState.communityCards = data.gameState.communityCards || [];
      gameState.stage = data.gameState.stage || 'START';
      gameState.activePlayerIndex = data.gameState.activePlayerIndex || 0;
      gameState.deck = data.gameState.deck || [];
      
      renderBoard();
      checkTurnLogic();
    }
  });
}

function initOnlineHand(playersArr) {
  const deck = createDeck();
  playersArr.forEach(p => {
    p.chips -= 15; 
    p.state = 'ACTIVE';
    p.cards = [deck.pop(), deck.pop()];
  });
  
  const { ref, update } = window.firebaseRefs;
  update(ref(window.db, 'rooms/' + roomCode), {
    'players': playersArr.reduce((acc, p) => ({ ...acc, [p.id]: p }), {}),
    'gameState': { pot: playersArr.length * 15, stage: 'PREFLOP', activePlayerIndex: 0, deck: deck, communityCards: [] }
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
  const cardEl = document.createElement('div');
  cardEl.classList.add('card', 'deal-animation');
  // L'ajout du hidden = false déclenche la nouvelle animation deal-flipped
  if (!hidden) cardEl.classList.add('flipped');
  
  cardEl.innerHTML = `
    <div class="card-face card-back"></div>
    <div class="card-face card-front ${card.isRed ? 'red' : ''}">
      <div>${card.value}</div><div class="card-center">${card.suit}</div><div style="text-align: right;">${card.value}</div>
    </div>`;
  return cardEl;
}

// Le bouton gère maintenant le lancement Local ET les relances En Ligne
btnStart.addEventListener('click', () => {
  if (gameMode === 'online' && isHost) {
    initOnlineHand(gameState.players);
  } else {
    // Mode Local: On garde les jetons de la manche précédente si on relance
    let p1Chips = gameState.players[0] ? gameState.players[0].chips : 1000;
    let p2Chips = gameState.players[1] ? gameState.players[1].chips : 1000;

    gameState.players = [
      { id: 'p1', name: 'Joueur 1', chips: p1Chips, cards: [], state: 'ACTIVE' },
      { id: 'p2', name: gameMode === 'bot' ? 'Bot AI' : 'Joueur 2', chips: p2Chips, cards: [], state: 'ACTIVE' }
    ];
    myPlayerId = 'p1';
    startHandLocally();
  }
});

function startHandLocally() {
  gameState.deck = createDeck();
  gameState.pot = 0;
  gameState.communityCards = [];
  gameState.stage = 'PREFLOP';
  gameState.activePlayerIndex = 0;

  gameState.players.forEach(p => {
    p.chips -= 15;
    gameState.pot += 15;
    p.state = 'ACTIVE';
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
  myNameEl.textContent = me.name;
  myChipsEl.textContent = me.chips;
  
  if (me.cards) {
    me.cards.forEach(c => {
      let hidden = (gameMode === 'hotseat' && gameState.players[gameState.activePlayerIndex].id !== myPlayerId);
      myCardsEl.appendChild(createCardElement(c, hidden));
    });
  }

  gameState.players.forEach((p, index) => {
    if (p.id === myPlayerId) {
      if (index === gameState.activePlayerIndex) document.getElementById('my-zone').classList.add('active-turn');
      else document.getElementById('my-zone').classList.remove('active-turn');
      return;
    }

    const oppDiv = document.createElement('div');
    oppDiv.className = `player-zone ${p.state === 'FOLDED' ? 'folded' : ''} ${index === gameState.activePlayerIndex ? 'active-turn' : ''}`;
    
    let cardsHTML = '';
    if (p.cards && p.cards.length > 0) {
      const showCards = (gameState.stage === 'SHOWDOWN') || (gameMode === 'hotseat' && index === gameState.activePlayerIndex);
      p.cards.forEach(c => {
         const cardDOM = createCardElement(c, !showCards);
         cardsHTML += cardDOM.outerHTML;
      });
    }

    oppDiv.innerHTML = `
      <div class="player-info"><span>${p.name}</span> <span>${p.chips} €</span></div>
      <div class="cards-container">${cardsHTML}</div>
    `;
    opponentsZone.appendChild(oppDiv);
  });

  gameState.communityCards.forEach(c => {
    elCommunityCards.appendChild(createCardElement(c, false));
  });
}

// --- GESTION DES TOURS ---
function checkTurnLogic() {
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
    if (gameMode === 'bot') {
      setTimeout(botPlay, 1500);
    }
  }
}

function botPlay() {
  handleAction('CHECK');
}

// --- ACTIONS JOUEURS ---
btnCheck.addEventListener('click', () => handleAction('CHECK'));
btnRaise.addEventListener('click', () => handleAction('RAISE'));
btnFold.addEventListener('click', () => handleAction('FOLD'));

function handleAction(action) {
  const me = gameState.players[gameState.activePlayerIndex];
  
  if (action === 'RAISE' && me.chips >= 50) {
    me.chips -= 50;
    gameState.pot += 50;
  } else if (action === 'FOLD') {
    me.state = 'FOLDED';
  }

  nextTurn();
}

function nextTurn() {
  do {
    gameState.activePlayerIndex = (gameState.activePlayerIndex + 1) % gameState.players.length;
  } while (gameState.players[gameState.activePlayerIndex].state === 'FOLDED' && activePlayersCount() > 1);

  if (activePlayersCount() === 1) {
    endRoundWinner(gameState.players.find(p => p.state === 'ACTIVE'));
    return;
  }

  // Dès qu'on revient au premier joueur, on avance l'étape du jeu (Flop, Turn...)
  if (gameState.activePlayerIndex === 0) {
    advanceStage();
  }

  syncState();
}

function activePlayersCount() {
  return gameState.players.filter(p => p.state === 'ACTIVE').length;
}

function advanceStage() {
  if (gameState.stage === 'PREFLOP') {
    gameState.stage = 'FLOP';
    gameState.communityCards.push(gameState.deck.pop(), gameState.deck.pop(), gameState.deck.pop());
  } else if (gameState.stage === 'FLOP') {
    gameState.stage = 'TURN';
    gameState.communityCards.push(gameState.deck.pop());
  } else if (gameState.stage === 'TURN') {
    gameState.stage = 'RIVER';
    gameState.communityCards.push(gameState.deck.pop());
  } else {
    gameState.stage = 'SHOWDOWN';
    elGameMessage.textContent = "Abattage des cartes !";
    setTimeout(() => endRoundWinner(gameState.players[0]), 3000); // Simplification: le P1 gagne tout à la fin
  }
}

function endRoundWinner(winner) {
  elGameMessage.textContent = `${winner.name} remporte le pot de ${gameState.pot}€ !`;
  winner.chips += gameState.pot;
  gameState.pot = 0;
  
  actionButtons.classList.add('hidden');
  
  if (gameMode !== 'online') {
    btnStart.classList.remove('hidden');
  } else if (isHost) {
    btnStart.classList.remove('hidden'); // Seul l'hôte relance
  }
}

function syncState() {
  if (gameMode === 'online') {
    const { ref, update } = window.firebaseRefs;
    const updates = {};

    // Pousser l'état global du jeu pour éviter les désynchronisations de Deck ou de Cartes Communes
    updates['rooms/' + roomCode + '/players'] = gameState.players.reduce((acc, p) => ({ ...acc, [p.id]: p }), {});
    updates['rooms/' + roomCode + '/gameState'] = { 
       pot: gameState.pot, stage: gameState.stage, 
       activePlayerIndex: gameState.activePlayerIndex, 
       deck: gameState.deck || [], 
       communityCards: gameState.communityCards || [] 
    };
    
    update(ref(window.db), updates);
  } else {
    renderBoard();
    checkTurnLogic();
  }
}

// --- HOTSEAT OVERLAY ---
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
