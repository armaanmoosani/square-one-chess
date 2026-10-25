/* Square One — chess rules engine.
 *
 * Squares are numbered 0..63 with a1 = 0, h1 = 7, a8 = 56, h8 = 63.
 * Pieces use FEN letters: uppercase is White, lowercase is Black.
 * Positions are plain objects and are never mutated; makeMove returns a new one.
 *
 * Castling rights are tracked as "has this piece never moved?" bits on the six
 * home squares (e1, h1, a1, e8, h8, a8). That lets the castling checklist say
 * exactly which condition fails instead of only "castling not allowed".
 *
 * Verified against standard perft counts (see README, "Chess accuracy").
 */
(function (root) {
  'use strict';

  const FILES = 'abcdefgh';
  const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const ORTHO = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  const ALL8 = ORTHO.concat(DIAG);
  const SLIDES = { b: DIAG, r: ORTHO, q: ALL8 };

  const HOME_SQUARES = [4, 7, 0, 60, 63, 56]; // e1 h1 a1 e8 h8 a8
  const CASTLE = {
    wK: { king: 4, rook: 7, kingTo: 6, rookTo: 5, between: [5, 6], pass: 5 },
    wQ: { king: 4, rook: 0, kingTo: 2, rookTo: 3, between: [1, 2, 3], pass: 3 },
    bK: { king: 60, rook: 63, kingTo: 62, rookTo: 61, between: [61, 62], pass: 61 },
    bQ: { king: 60, rook: 56, kingTo: 58, rookTo: 59, between: [57, 58, 59], pass: 59 },
  };

  const sq = (f, r) => r * 8 + f;
  const fileOf = (s) => s & 7;
  const rankOf = (s) => s >> 3;
  const onBoard = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;
  const name = (s) => FILES[s & 7] + ((s >> 3) + 1);
  const colorOf = (p) => (p ? (p === p.toUpperCase() ? 'w' : 'b') : null);
  const typeOf = (p) => (p ? p.toLowerCase() : null);
  const other = (c) => (c === 'w' ? 'b' : 'w');
  const make = (color, type) => (color === 'w' ? type.toUpperCase() : type.toLowerCase());
  const isLight = (s) => (fileOf(s) + rankOf(s)) % 2 === 1;
  const homeBit = (s) => {
    const i = HOME_SQUARES.indexOf(s);
    return i < 0 ? 0 : 1 << i;
  };

  function index(n) {
    if (typeof n === 'number') return n;
    const f = FILES.indexOf(n[0]);
    const r = Number(n[1]) - 1;
    if (n.length !== 2 || f < 0 || !(r >= 0 && r < 8)) throw new Error('Not a square: ' + n);
    return sq(f, r);
  }

  /* ---------- FEN ---------- */

  function parseFEN(fen) {
    const parts = fen.trim().split(/\s+/);
    const rows = parts[0].split('/');
    if (rows.length !== 8) throw new Error('FEN needs 8 ranks: ' + fen);
    const board = new Array(64).fill(null);
    rows.forEach((row, i) => {
      let f = 0;
      for (const ch of row) {
        if (ch >= '1' && ch <= '8') f += Number(ch);
        else if ('pnbrqkPNBRQK'.includes(ch) && f < 8) board[sq(f++, 7 - i)] = ch;
        else throw new Error('Bad FEN rank "' + row + '": ' + fen);
      }
      if (f !== 8) throw new Error('FEN rank "' + row + '" is not 8 squares: ' + fen);
    });
    const rights = parts[2] && parts[2] !== '-' ? parts[2] : '';
    let cr = 0;
    const grant = (key) => { cr |= homeBit(CASTLE[key].king) | homeBit(CASTLE[key].rook); };
    if (rights.includes('K')) grant('wK');
    if (rights.includes('Q')) grant('wQ');
    if (rights.includes('k')) grant('bK');
    if (rights.includes('q')) grant('bQ');
    return {
      board,
      turn: parts[1] === 'b' ? 'b' : 'w',
      cr,
      ep: parts[3] && parts[3] !== '-' ? index(parts[3]) : null,
      halfmove: Number(parts[4]) || 0,
      fullmove: Number(parts[5]) || 1,
    };
  }

  function hasRight(pos, color, side) {
    const c = CASTLE[color + side];
    return !!(pos.cr & homeBit(c.king)) && !!(pos.cr & homeBit(c.rook)) &&
      pos.board[c.king] === make(color, 'k') && pos.board[c.rook] === make(color, 'r');
  }

  function toFEN(pos) {
    let placement = '';
    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = pos.board[sq(f, r)];
        if (!p) { empty++; continue; }
        if (empty) { placement += empty; empty = 0; }
        placement += p;
      }
      if (empty) placement += empty;
      if (r) placement += '/';
    }
    let rights = '';
    if (hasRight(pos, 'w', 'K')) rights += 'K';
    if (hasRight(pos, 'w', 'Q')) rights += 'Q';
    if (hasRight(pos, 'b', 'K')) rights += 'k';
    if (hasRight(pos, 'b', 'Q')) rights += 'q';
    return [placement, pos.turn, rights || '-', pos.ep != null ? name(pos.ep) : '-', pos.halfmove, pos.fullmove].join(' ');
  }

  /* ---------- Attacks ---------- */

  /** Squares holding a piece of colour `by` that attacks square `target`. */
  function attackers(pos, target, by) {
    const b = pos.board;
    const out = [];
    const f0 = fileOf(target);
    const r0 = rankOf(target);
    const pawnRank = by === 'w' ? r0 - 1 : r0 + 1;
    for (const df of [-1, 1]) {
      const f = f0 + df;
      if (onBoard(f, pawnRank) && b[sq(f, pawnRank)] === make(by, 'p')) out.push(sq(f, pawnRank));
    }
    for (const [df, dr] of KNIGHT) {
      const f = f0 + df, r = r0 + dr;
      if (onBoard(f, r) && b[sq(f, r)] === make(by, 'n')) out.push(sq(f, r));
    }
    for (const [df, dr] of ALL8) {
      const f = f0 + df, r = r0 + dr;
      if (onBoard(f, r) && b[sq(f, r)] === make(by, 'k')) out.push(sq(f, r));
    }
    for (const [df, dr] of ALL8) {
      const diagonal = df !== 0 && dr !== 0;
      let f = f0 + df, r = r0 + dr;
      while (onBoard(f, r)) {
        const p = b[sq(f, r)];
        if (p) {
          if (colorOf(p) === by) {
            const t = typeOf(p);
            if (t === 'q' || (diagonal ? t === 'b' : t === 'r')) out.push(sq(f, r));
          }
          break;
        }
        f += df; r += dr;
      }
    }
    return out;
  }

  const isAttacked = (pos, s, by) => attackers(pos, s, by).length > 0;
  const findKing = (pos, color) => pos.board.indexOf(make(color, 'k'));

  function inCheck(pos, color) {
    const c = color || pos.turn;
    const k = findKing(pos, c);
    return k >= 0 && isAttacked(pos, k, other(c));
  }

  /* ---------- Castling ---------- */

  /** Every castling condition for one side, so the UI can show a live checklist. */
  function castlingReport(pos, color, side) {
    const c = CASTLE[color + side];
    const b = pos.board;
    const them = other(color);
    const kingHome = b[c.king] === make(color, 'k');
    const rookHome = b[c.rook] === make(color, 'r');
    const blockers = c.between.filter((s) => b[s]);
    const checkers = kingHome ? attackers(pos, c.king, them) : [];
    const passAttackers = attackers(pos, c.pass, them);
    const landAttackers = attackers(pos, c.kingTo, them);
    const conditions = [
      { id: 'king-unmoved', ok: kingHome && !!(pos.cr & homeBit(c.king)), squares: [c.king] },
      { id: 'rook-unmoved', ok: rookHome && !!(pos.cr & homeBit(c.rook)), squares: [c.rook] },
      { id: 'path-clear', ok: blockers.length === 0, squares: c.between.slice(), blockers },
      { id: 'not-in-check', ok: checkers.length === 0, squares: [c.king], attackers: checkers },
      { id: 'pass-safe', ok: passAttackers.length === 0, squares: [c.pass], attackers: passAttackers },
      { id: 'land-safe', ok: landAttackers.length === 0, squares: [c.kingTo], attackers: landAttackers },
    ];
    return {
      color, side, conditions,
      ok: conditions.every((x) => x.ok),
      king: c.king, rook: c.rook, kingTo: c.kingTo, rookTo: c.rookTo, pass: c.pass,
    };
  }

  function addCastles(pos, from, moves) {
    for (const side of ['K', 'Q']) {
      const c = CASTLE[pos.turn + side];
      if (from !== c.king || !(pos.cr & homeBit(c.king)) || !(pos.cr & homeBit(c.rook))) continue;
      if (castlingReport(pos, pos.turn, side).ok) {
        moves.push({ from, to: c.kingTo, piece: pos.board[from], captured: null, castle: side, rookFrom: c.rook, rookTo: c.rookTo });
      }
    }
  }

  /* ---------- Move generation ---------- */

  /** Moves that follow each piece's pattern, before checking king safety. */
  function pseudoMoves(pos, onlyFrom) {
    const moves = [];
    const b = pos.board;
    const us = pos.turn;
    const them = other(us);
    const first = onlyFrom == null ? 0 : onlyFrom;
    const last = onlyFrom == null ? 63 : onlyFrom;
    for (let s = first; s <= last; s++) {
      const p = b[s];
      if (!p || colorOf(p) !== us) continue;
      const t = typeOf(p);
      const f0 = fileOf(s);
      const r0 = rankOf(s);
      const add = (to, extra) => moves.push(Object.assign({ from: s, to, piece: p, captured: b[to] || null }, extra));

      if (t === 'p') {
        const dir = us === 'w' ? 1 : -1;
        const r1 = r0 + dir;
        if (!onBoard(f0, r1)) continue;
        const promoRank = us === 'w' ? 7 : 0;
        const addPawn = (to) => {
          if (rankOf(to) === promoRank) for (const promotion of 'qrbn') add(to, { promotion });
          else add(to);
        };
        if (!b[sq(f0, r1)]) {
          addPawn(sq(f0, r1));
          const r2 = r0 + 2 * dir;
          if (r0 === (us === 'w' ? 1 : 6) && !b[sq(f0, r2)]) add(sq(f0, r2), { double: true });
        }
        for (const df of [-1, 1]) {
          const f = f0 + df;
          if (!onBoard(f, r1)) continue;
          const to = sq(f, r1);
          const target = b[to];
          if (target && colorOf(target) === them) addPawn(to);
          else if (!target && pos.ep === to && b[sq(f, r0)] === make(them, 'p')) {
            add(to, { ep: true, captureSq: sq(f, r0), captured: b[sq(f, r0)] });
          }
        }
      } else if (t === 'n' || t === 'k') {
        for (const [df, dr] of t === 'n' ? KNIGHT : ALL8) {
          const f = f0 + df, r = r0 + dr;
          if (!onBoard(f, r)) continue;
          const target = b[sq(f, r)];
          if (!target || colorOf(target) === them) add(sq(f, r));
        }
        if (t === 'k') addCastles(pos, s, moves);
      } else {
        for (const [df, dr] of SLIDES[t]) {
          let f = f0 + df, r = r0 + dr;
          while (onBoard(f, r)) {
            const target = b[sq(f, r)];
            if (!target) add(sq(f, r));
            else {
              if (colorOf(target) === them) add(sq(f, r));
              break;
            }
            f += df; r += dr;
          }
        }
      }
    }
    return moves;
  }

  function makeMove(pos, m) {
    const b = pos.board.slice();
    const us = pos.turn;
    const moving = b[m.from];
    b[m.from] = null;
    if (m.ep) b[m.captureSq] = null;
    b[m.to] = m.promotion ? make(us, m.promotion) : moving;
    if (m.castle) {
      b[m.rookTo] = b[m.rookFrom];
      b[m.rookFrom] = null;
    }
    return {
      board: b,
      turn: other(us),
      cr: pos.cr & ~(homeBit(m.from) | homeBit(m.to)),
      ep: m.double ? (m.from + m.to) / 2 : null,
      halfmove: typeOf(moving) === 'p' || m.captured ? 0 : pos.halfmove + 1,
      fullmove: pos.fullmove + (us === 'b' ? 1 : 0),
    };
  }

  /** Fully legal moves: the mover's king is never left in check, and kings are never captured. */
  function legalMoves(pos, onlyFrom) {
    const us = pos.turn;
    const them = other(us);
    return pseudoMoves(pos, onlyFrom).filter((m) => {
      if (m.captured && typeOf(m.captured) === 'k') return false;
      const next = makeMove(pos, m);
      const k = findKing(next, us);
      return k < 0 || !isAttacked(next, k, them);
    });
  }

  /** Find the legal move written as "e2e4" or "e7e8q". */
  function moveFromUci(pos, uci) {
    const from = index(uci.slice(0, 2));
    const to = index(uci.slice(2, 4));
    const promotion = uci[4] || null;
    return legalMoves(pos, from).find((m) => m.to === to && (m.promotion || null) === promotion) || null;
  }

  function uciOf(m) {
    return name(m.from) + name(m.to) + (m.promotion || '');
  }

  /* ---------- Game state ---------- */

  function insufficientMaterial(pos) {
    const pieces = [];
    pos.board.forEach((p, s) => { if (p && typeOf(p) !== 'k') pieces.push({ t: typeOf(p), s }); });
    if (pieces.length === 0) return true;
    if (pieces.length === 1 && (pieces[0].t === 'b' || pieces[0].t === 'n')) return true;
    if (pieces.every((x) => x.t === 'b')) {
      const shade = isLight(pieces[0].s);
      return pieces.every((x) => isLight(x.s) === shade);
    }
    return false;
  }

  function status(pos) {
    const moves = legalMoves(pos);
    const king = findKing(pos, pos.turn);
    const checkers = king < 0 ? [] : attackers(pos, king, other(pos.turn));
    const bothKings = king >= 0 && findKing(pos, other(pos.turn)) >= 0;
    const check = checkers.length > 0;
    return {
      moves, king, checkers, check,
      checkmate: check && moves.length === 0,
      stalemate: bothKings && !check && moves.length === 0,
      insufficient: bothKings && insufficientMaterial(pos),
    };
  }

  /** Key for repetition detection: placement, turn, rights, and a capturable en passant square. */
  function positionKey(pos) {
    const epLive = pos.ep != null && legalMoves(pos).some((m) => m.ep);
    const fen = toFEN(Object.assign({}, pos, { ep: epLive ? pos.ep : null })).split(' ');
    return fen.slice(0, 4).join(' ');
  }

  /** How a legal move answers a check: 'capture' the checker, move the 'king', or 'block'. */
  function escapeKind(pos, m, checkers) {
    const list = checkers || attackers(pos, findKing(pos, pos.turn), other(pos.turn));
    const capturedOn = m.ep ? m.captureSq : (m.captured ? m.to : null);
    if (capturedOn != null && list.includes(capturedOn)) return 'capture';
    if (typeOf(m.piece) === 'k') return 'king';
    return 'block';
  }

  /** Check analysis: every way out grouped by kind, and why each square around the king is or isn't available. */
  function escapes(pos) {
    const st = status(pos);
    const groups = { king: [], block: [], capture: [] };
    if (st.check) for (const m of st.moves) groups[escapeKind(pos, m, st.checkers)].push(m);
    const around = [];
    if (st.king >= 0) {
      for (const [df, dr] of ALL8) {
        const f = fileOf(st.king) + df, r = rankOf(st.king) + dr;
        if (!onBoard(f, r)) continue;
        const s = sq(f, r);
        const occupant = pos.board[s];
        if (st.moves.some((m) => m.from === st.king && m.to === s && !m.castle)) {
          around.push({ square: s, reason: 'free', attackers: [] });
        } else if (occupant && colorOf(occupant) === pos.turn) {
          around.push({ square: s, reason: 'own', attackers: [] });
        } else {
          const next = makeMove(pos, { from: st.king, to: s, piece: pos.board[st.king], captured: occupant });
          around.push({ square: s, reason: 'attacked', attackers: attackers(next, s, other(pos.turn)) });
        }
      }
    }
    return Object.assign(st, { groups, around });
  }

  /* ---------- Explanations ---------- */

  /** Why moving from -> to is or isn't allowed. Returns { code, ...details }. */
  function explain(pos, from, to) {
    const b = pos.board;
    const p = b[from];
    if (!p) return { code: 'empty' };
    const us = colorOf(p);
    const them = other(us);
    const t = typeOf(p);
    if (us !== pos.turn) return { code: 'turn' };
    if (from === to) return { code: 'same' };

    const legal = legalMoves(pos, from).filter((m) => m.to === to);
    if (legal.length) return { code: 'legal', moves: legal };

    if (t === 'k') {
      for (const side of ['K', 'Q']) {
        const c = CASTLE[us + side];
        if (from === c.king && to === c.kingTo) return { code: 'castle', report: castlingReport(pos, us, side) };
      }
    }

    const target = b[to];
    if (target && colorOf(target) === us) return { code: 'own-piece', square: to };
    if (target && typeOf(target) === 'k') return { code: 'king-capture', square: to };

    const pseudo = pseudoMoves(pos, from).find((m) => m.to === to);
    if (pseudo) {
      const next = makeMove(pos, pseudo);
      const king = findKing(next, us);
      const att = attackers(next, king, them);
      if (t === 'k') return { code: 'king-attacked', square: to, attackers: att };
      return { code: inCheck(pos, us) ? 'still-in-check' : 'pinned', king, attackers: att };
    }

    const df = fileOf(to) - fileOf(from);
    const dr = rankOf(to) - rankOf(from);
    if (t === 'p') {
      const dir = us === 'w' ? 1 : -1;
      if (dr * dir <= 0) return { code: 'pawn-backward' };
      if (df === 0) {
        if (dr === 2 * dir && rankOf(from) !== (us === 'w' ? 1 : 6)) return { code: 'pawn-double-late' };
        if (dr === 2 * dir && b[from + 8 * dir]) return { code: 'blocked', blocker: from + 8 * dir };
        if (dr === dir || dr === 2 * dir) return { code: 'pawn-blocked', blocker: to };
        return { code: 'pawn-too-far' };
      }
      if (Math.abs(df) === 1 && dr === dir && !target) return { code: 'pawn-diagonal-empty' };
      return { code: 'pattern' };
    }
    if (t === 'n' || t === 'k') return { code: 'pattern' };
    const straight = df === 0 || dr === 0;
    const diagonal = Math.abs(df) === Math.abs(dr);
    const fits = (t === 'r' && straight) || (t === 'b' && diagonal) || (t === 'q' && (straight || diagonal));
    if (!fits) return { code: 'pattern' };
    const sf = Math.sign(df), sr = Math.sign(dr);
    for (let f = fileOf(from) + sf, r = rankOf(from) + sr; sq(f, r) !== to; f += sf, r += sr) {
      if (b[sq(f, r)]) return { code: 'blocked', blocker: sq(f, r) };
    }
    return { code: 'pattern' };
  }

  /** Movement lines for drawing: each direction lists the open squares and what stops the line. */
  function rays(pos, from) {
    const p = pos.board[from];
    if (!p) return [];
    const t = typeOf(p);
    const us = colorOf(p);
    const dirs = SLIDES[t] || (t === 'k' ? ALL8 : null);
    if (!dirs) return [];
    const reach = t === 'k' ? 1 : 8;
    return dirs.map(([df, dr]) => {
      const squares = [];
      let stop = null, stopKind = null;
      let f = fileOf(from) + df, r = rankOf(from) + dr;
      for (let n = 0; n < reach && onBoard(f, r); n++) {
        const q = pos.board[sq(f, r)];
        if (q) {
          stop = sq(f, r);
          stopKind = colorOf(q) === us ? 'own' : 'enemy';
          break;
        }
        squares.push(sq(f, r));
        f += df; r += dr;
      }
      return { dir: [df, dr], squares, stop, stopKind };
    });
  }

  /** Every square a pawn could capture on (diagonally forward), whether or not something is there. */
  function pawnCaptureSquares(from, color) {
    const r = rankOf(from) + (color === 'w' ? 1 : -1);
    return [-1, 1].map((df) => fileOf(from) + df).filter((f) => onBoard(f, r)).map((f) => sq(f, r));
  }

  function perft(pos, depth) {
    if (depth === 0) return 1;
    const moves = legalMoves(pos);
    if (depth === 1) return moves.length;
    let n = 0;
    for (const m of moves) n += perft(makeMove(pos, m), depth - 1);
    return n;
  }

  root.SQ1 = root.SQ1 || {};
  root.SQ1.Engine = {
    START: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    PIECE_NAMES, CASTLE,
    sq, fileOf, rankOf, name, index, colorOf, typeOf, other, make, isLight,
    parseFEN, toFEN, hasRight, attackers, isAttacked, findKing, inCheck,
    pseudoMoves, legalMoves, makeMove, moveFromUci, uciOf,
    castlingReport, status, escapes, escapeKind, explain, rays, pawnCaptureSquares,
    insufficientMaterial, positionKey, perft,
  };
})(typeof window !== 'undefined' ? window : globalThis);
