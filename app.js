import { Chess } from "https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm";

const boardEl = document.getElementById("board");
const dragPieceEl = document.getElementById("drag-piece");
const statusTextEl = document.getElementById("status-text");
const lastMoveTextEl = document.getElementById("last-move-text");
const mateBannerEl = document.getElementById("mate-banner");
const newGameButton = document.getElementById("new-game");
const toggleMusicButton = document.getElementById("toggle-music");

const chess = new Chess();
const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
const pieceMap = {
  wp: "♙",
  wn: "♘",
  wb: "♗",
  wr: "♖",
  wq: "♕",
  wk: "♔",
  bp: "♟",
  bn: "♞",
  bb: "♝",
  br: "♜",
  bq: "♛",
  bk: "♚",
};

let selectedSquare = null;
let legalTargets = [];
let lastMoveSquares = [];
let engineBusy = false;
let engineReady = false;
let engineFailed = false;
let dragState = null;

let audioContext = null;
let musicEnabled = true;
let musicStarted = false;
let musicIntervalId = null;
let masterGain = null;
let ambienceGain = null;

const engine = createEngine();

function createEngine() {
  try {
    const workerSource = `
      self.global = self;
      importScripts("https://cdn.jsdelivr.net/npm/stockfish.wasm@0.10.0/stockfish.worker.js");
    `;
    const workerUrl = URL.createObjectURL(
      new Blob([workerSource], { type: "application/javascript" }),
    );
    const worker = new Worker(workerUrl);
    worker.onmessage = handleEngineMessage;
    worker.onerror = () => {
      engineFailed = true;
      engineBusy = false;
      setStatus("Stockfish se nije uspio ucitati. Pokreni aplikaciju preko lokalnog servera.");
    };
    worker.postMessage("uci");
    worker.postMessage("isready");
    return worker;
  } catch (error) {
    engineFailed = true;
    setStatus("Stockfish nije dostupan u ovom browseru.");
    return null;
  }
}

function ensureAudio() {
  if (!audioContext) {
    audioContext = new AudioContext();
    masterGain = audioContext.createGain();
    ambienceGain = audioContext.createGain();
    masterGain.gain.value = 0.22;
    ambienceGain.gain.value = 0.18;
    ambienceGain.connect(masterGain);
    masterGain.connect(audioContext.destination);
  }

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  if (musicEnabled && !musicStarted) {
    startMusicLoop();
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
  oscillator.frequency.setValueAtTime(kind === "lift" ? 690 : 420, now);
  oscillator.frequency.exponentialRampToValueAtTime(kind === "lift" ? 540 : 280, now + 0.07);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
  oscillator.connect(gain);
  gain.connect(masterGain);
  oscillator.start(now);
  oscillator.stop(now + 0.1);
}

function startMusicLoop() {
  if (!audioContext || !ambienceGain || musicStarted || !musicEnabled) {
    return;
  }

  musicStarted = true;
  const progression = [
    [220, 277.18, 329.63],
    [196, 246.94, 293.66],
    [174.61, 220, 261.63],
    [196, 246.94, 329.63],
  ];

  const playChord = (startTime, frequencies) => {
    frequencies.forEach((frequency, index) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = index === 0 ? "sine" : "triangle";
      osc.frequency.setValueAtTime(frequency, startTime);
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.04 / (index + 1), startTime + 0.6);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 3.6);
      osc.connect(gain);
      gain.connect(ambienceGain);
      osc.start(startTime);
      osc.stop(startTime + 3.8);
    });
  };

  let step = 0;
  const schedule = () => {
    if (!audioContext || !musicEnabled) {
      return;
    }

    const start = audioContext.currentTime + 0.05;
    playChord(start, progression[step % progression.length]);
    step += 1;
  };

  schedule();
  musicIntervalId = window.setInterval(schedule, 3200);
}

function stopMusicLoop() {
  if (musicIntervalId) {
    window.clearInterval(musicIntervalId);
    musicIntervalId = null;
  }
  musicStarted = false;
}

function setStatus(message) {
  statusTextEl.textContent = message;
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

function startDrag(square, event) {
  if (chess.turn() !== "w" || engineBusy || chess.isGameOver()) {
    return;
  }

  const moves = getLegalMoves(square);
  if (!moves.length) {
    selectedSquare = null;
    legalTargets = [];
    renderBoard();
    return;
  }

  const piece = chess.get(square);
  if (!piece || piece.color !== "w") {
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

  dragPieceEl.textContent = pieceMap[dragState.pieceKey];
  dragPieceEl.className = `drag-piece active ${piece.color === "w" ? "white" : "black"}`;
  updateDragVisual(event.clientX, event.clientY);
  renderBoard();
}

function endDrag(targetSquare) {
  if (!dragState) {
    return;
  }

  const from = dragState.from;
  dragPieceEl.className = "drag-piece";
  dragState = null;

  if (targetSquare && tryMove(from, targetSquare)) {
    return;
  }

  selectedSquare = null;
  legalTargets = [];
  renderBoard();
}

function tryMove(from, to) {
  const move = chess.move({
    from,
    to,
    promotion: "q",
  });

  if (!move) {
    return false;
  }

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
  if (!engine || engineFailed) {
    return;
  }

  engineBusy = true;
  setStatus("Stockfish razmislja...");
  engine.postMessage(`position fen ${chess.fen()}`);
  engine.postMessage("go depth 13");
}

function handleEngineMessage(event) {
  const text = typeof event.data === "string" ? event.data : "";

  if (text === "readyok") {
    engineReady = true;
    setStatus("Ti si bijeli. Povuci prvi potez.");
    return;
  }

  if (text.startsWith("bestmove ")) {
    engineBusy = false;
    const bestMove = text.split(" ")[1];
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

    playClickSound("drop");
    lastMoveSquares = [move.from, move.to];
    renderBoard();
    updateAfterMove(move, "Stockfish");
  }
}

function updateAfterMove(move, actor) {
  lastMoveTextEl.textContent = `${actor}: ${move.from}-${move.to}`;

  if (chess.isCheckmate()) {
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
  } else {
    setStatus(engineReady ? "Stockfish je na potezu." : "Stockfish se priprema...");
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
        const pieceEl = document.createElement("span");
        const pieceKey = `${boardPiece.color}${boardPiece.type}`;
        pieceEl.className = `piece ${boardPiece.color === "w" ? "white" : "black"}`;
        pieceEl.textContent = pieceMap[pieceKey];
        squareEl.append(pieceEl);
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

newGameButton.addEventListener("click", () => {
  chess.reset();
  selectedSquare = null;
  legalTargets = [];
  lastMoveSquares = [];
  engineBusy = false;
  mateBannerEl.classList.add("hidden");
  lastMoveTextEl.textContent = "Jos nema poteza.";
  if (engine) {
    engine.postMessage("ucinewgame");
    engine.postMessage("isready");
  }
  setStatus("Nova partija. Ti si bijeli.");
  renderBoard();
});

toggleMusicButton.addEventListener("click", () => {
  musicEnabled = !musicEnabled;
  toggleMusicButton.textContent = `Muzika: ${musicEnabled ? "ukljucena" : "iskljucena"}`;
  if (musicEnabled) {
    ensureAudio();
    startMusicLoop();
  } else {
    stopMusicLoop();
  }
});

renderBoard();
refreshStatus();
