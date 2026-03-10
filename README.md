# Šah (by Alan Catovic)

Jednostavna web sah aplikacija u kojoj igras bijelim figurama protiv online Stockfish engine-a u browseru.

## Pokretanje

1. Otvori terminal u folderu `Sah`
2. Pokreni:

```powershell
node server.mjs
```

3. U browseru otvori:

```text
http://127.0.0.1:4173
```

## Sta je ukljuceno

- igranje protiv Stockfish engine-a
- klik zvuk pri podizanju i spustanju figure
- zuti trag zadnjeg poteza
- poruka `Mat!` kod sah-mata
- blaga generisana muzika u pozadini
- naslov `Šah (by Alan Catovic)`

## Koristeni open-source izvori

- `chess.js`: https://github.com/jhlywa/chess.js
- `stockfish.wasm`: https://github.com/lichess-org/stockfish.wasm

