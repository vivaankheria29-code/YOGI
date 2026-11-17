// A small, dependency-free chess board drawn from a FEN position.
// Plugin widgets (like Smart Chess) cannot be shown inside YOGI, so replies
// carry the position as FEN and this board makes it visible and playable:
// tap a piece, tap a square, and the move is sent back as text (e.g. "e2e4").
const GLYPH = {k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟'};
const NAME = {k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn'};
const FILES = 'abcdefgh';

export function parseFen(fen) {
  const [board = '', turn = 'w'] = String(fen).trim().split(/\s+/);
  const ranks = board.split('/');
  if (ranks.length !== 8) return null;
  const squares = {};
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const ch of ranks[r]) {
      if (/\d/.test(ch)) { f += Number(ch); continue; }
      if (!/[prnbqk]/i.test(ch) || f > 7) return null;
      squares[FILES[f] + (8 - r)] = {type: ch.toLowerCase(), color: ch === ch.toUpperCase() ? 'w' : 'b'};
      f++;
    }
    if (f !== 8) return null;
  }
  return {squares, turn: turn === 'b' ? 'b' : 'w'};
}

export function renderBoard(fen, {onMove, flipped} = {}) {
  const position = parseFen(fen);
  if (!position) return null;
  const wrap = document.createElement('figure'); wrap.className = 'chess';
  const grid = document.createElement('div'); grid.className = 'chess-board'; grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', `Chess board, ${position.turn === 'w' ? 'White' : 'Black'} to move`);
  const caption = document.createElement('figcaption'); caption.className = 'chess-caption';
  const status = document.createElement('span');
  status.textContent = `${position.turn === 'w' ? 'White' : 'Black'} to move${onMove ? ' · tap a piece, then a square' : ''}`;
  const flip = document.createElement('button'); flip.type = 'button'; flip.className = 'chess-flip'; flip.textContent = 'Flip board';
  caption.append(status, flip);
  let selected = null, view = flipped ?? position.turn === 'b';
  const draw = () => {
    grid.replaceChildren();
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const file = FILES[view ? 7 - col : col], rank = view ? row + 1 : 8 - row, square = file + rank;
        const piece = position.squares[square];
        const cell = document.createElement('button'); cell.type = 'button';
        cell.className = 'chess-square ' + ((FILES.indexOf(file) + rank) % 2 ? 'light' : 'dark');
        cell.dataset.square = square;
        cell.setAttribute('aria-label', square + (piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${NAME[piece.type]}` : ' empty'));
        if (selected === square) cell.classList.add('selected');
        if (piece) { const glyph = document.createElement('span'); glyph.className = 'chess-piece ' + piece.color; glyph.textContent = GLYPH[piece.type] + '︎'; cell.append(glyph); }
        if (col === 0) { const label = document.createElement('i'); label.className = 'rank'; label.textContent = rank; cell.append(label); }
        if (row === 7) { const label = document.createElement('i'); label.className = 'file'; label.textContent = file; cell.append(label); }
        cell.onclick = () => {
          if (!onMove) return;
          const own = piece && piece.color === position.turn;
          if (!selected) { if (own) { selected = square; draw(); } return; }
          if (selected === square) { selected = null; draw(); return; }
          if (own) { selected = square; draw(); return; }
          const from = selected, moving = position.squares[from];
          let move = from + square;
          if (moving.type === 'p' && (rank === 8 || rank === 1)) move += 'q';
          position.squares[square] = moving; delete position.squares[from]; selected = null;
          position.turn = position.turn === 'w' ? 'b' : 'w';
          status.textContent = `You played ${move}. Waiting for the reply…`;
          draw(); grid.classList.add('locked'); onMove(move);
        };
        grid.append(cell);
      }
    }
  };
  flip.onclick = () => { view = !view; draw(); };
  draw();
  wrap.append(grid, caption);
  return wrap;
}
