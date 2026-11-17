// A real, playable chess game inside YOGI. Chess plugins can start a game but
// cannot take moves here, so YOGI keeps the game itself: full rules (chess.js),
// a built-in engine with ten levels, undo, flip and new game. The game lives in
// the conversation message, so it survives reloads.
import {Chess} from './vendor/chess.js';

const GLYPH = {k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟'};
const NAME = {k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn'};
const VALUE = {p: 100, n: 320, b: 330, r: 500, q: 900, k: 0};
// Piece-square tables from White's side (a8 first), the classic simplified set.
const PST = {
  p: [0,0,0,0,0,0,0,0,50,50,50,50,50,50,50,50,10,10,20,30,30,20,10,10,5,5,10,25,25,10,5,5,0,0,0,20,20,0,0,0,5,-5,-10,0,0,-10,-5,5,5,10,10,-20,-20,10,10,5,0,0,0,0,0,0,0,0],
  n: [-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,0,0,0,-20,-40,-30,0,10,15,15,10,0,-30,-30,5,15,20,20,15,5,-30,-30,0,15,20,20,15,0,-30,-30,5,10,15,15,10,5,-30,-40,-20,0,5,5,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50],
  b: [-20,-10,-10,-10,-10,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,10,10,5,0,-10,-10,5,5,10,10,5,5,-10,-10,0,10,10,10,10,0,-10,-10,10,10,10,10,10,10,-10,-10,5,0,0,0,0,5,-10,-20,-10,-10,-10,-10,-10,-10,-20],
  r: [0,0,0,0,0,0,0,0,5,10,10,10,10,10,10,5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,0,0,0,5,5,0,0,0],
  q: [-20,-10,-10,-5,-5,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,5,5,5,0,-10,-5,0,5,5,5,5,0,-5,0,0,5,5,5,5,0,-5,-10,5,5,5,5,5,0,-10,-10,0,5,0,0,0,0,-10,-20,-10,-10,-5,-5,-10,-10,-20],
  k: [-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-20,-30,-30,-40,-40,-30,-30,-20,-10,-20,-20,-20,-20,-20,-20,-10,20,20,0,0,0,0,20,20,20,30,10,0,0,10,30,20],
};
function evaluate(game) {
  // Score from the side to move.
  let score = 0; const board = game.board();
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const piece = board[r][f]; if (!piece) continue;
    const index = piece.color === 'w' ? r * 8 + f : (7 - r) * 8 + f;
    const v = VALUE[piece.type] + PST[piece.type][index];
    score += piece.color === 'w' ? v : -v;
  }
  return game.turn() === 'w' ? score : -score;
}
const order = moves => moves.sort((a, b) => (b.captured ? VALUE[b.captured] * 10 - VALUE[b.piece] : 0) + (b.promotion ? 800 : 0) - ((a.captured ? VALUE[a.captured] * 10 - VALUE[a.piece] : 0) + (a.promotion ? 800 : 0)));
function search(game, depth, alpha, beta, budget) {
  if (budget.nodes++ > budget.max) return evaluate(game);
  if (game.isCheckmate()) return -100000 - depth;
  if (game.isDraw() || game.isStalemate()) return 0;
  if (depth === 0) return quiesce(game, alpha, beta, budget, 3);
  for (const move of order(game.moves({verbose: true}))) {
    game.move(move); const score = -search(game, depth - 1, -beta, -alpha, budget); game.undo();
    if (score >= beta) return beta; if (score > alpha) alpha = score;
  }
  return alpha;
}
function quiesce(game, alpha, beta, budget, left) {
  const stand = evaluate(game); if (stand >= beta || left === 0) return stand; if (stand > alpha) alpha = stand;
  for (const move of order(game.moves({verbose: true}).filter(m => m.captured))) {
    if (budget.nodes++ > budget.max) break;
    game.move(move); const score = -quiesce(game, -beta, -alpha, budget, left - 1); game.undo();
    if (score >= beta) return beta; if (score > alpha) alpha = score;
  }
  return alpha;
}
// Levels 1–10: shallow and forgiving at the bottom, three plies with captures checked at the top.
export function bestMove(fen, level = 5) {
  const game = new Chess(fen), moves = order(game.moves({verbose: true}));
  if (!moves.length) return null;
  const depth = level <= 3 ? 1 : level <= 6 ? 2 : 3, noise = level <= 2 ? 220 : level <= 4 ? 80 : level <= 6 ? 25 : 0;
  const budget = {nodes: 0, max: level >= 9 ? 60000 : 25000};
  let best = moves[0], bestScore = -Infinity;
  for (const move of moves) {
    game.move(move); let score = -search(game, depth - 1, -Infinity, Infinity, budget); game.undo();
    score += (Math.random() - .5) * noise;
    if (score > bestScore) { bestScore = score; best = move; }
  }
  return best;
}

let engineWorker=null,engineSequence=0;
const engineJobs=new Map();
function resetEngine(){engineWorker?.terminate();engineWorker=null;for(const job of engineJobs.values()){clearTimeout(job.timer);job.reject(new Error('Chess engine stopped.'));}engineJobs.clear();}
export function requestChessMove(fen,level){
  if(typeof Worker==='undefined')return Promise.resolve().then(()=>bestMove(fen,Math.min(level,3)));
  if(!engineWorker){
    engineWorker=new Worker(new URL('./chess-worker.js',import.meta.url),{type:'module'});
    engineWorker.onmessage=({data})=>{const job=engineJobs.get(data.id);if(!job)return;engineJobs.delete(data.id);clearTimeout(job.timer);data.error?job.reject(new Error(data.error)):job.resolve(data.move);};
    engineWorker.onerror=resetEngine;
  }
  return new Promise((resolve,reject)=>{const id=++engineSequence,timer=setTimeout(resetEngine,15000);engineJobs.set(id,{resolve,reject,timer});engineWorker.postMessage({id,fen,level});});
}
if(typeof window!=='undefined')window.addEventListener('pagehide',resetEngine);

export function startFen(text) {
  const m = /([rnbqkpRNBQKP1-8]{1,8}(?:\/[rnbqkpRNBQKP1-8]{1,8}){7}(?:\s+[wb](?:\s+(?:[KQkq]{1,4}|-))?(?:\s+(?:[a-h][36]|-))?(?:\s+\d+\s+\d+)?)?)/.exec(String(text || ''));
  if (!m) return null;
  try { return new Chess(m[1].trim().split(/\s+/).length < 6 ? completeFen(m[1]) : m[1].trim()).fen(); } catch { return null; }
}
function completeFen(partial) { const p = partial.trim().split(/\s+/); return [p[0], p[1] || 'w', p[2] || '-', p[3] || '-', p[4] || '0', p[5] || '1'].join(' '); }

// state: {fen, moves: [san...], start, level, player: 'w'|'b', flipped}
export function mountGame(container, state, {save, interactive = true, onEvent} = {}) {
  if (!state.start) state.start = state.fen;
  state.moves ||= []; state.level = Math.min(10, Math.max(1, Number(state.level) || 5)); state.player ||= 'w';
  const game = new Chess(state.start); for (const san of state.moves) { try { game.move(san); } catch { break; } }
  const wrap = document.createElement('figure'); wrap.className = 'chess';
  const grid = document.createElement('div'); grid.className = 'chess-board'; grid.setAttribute('role', 'grid');
  const status = document.createElement('figcaption'); status.className = 'chess-status'; status.setAttribute('aria-live', 'polite');
  const tools = document.createElement('div'); tools.className = 'chess-tools';
  const moveList = document.createElement('ol'); moveList.className = 'chess-moves';
  const button = (label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = fn; tools.append(b); return b; };
  const level = document.createElement('select'); level.setAttribute('aria-label', 'Engine level');
  for (let i = 1; i <= 10; i++) level.append(new Option('Level ' + i, String(i)));
  level.value = String(state.level); level.onchange = () => { state.level = Number(level.value); save?.(); };
  let selected = null, thinking = false;
  const persist = () => { state.fen = game.fen(); state.moves = game.history(); save?.(); };
  const last = () => { const h = game.history({verbose: true}); return h[h.length - 1]; };
  const outcome = () => game.isCheckmate() ? (game.turn() === state.player ? 'Checkmate. YOGI wins this one.' : 'Checkmate. You win!') : game.isStalemate() ? 'Stalemate. It is a draw.' : game.isThreefoldRepetition() ? 'Draw by repetition.' : game.isInsufficientMaterial() ? 'Draw: not enough material.' : game.isDraw() ? 'Draw.' : '';
  function engineMove() {
    if (!interactive || game.isGameOver() || game.turn() === state.player) return;
    thinking = true; draw();
    const position=game.fen();
    requestChessMove(position,state.level).then(move=>{
      if(!wrap.isConnected||game.fen()!==position)return;
      if(move){game.move(move);onEvent?.({type:'engine',san:move.san});}
      thinking=false;persist();draw();
    }).catch(()=>{if(!wrap.isConnected)return;thinking=false;draw();status.textContent='The chess engine could not finish. Try New game.';});
  }
  function play(from, to) {
    const piece = game.get(from);
    const promotion = piece?.type === 'p' && (to[1] === '8' || to[1] === '1') ? 'q' : undefined;
    let move; try { move = game.move({from, to, promotion}); } catch { move = null; }
    selected = null;
    if (!move) { status.textContent = 'That move is not legal here. Try another.'; wrap.classList.remove('shake'); void wrap.offsetWidth; wrap.classList.add('shake'); draw(false); return; }
    persist(); draw(); engineMove();
  }
  function draw(updateStatus = true) {
    grid.replaceChildren();
    const view = state.flipped ?? state.player === 'b', lm = last(), targets = selected ? game.moves({square: selected, verbose: true}).map(m => m.to) : [];
    const checkSquare = game.inCheck() ? game.board().flat().find(p => p && p.type === 'k' && p.color === game.turn())?.square : null;
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
      const file = 'abcdefgh'[view ? 7 - col : col], rank = view ? row + 1 : 8 - row, square = file + rank, piece = game.get(square);
      const cell = document.createElement('button'); cell.type = 'button';
      cell.className = 'chess-square ' + (('abcdefgh'.indexOf(file) + rank) % 2 ? 'light' : 'dark');
      if (lm && (lm.from === square || lm.to === square)) cell.classList.add('last');
      if (selected === square) cell.classList.add('selected');
      if (targets.includes(square)) cell.classList.add(piece ? 'capture' : 'target');
      if (checkSquare === square) cell.classList.add('check');
      cell.dataset.square = square;
      cell.setAttribute('aria-label', square + (piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${NAME[piece.type]}` : ''));
      if (piece) { const g = document.createElement('span'); g.className = 'chess-piece ' + piece.color; g.textContent = GLYPH[piece.type] + '︎'; cell.append(g); }
      if (col === 0) { const l = document.createElement('i'); l.className = 'rank'; l.textContent = rank; cell.append(l); }
      if (row === 7) { const l = document.createElement('i'); l.className = 'file'; l.textContent = file; cell.append(l); }
      cell.onclick = () => {
        if (!interactive || thinking || game.isGameOver() || game.turn() !== state.player) return;
        if (selected && targets.includes(square)) return play(selected, square);
        selected = piece && piece.color === state.player ? (selected === square ? null : square) : null; draw();
      };
      grid.append(cell);
    }
    grid.classList.toggle('locked', !interactive || thinking);
    moveList.replaceChildren(...game.history().reduce((rows, san, i) => { if (i % 2 === 0) { const li = document.createElement('li'); li.textContent = san; rows.push(li); } else rows[rows.length - 1].textContent += '  ' + san; return rows; }, []));
    moveList.scrollTop = moveList.scrollHeight;
    if (updateStatus) {
      const end = outcome();
      status.textContent = end || (thinking ? 'YOGI is thinking…' : game.turn() === state.player ? `${lm ? 'YOGI played ' + lm.san + '. ' : ''}Your move${game.inCheck() ? ' (you are in check)' : ''}. Tap a piece, then a square.` : 'YOGI to move.');
    }
  }
  if (interactive) {
    button('Undo', () => { if (thinking) return; game.undo(); if (game.turn() !== state.player) game.undo(); selected = null; persist(); draw(); });
    button('Flip', () => { state.flipped = !(state.flipped ?? state.player === 'b'); save?.(); draw(); });
    button('Play as black', function () { if(thinking)return;state.player = state.player === 'w' ? 'b' : 'w'; this.textContent = state.player === 'w' ? 'Play as black' : 'Play as white'; state.flipped = undefined; save?.(); draw(); engineMove(); }).textContent = state.player === 'w' ? 'Play as black' : 'Play as white';
    button('New game', () => { if (thinking) return; game.reset(); state.start = game.fen(); selected = null; persist(); draw(); engineMove(); });
    tools.append(level);
  }
  wrap.append(grid, status, tools, moveList);
  container.append(wrap);
  draw(); engineMove();
  return wrap;
}
