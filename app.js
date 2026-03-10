import { Chess } from "https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm";

const boardEl = document.getElementById("board");
const dragPieceEl = document.getElementById("drag-piece");
const statusTextEl = document.getElementById("status-text");
const lastMoveTextEl = document.getElementById("last-move-text");
const mateBannerEl = document.getElementById("mate-banner");
const newGameButton = document.getElementById("new-game");
const toggleMusicButton = document.getElementById("toggle-music");
const sevdahTrackEl = document.getElementById("sevdah-track");

const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const chess = new Chess();
const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
const pieceImageMap = {
  wp: "https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg",
  wn: "https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg",
  wb: "https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg",
  wr: "https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg",
  wq: "https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg",
  wk: "https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg",
  bp: "https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg",
  bn: "https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg",
  bb: "https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg",
  br: "https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg",
  bq: "https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg",
  bk: "https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg",
};

let selectedSquare = null;
let legalTargets = [];
let lastMoveSquares = [];
let engineBusy = false;
let engineReady = false;
let engineStartSent = false;
let dragState = null;
let pendingEngineMove = false;
let engineLoadTimer = null;

let audioContext = null;
let musicEnabled = true;
let musicStarted = false;
let musicTimer = null;
let masterGain = null;
let ambienceGain = null;
let droneGain = null;
let customTrackReady = false;

const engine = createEngine();
setupCustomTrack();

function createEngine() {
  try {
    const worker = new Worker("./stockfish-worker.js");
    worker.onmessage = handleEngineMessage;
    worker.onerror = () => {
      engineReady = false;
      engineBusy = false;
      setStatus("Stockfish se nije ucitao. Osvjezi stranicu ili provjeri internet.");
    };

    engineLoadTimer = window.setTimeout(() => {
      if (!engineReady) {
        setStatus("Stockfish se jos ucitava. Ako ostane ovako, uradi Ctrl+F5.");
      }
    }, 5000);

    worker.postMessage("uci");
    worker.postMessage("setoption name Skill Level value 12");
    worker.postMessage("isready");
    engineStartSent = true;
    return worker;
  } catch (error) {
    setStatus("Stockfish nije dostupan u ovom browseru.");
    return null;
  }
}

function setupCustomTrack() {
  if (!sevdahTrackEl) {
    return;
  }

  sevdahTrackEl.volume = 0.55;
  sevdahTrackEl.addEventListener("canplaythrough", () => {
    customTrackReady = true;
    refreshMusicLabel();
  });
  sevdahTrackEl.addEventListener("error", () => {
    customTrackReady = false;
    refreshMusicLabel();
  });
  sevdahTrackEl.load();
}

function setStatus(message) {
  statusTextEl.textContent = message;
}

function ensureAudio() {
  if (!AudioContextClass) {
    return;
  }

  if (!audioContext) {
    audioContext = new AudioContextClass();
    masterGain = audioContext.createGain();
    ambienceGain = audioContext.createGain();
    droneGain = audioContext.createGain();
    masterGain.gain.value = 0.44;
    ambienceGain.gain.value = 0.34;
    droneGain.gain.value = 0.16;
    ambienceGain.connect(masterGain);
    droneGain.connect(masterGain);
    masterGain.connect(audioContext.destination);
  }

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  if (musicEnabled && !musicStarted) {
    startPreferredMusic();
  }
}

function playClickSound(kind) {
  ensureAudio();
  if (!audioContext || !masterGain) {
    return;
  }

  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = kind === "lift" ? "triangle" : "sine";
  oscillator.frequency.setValueAtTime(kind === "lift" ? 760 : 470, now);
  oscillator.frequency.exponentialRampToValueAtTime(kind === "lift" ? 620 : 310, now + 0.09);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  oscillator.connect(gain);
  gain.connect(masterGain);
  oscillator.start(now);
  oscillator.stop(now + 0.14);
}

function playPluck(startTime, frequency, duration = 0.48, volume = 0.11) {
  if (!audioContext || !ambienceGain) {
    return;
  }

  const body = audioContext.createOscillator();
  const shimmer = audioContext.createOscillator();
  const gain = audioContext.createGain();

  body.type = "triangle";
  shimmer.type = "sine";
  body.frequency.setValueAtTime(frequency, startTime);
  shimmer.frequency.setValueAtTime(frequency * 2, startTime);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  body.connect(gain);
  shimmer.connect(gain);
  gain.connect(ambienceGain);

  body.start(startTime);
  shimmer.start(startTime);
  body.stop(startTime + duration + 0.05);
  shimmer.stop(startTime + duration + 0.05);
}

function playDrone(startTime, root) {
  if (!audioContext || !droneGain) {
    return;
  }

  [root, root * 1.5].forEach((frequency, index) => {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, startTime);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(index === 0 ? 0.04 : 0.025, startTime + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 4.6);
    osc.connect(gain);
    gain.connect(droneGain);
    osc.start(startTime);
    osc.stop(startTime + 4.8);
  });
}

function startPreferredMusic() {
  if (!musicEnabled || musicStarted) {
    return;
  }

  if (customTrackReady && sevdahTrackEl) {
    sevdahTrackEl.currentTime = 0;
    const playPromise = sevdahTrackEl.play();
    if (playPromise && typeof playPromise.then === "function") {
      playPromise
        .then(() => {
          musicStarted = true;
          refreshMusicLabel();
        })
        .catch(() => {
          startSyntheticMusic();
        });
      return;
    }

    musicStarted = true;
    refreshMusicLabel();
    return;
  }

  startSyntheticMusic();
}

function startSyntheticMusic() {
  if (!audioContext || musicStarted || !musicEnabled) {
    return;
  }

  const notes = {
    A3: 220.0,
    Bb3: 233.08,
    C4: 261.63,
    Cs4: 277.18,
    D4: 293.66,
    E4: 329.63,
    F4: 349.23,
    G4: 392.0,
  };

  const phrases = [
    [
      [0.0, notes.D4, 0.52, 0.12],
      [0.55, notes.F4, 0.5, 0.11],
      [1.05, notes.E4, 0.52, 0.11],
      [1.6, notes.D4, 0.62, 0.12],
      [2.3, notes.Cs4, 0.45, 0.1],
      [2.8, notes.D4, 0.8, 0.12],
    ],
    [
      [0.0, notes.F4, 0.52, 0.11],
      [0.55, notes.G4, 0.48, 0.1],
      [1.05, notes.F4, 0.48, 0.1],
      [1.55, notes.E4, 0.5, 0.1],
      [2.1, notes.D4, 0.5, 0.11],
      [2.65, notes.Bb3, 0.5, 0.095],
      [3.2, notes.A3, 0.82, 0.09],
    ],
  ];

  let index = 0;
  musicStarted = true;

  const schedulePhrase = () => {
    if (!audioContext || !musicEnabled) {
      return;
    }

    const start = audioContext.currentTime + 0.06;
    const phrase = phrases[index % phrases.length];
    playDrone(start, notes.D4 / 2);
    phrase.forEach(([offset, frequency, duration, volume]) => {
      playPluck(start + offset, frequency, duration, volume);
    });
    index += 1;
  };

  schedulePhrase();
  musicTimer = window.setInterval(schedulePhrase, 4200);
  refreshMusicLabel();
}

function stopMusicLoop() {
  if (musicTimer) {
    window.clearInterval(musicTimer);
    musicTimer = null;
  }
  if (sevdahTrackEl) {
    sevdahTrackEl.pause();
    sevdahTrackEl.currentTime = 0;
  }
  musicStarted = false;
}

function refreshMusicLabel() {
  if (!musicEnabled) {
    toggleMusicButton.textContent = "Muzika: iskljucena";
    return;
  }

  toggleMusicButton.textContent = customTrackReady
    ? "Muzika: Safet"
    : "Muzika: sevdah";
}

function squareColor(fileIndex, rankIndex) {
  return (fileIndex + rankIndex) % 2 === 0 ? "light" : "dark";
}

function getSquareFromPoint(clientX, clientY) {
  const target = document.elementFromPoint(clientX, clientY);
  return target?.closest(".square")?.dataset.square ?? null;
}

function updateDragVisual(clientX, clientY) {
  dragPieceEl.style.left = `${clientX}px`;
  dragPieceEl.style.top = `${clientY}px`;
}

function getLegalMoves(square) {
  return chess.moves({ square, verbose: true });
}

function unlockAudioFromGesture() {
  ensureAudio();
}

function renderDraggedPiece(pieceKey) {
  dragPieceEl.innerHTML = `<img src="${pieceImageMap[pieceKey]}" alt="">`;
}

function startDrag(square, event) {
  if (chess.turn() !== "w" || engineBusy || chess.isGameOver()) {
    return;
  }

  const piece = chess.get(square);
  if (!piece || piece.color !== "w") {
    return;
  }

  const moves = getLegalMoves(square);
  if (!moves.length) {
    selectedSquare = null;
    legalTargets = [];
    renderBoard();
    return;
  }

  ensureAudio();
  playClickSound("lift");

  selectedSquare = square;
  legalTargets = moves.map((move) => move.to);
  dragState = {
    from: square,
    pieceKey: `${piece.color}${piece.type}`,
  };

  renderDraggedPiece(dragState.pieceKey);
  dragPieceEl.className = "drag-piece active";
  updateDragVisual(event.clientX, event.clientY);
  renderBoard();
}

function endDrag(targetSquare) {
  if (!dragState) {
    return;
  }

  const from = dragState.from;
  dragPieceEl.className = "drag-piece";
  dragPieceEl.innerHTML = "";
  dragState = null;

  if (targetSquare && tryMove(from, targetSquare)) {
    return;
  }

  selectedSquare = null;
  legalTargets = [];
  renderBoard();
}

function tryMove(from, to) {
  const move = chess.move({ from, to, promotion: "q" });
  if (!move) {
    return false;
  }

  ensureAudio();
  playClickSound("drop");
  lastMoveSquares = [move.from, move.to];
  selectedSquare = null;
  legalTargets = [];
  renderBoard();
  updateAfterMove(move, "Ti");

  if (!chess.isGameOver()) {
    requestEngineMove();
  }

  return true;
}

function requestEngineMove() {
  if (!engine) {
    setStatus("Stockfish nije dostupan.");
    return;
  }

  if (!engineReady) {
    pendingEngineMove = true;
    if (!engineStartSent) {
      engine.postMessage("uci");
      engine.postMessage("isready");
      engineStartSent = true;
    }
    setStatus("Stockfish se priprema...");
    return;
  }

  pendingEngineMove = false;
  engineBusy = true;
  setStatus("Stockfish razmislja...");
  engine.postMessage("ucinewgame");
  engine.postMessage(`position fen ${chess.fen()}`);
  engine.postMessage("go depth 12");
}

function handleEngineMessage(event) {
  const text = typeof event.data === "string" ? event.data.trim() : "";
  if (!text) {
    return;
  }

  if (text === "uciok") {
    engineStartSent = true;
    return;
  }

  if (text === "readyok") {
    engineReady = true;
    if (engineLoadTimer) {
      window.clearTimeout(engineLoadTimer);
      engineLoadTimer = null;
    }

    if (pendingEngineMove && chess.turn() === "b" && !chess.isGameOver()) {
      requestEngineMove();
    } else {
      refreshStatus();
    }
    return;
  }

  if (text.startsWith("bestmove ")) {
    engineBusy = false;
    const bestMove = text.split(/\s+/)[1];
    if (!bestMove || bestMove === "(none)") {
      refreshStatus();
      return;
    }

    const move = chess.move({
      from: bestMove.slice(0, 2),
      to: bestMove.slice(2, 4),
      promotion: bestMove.slice(4, 5) || "q",
    });

    if (!move) {
      refreshStatus();
      return;
    }

    ensureAudio();
    playClickSound("drop");
    lastMoveSquares = [move.from, move.to];
    renderBoard();
    updateAfterMove(move, "Stockfish");
    return;
  }

  if (text.includes("stockfish-load-error")) {
    engineReady = false;
    engineBusy = false;
    setStatus("Stockfish se nije mogao ucitati sa mreze.");
  }
}

function updateAfterMove(move, actor) {
  lastMoveTextEl.textContent = `${actor}: ${move.from}-${move.to}`;

  if (chess.isCheckmate()) {
    mateBannerEl.textContent = "Mat!";
    mateBannerEl.classList.remove("hidden");
    setStatus(actor === "Ti" ? "Mat! Pobijedio si Stockfish." : "Mat! Stockfish je pobijedio.");
    return;
  }

  mateBannerEl.classList.add("hidden");

  if (chess.isDraw()) {
    setStatus("Partija je zavrsila nerijeseno.");
    return;
  }

  if (chess.isCheck()) {
    setStatus(actor === "Ti" ? "Stockfish je u sahu." : "Ti si u sahu.");
    return;
  }

  refreshStatus();
}

function refreshStatus() {
  if (chess.isGameOver()) {
    return;
  }

  if (chess.turn() === "w") {
    setStatus("Tvoj potez.");
  } else if (engineBusy) {
    setStatus("Stockfish razmislja...");
  } else if (engineReady) {
    setStatus("Stockfish je na potezu.");
  } else {
    setStatus("Stockfish se priprema...");
  }
}

function renderBoard() {
  boardEl.innerHTML = "";
  const board = chess.board();

  for (let rankIndex = 0; rankIndex < 8; rankIndex += 1) {
    for (let fileIndex = 0; fileIndex < 8; fileIndex += 1) {
      const rank = 8 - rankIndex;
      const square = `${files[fileIndex]}${rank}`;
      const boardPiece = board[rankIndex][fileIndex];
      const squareEl = document.createElement("div");
      squareEl.className = `square ${squareColor(fileIndex, rankIndex)}`;
      squareEl.dataset.square = square;

      if (lastMoveSquares.includes(square)) {
        squareEl.classList.add("last-move");
      }
      if (selectedSquare === square) {
        squareEl.classList.add("selected");
      }
      if (legalTargets.includes(square)) {
        squareEl.classList.add("legal-target");
      }
      if (dragState?.from === square) {
        squareEl.classList.add("drag-origin");
      }

      squareEl.addEventListener("pointerdown", (event) => {
        unlockAudioFromGesture();
        const piece = chess.get(square);
        if (piece && piece.color === "w") {
          event.preventDefault();
          startDrag(square, event);
        } else if (selectedSquare) {
          if (tryMove(selectedSquare, square)) {
            return;
          }
          selectedSquare = null;
          legalTargets = [];
          renderBoard();
        }
      });

      if (boardPiece && dragState?.from !== square) {
        const pieceKey = `${boardPiece.color}${boardPiece.type}`;
        const pieceImg = document.createElement("img");
        pieceImg.className = "piece-image";
        pieceImg.src = pieceImageMap[pieceKey];
        pieceImg.alt = "";
        pieceImg.draggable = false;
        squareEl.append(pieceImg);
      }

      boardEl.append(squareEl);
    }
  }
}

window.addEventListener("pointermove", (event) => {
  if (!dragState) {
    return;
  }
  updateDragVisual(event.clientX, event.clientY);
});

window.addEventListener("pointerup", (event) => {
  if (!dragState) {
    return;
  }
  const targetSquare = getSquareFromPoint(event.clientX, event.clientY);
  endDrag(targetSquare);
});

window.addEventListener("pointerdown", unlockAudioFromGesture, { passive: true });

newGameButton.addEventListener("click", () => {
  ensureAudio();
  chess.reset();
  selectedSquare = null;
  legalTargets = [];
  lastMoveSquares = [];
  engineBusy = false;
  pendingEngineMove = false;
  mateBannerEl.classList.add("hidden");
  lastMoveTextEl.textContent = "Jos nema poteza.";
  if (engine) {
    engineReady = false;
    engine.postMessage("uci");
    engine.postMessage("isready");
  }
  setStatus("Nova partija. Ti si bijeli.");
  renderBoard();
});

toggleMusicButton.addEventListener("click", () => {
  ensureAudio();
  musicEnabled = !musicEnabled;
  if (musicEnabled) {
    startPreferredMusic();
  } else {
    stopMusicLoop();
  }
  refreshMusicLabel();
});

refreshMusicLabel();
renderBoard();
refreshStatus();
