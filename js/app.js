/* Square One — interface and lesson logic.
 *
 * Reads text from content.js (SQ1_TEXT, SQ1_UI), rules from engine.js and the
 * curriculum from lessons.js. Each lesson step is run by a controller chosen by
 * its `kind`; controllers drive the shared Board, the feedback box and the panel.
 */
(function () {
  'use strict';

  const E = SQ1.Engine;
  const Pieces = SQ1.Pieces;
  const { PARTS, LESSONS, CHALLENGE, TALK_ROUTE } = SQ1.Curriculum;
  const TALK = new Set(TALK_ROUTE || []);
  const TEXT = window.SQ1_TEXT || {};
  const UI = window.SQ1_UI || {};
  const EMPTY = '8/8/8/8/8/8/8/8 w - - 0 1';

  /* =====================================================================
   * Utilities
   * ===================================================================== */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const N = (s) => E.name(s);
  const idx = (s) => (typeof s === 'number' ? s : E.index(s));
  const f3 = (n) => n.toFixed(3);

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  function fromHTML(markup) {
    const t = document.createElement('template');
    t.innerHTML = markup.trim();
    return t.content.firstElementChild;
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fill = (t, vars) => t.replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m));
  const ui = (key, vars) => (UI[key] == null ? key : fill(UI[key], vars));

  function inline(s) {
    return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
  }
  function md(src) {
    return String(src).trim().split(/\n\s*\n/).map((block) => {
      const lines = block.split('\n');
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        return '<ul>' + lines.map((l) => '<li>' + inline(l.replace(/^\s*[-*]\s+/, '')) + '</li>').join('') + '</ul>';
      }
      return '<p>' + lines.map(inline).join('<br>') + '</p>';
    }).join('');
  }

  const store = {
    get(k, d) {
      try { const v = localStorage.getItem('sq1.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
    },
    set(k, v) {
      try { localStorage.setItem('sq1.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ }
    },
  };

  /* =====================================================================
   * Settings
   * ===================================================================== */
  const settings = Object.assign({ theme: 'system', motion: 'system', letters: false, coords: true, missing: true, large: false, speed: 'normal', advance: 'click', presenter: true, route: 'talk' }, store.get('settings', {}));
  /** Length of one piece move, and how long demonstrations linger, at each speed setting. */
  const moveMs = () => ({ slow: 760, normal: 500, fast: 280 }[settings.speed] || 500);
  /** Demonstrations wait for the presenter (→) before each visible change, unless set to move on by themselves. */
  const clickPace = () => settings.advance !== 'auto';
  /** Set while the click in progress is the one that gave the page focus; that click doesn't advance the presentation. */
  let focusingClick = false;
  const waitFactor = () => ({ slow: 1.45, normal: 1, fast: 0.6 }[settings.speed] || 1);
  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hostTheme = document.documentElement.getAttribute('data-theme');
  const reducedMotion = () => (settings.motion === 'reduce' ? true : settings.motion === 'full' ? false : mqReduce.matches);

  function applySettings() {
    const root = document.documentElement;
    if (settings.theme !== 'system') {
      root.setAttribute('data-theme', settings.theme);
      applySettings.themeSet = true;
    } else if (applySettings.themeSet) {
      if (hostTheme) root.setAttribute('data-theme', hostTheme); else root.removeAttribute('data-theme');
      applySettings.themeSet = false;
    }
    root.classList.toggle('reduce-motion', reducedMotion());
    root.classList.toggle('letters', !!settings.letters);
    root.classList.toggle('large-text', !!settings.large);
    $('#board-frame').classList.toggle('no-coords', !settings.coords || App.hideCoords);
  }
  mqReduce.addEventListener && mqReduce.addEventListener('change', applySettings);

  /* =====================================================================
   * Icons
   * ===================================================================== */
  const ICONS = {
    reset: '<path d="M3 4v6h6"/><path d="M3.5 15a9 9 0 1 0 2.1-9.4L3 10"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    hint: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
    danger: '<circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="2"/>',
    lines: '<path d="M4 20 20 4"/><path d="M13 4h7v7"/><path d="M4 12h8"/>',
    flip: '<path d="M7 20V4M4 7l3-3 3 3"/><path d="M17 4v16M14 17l3 3 3-3"/>',
    restart: '<path d="M5 5v14"/><path d="M19 6l-9 6 9 6z"/>',
    back: '<path d="M15 6l-6 6 6 6"/>',
    next: '<path d="M9 6l6 6-6 6"/>',
    play: '<path d="M7 5v14l12-7z" fill="currentColor"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    alert: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17.2v.3"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.6v.3"/>',
    success: '<circle cx="12" cy="12" r="9"/><path d="M7.5 12.5l3 3 6-6"/>',
    error: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/>',
    turnLeft: '<path d="M3 4v6h6"/><path d="M3.5 15a9 9 0 1 0 2.1-9.4L3 10"/>',
    turnRight: '<path d="M21 4v6h-6"/><path d="M20.5 15a9 9 0 1 1-2.1-9.4L21 10"/>',
    arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    pen: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    film: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.5v5l4-2.5z"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
    branch: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M6 3v12.5"/><path d="M18 8.5A9.5 9.5 0 0 1 8.5 18"/>',
    order: '<path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 6h1v4M4 10h2M4 14h2l-2 3h2"/>',
    optional: '<circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
    presenter: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.2c2.6.4 4.5 2.8 4.5 5.8"/>',
    flag: '<path d="M5 21V4h11l-1.5 4L16 12H5"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
    maximize: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    eraser: '<path d="M4 20h16"/><path d="M14.5 4.5l5 5-8 8H6.5l-3-3z"/>',
    qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>',
  };
  function icon(name, cls) {
    return fromHTML(`<svg class="icon ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`);
  }
  const TONE_ICON = { info: 'info', success: 'success', error: 'error', warn: 'alert' };

  /* =====================================================================
   * Text blocks (content.js)
   * ===================================================================== */
  const hasText = (id) => !!(TEXT[id] && TEXT[id].text && TEXT[id].text.trim());

  function textBlock(id) {
    const entry = TEXT[id];
    if (!entry) return null;
    if (hasText(id)) return h('div', { class: 'prose', html: md(entry.text) });
    // Optional captions and extras simply don't appear until someone writes them.
    if (entry.optional) return null;
    return h('div', { class: 'placeholder' },
      h('p', { class: 'ph-label' }, icon('pen'), ui('placeholder.label'), h('code', null, id)),
      h('p', { class: 'ph-brief' }, entry.brief),
      entry.length ? h('p', { class: 'ph-length' }, entry.length) : null);
  }

  function cautionBlock(id) {
    const inner = textBlock(id);
    if (!inner) return null;
    // An optional caution that hasn't been written is hidden along with its placeholder while presenting.
    return h('aside', { class: 'caution' + (inner.classList.contains('optional') ? ' unwritten' : ''), 'aria-label': ui('caution.label') },
      h('p', { class: 'caution-head' }, icon('alert'), ui('caution.label')), inner);
  }

  /* =====================================================================
   * Chess wording
   * ===================================================================== */
  const LETTERS = { k: 'K', q: 'Q', r: 'R', b: 'B', n: 'N', p: 'P' };
  const pieceName = (p) => E.PIECE_NAMES[E.typeOf(p)];
  const fullName = (p) => ui('side.' + E.colorOf(p) + '.lower') + ' ' + pieceName(p);
  const sideName = (c) => ui('side.' + c);

  function listPieces(pos, squares) {
    const items = squares.map((s) => ui('name.on', { piece: pieceName(pos.board[s]), square: N(s) }));
    if (items.length <= 1) return items[0] || '';
    return items.slice(0, -1).join(', ') + ui('why.and') + items[items.length - 1];
  }

  function describeMove(prev, m) {
    const vars = { Side: sideName(E.colorOf(m.piece)), piece: pieceName(m.piece), from: N(m.from), to: N(m.to) };
    if (m.castle) return ui('fb.castle.' + m.castle, Object.assign(vars, { rookFrom: N(m.rookFrom), rookTo: N(m.rookTo) }));
    if (m.ep) return ui('fb.ep', Object.assign(vars, { captureSq: N(m.captureSq) }));
    if (m.promotion) {
      let s = ui('fb.promote', Object.assign(vars, { promo: E.PIECE_NAMES[m.promotion] }));
      if (m.captured) s += ' ' + ui('fb.promote.capture', { victim: fullName(m.captured) });
      return s;
    }
    if (m.captured) return ui('fb.capture', Object.assign(vars, { victim: fullName(m.captured) }));
    return ui('fb.move', vars);
  }

  const moveShort = (m) => pieceName(m.piece) + ' ' + N(m.from) + ' → ' + N(m.to);
  const bothKings = (pos) => E.findKing(pos, 'w') >= 0 && E.findKing(pos, 'b') >= 0;

  function stateLine(pos) {
    if (!bothKings(pos)) return '';
    const st = E.status(pos);
    if (st.checkmate) return ui('fb.checkmate', { Winner: sideName(E.other(pos.turn)) });
    if (st.stalemate) return ui('fb.stalemate', { Side: sideName(pos.turn) });
    if (st.check) return ui('fb.check', { Side: sideName(pos.turn) });
    if (st.insufficient) return ui('fb.insufficient');
    return '';
  }

  function castleReason(pos, c) {
    if (c.id === 'path-clear') return ui('why.castle.path-clear', { squares: c.squares.map(N).join(', ') });
    if (c.id === 'pass-safe' || c.id === 'land-safe') return ui('why.castle.' + c.id, { square: N(c.squares[0]), attackers: listPieces(pos, c.attackers) });
    return ui('why.castle.' + c.id);
  }

  function whyText(pos, from, to, ex, ctx) {
    const p = pos.board[from];
    const v = { piece: p ? pieceName(p) : '', from: N(from), to: N(to) };
    switch (ex.code) {
      case 'turn': return ui('why.turn', { Turn: sideName(pos.turn), turn: ui('side.' + pos.turn + '.lower') });
      case 'own-piece': return ui('why.own', { piece: pieceName(pos.board[to]) });
      case 'king-capture': return ui('why.kingCapture');
      case 'blocked': return ui('why.blocked', { blocker: fullName(pos.board[ex.blocker]), blockerSq: N(ex.blocker) });
      case 'pawn-backward': return ui('why.pawnBackward');
      case 'pawn-blocked': return ui('why.pawnBlocked', { blocker: fullName(pos.board[ex.blocker]), to: N(ex.blocker) });
      case 'pawn-double-late': return ui('why.pawnDoubleLate');
      case 'pawn-too-far': return ui('why.pawnTooFar');
      case 'pawn-diagonal-empty': return ctx && ctx.epMissed ? ui('why.pawnDiagonalEp') : ui('why.pawnDiagonal', v);
      case 'king-attacked': return ui('why.kingAttacked', { to: N(to), attackers: listPieces(pos, ex.attackers) });
      case 'pinned': return ui('why.pinned', { piece: v.piece, attackers: listPieces(pos, ex.attackers) });
      case 'still-in-check': return ui('why.stillInCheck', { attackers: listPieces(pos, ex.attackers) });
      case 'castle': {
        const fail = ex.report.conditions.find((c) => !c.ok);
        return ui('why.castle', { sideName: ui('castle.side.' + ex.report.side), reason: castleReason(pos, fail) });
      }
      default: return p && E.typeOf(p) !== 'p' ? ui('why.pattern.' + E.typeOf(p), v) : ui('why.pattern', v);
    }
  }

  /* =====================================================================
   * Overlay drawing (SVG in board units: each square is 1 × 1)
   * ===================================================================== */
  class Overlay {
    constructor() { this.parts = []; }
    c(s) { const [x, y] = App.board.xy(s); return [x + 0.5, y + 0.5]; }
    add(s) { this.parts.push(s); return this; }
    merge(o) { if (o) this.parts.push(...o.parts); return this; }
    svg() { return this.parts.join(''); }
    unit(a, b) {
      const [x1, y1] = this.c(a), [x2, y2] = this.c(b);
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      return { x1, y1, x2, y2, ux: (x2 - x1) / len, uy: (y2 - y1) / len, len };
    }
    line(a, b, cls, trimStart, trimEnd) {
      const u = this.unit(a, b);
      const s = trimStart || 0, e = trimEnd || 0;
      return this.add(`<line class="${cls}" x1="${f3(u.x1 + u.ux * s)}" y1="${f3(u.y1 + u.uy * s)}" x2="${f3(u.x2 - u.ux * e)}" y2="${f3(u.y2 - u.uy * e)}"/>`);
    }
    arrow(a, b, kind) {
      const u = this.unit(a, b);
      const tipX = u.x2 - u.ux * 0.16, tipY = u.y2 - u.uy * 0.16;
      const baseX = tipX - u.ux * 0.34, baseY = tipY - u.uy * 0.34;
      const nx = -u.uy, ny = u.ux;
      const lineCls = kind === 'attack' ? 'attack' : 'arrow ' + (kind || '');
      this.add(`<line class="${lineCls}" x1="${f3(u.x1 + u.ux * 0.24)}" y1="${f3(u.y1 + u.uy * 0.24)}" x2="${f3(baseX + u.ux * 0.04)}" y2="${f3(baseY + u.uy * 0.04)}"/>`);
      return this.add(`<polygon class="head ${kind || ''}" points="${f3(tipX)},${f3(tipY)} ${f3(baseX + nx * 0.17)},${f3(baseY + ny * 0.17)} ${f3(baseX - nx * 0.17)},${f3(baseY - ny * 0.17)}"/>`);
    }
    attack(a, b) { return this.arrow(a, b, 'attack'); }
    hop(a, b, cls) {
      const u = this.unit(a, b);
      let nx = -u.uy, ny = u.ux;
      if (ny > 0) { nx = -nx; ny = -ny; }
      const k = 0.5 + u.len * 0.12;
      const cx = (u.x1 + u.x2) / 2 + nx * k, cy = (u.y1 + u.y2) / 2 + ny * k;
      const ex = u.x2 - u.ux * 0.12, ey = u.y2 - u.uy * 0.12;
      this.add(`<path class="hop ${cls || ''}" d="M${f3(u.x1 + u.ux * 0.3)} ${f3(u.y1 + u.uy * 0.3)} Q${f3(cx)} ${f3(cy)} ${f3(ex)} ${f3(ey)}"/>`);
      return this;
    }
    stopBar(from, blocker) {
      const u = this.unit(from, blocker);
      const px = u.x2 - u.ux * 0.5, py = u.y2 - u.uy * 0.5;
      const nx = -u.uy * 0.27, ny = u.ux * 0.27;
      return this.add(`<line class="stop" x1="${f3(px + nx)}" y1="${f3(py + ny)}" x2="${f3(px - nx)}" y2="${f3(py - ny)}"/>`);
    }
    x(s, cls) {
      const [x, y] = this.c(s);
      const cx = x + 0.27, cy = y - 0.27, d = 0.075;
      return this.add(`<circle class="xbg ${cls || ''}" cx="${f3(cx)}" cy="${f3(cy)}" r="0.17"/><path class="xmark" d="M${f3(cx - d)} ${f3(cy - d)}L${f3(cx + d)} ${f3(cy + d)}M${f3(cx + d)} ${f3(cy - d)}L${f3(cx - d)} ${f3(cy + d)}"/>`);
    }
    tick(s) {
      const [x, y] = this.c(s);
      const cx = x + 0.27, cy = y - 0.27;
      return this.add(`<circle class="tickbg" cx="${f3(cx)}" cy="${f3(cy)}" r="0.17"/><path class="tick" d="M${f3(cx - 0.08)} ${f3(cy)}L${f3(cx - 0.02)} ${f3(cy + 0.06)}L${f3(cx + 0.09)} ${f3(cy - 0.06)}"/>`);
    }
    badge(s, text, cls) {
      const [x, y] = this.c(s);
      const cx = x - 0.27, cy = y - 0.27;
      return this.add(`<circle class="badge-bg ${cls || ''}" cx="${f3(cx)}" cy="${f3(cy)}" r="0.2"/><text class="badge-text" x="${f3(cx)}" y="${f3(cy + 0.01)}">${esc(text)}</text>`);
    }
    labelAt(x, y, text, cls) {
      return this.add(`<circle class="badge-bg ${cls || ''}" cx="${f3(x)}" cy="${f3(y)}" r="0.2"/><text class="badge-text" x="${f3(x)}" y="${f3(y + 0.01)}">${esc(text)}</text>`);
    }
    star(s) {
      const [x, y] = this.c(s);
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 0.13 : 0.32;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push(f3(x + r * Math.cos(a)) + ',' + f3(y + r * Math.sin(a)));
      }
      return this.add(`<polygon class="star" points="${pts.join(' ')}"/>`);
    }
    name(s) { const [x, y] = this.c(s); return this.add(`<text class="sqname" x="${f3(x)}" y="${f3(y)}">${N(s)}</text>`); }
    diamond(s) {
      const [x, y] = this.c(s), r = 0.2;
      return this.add(`<polygon class="capdiamond" points="${f3(x)},${f3(y - r)} ${f3(x + r)},${f3(y)} ${f3(x)},${f3(y + r)} ${f3(x - r)},${f3(y)}"/>`);
    }

    /** A word pill (CHECK, CHECKMATE…) beside a square: above it, or below when the square is on the top row. */
    /** A label on a king. It goes above the king, below it, or across its lower or upper edge: wherever it hides least of the pieces. */
    tag(s, text, kind, board) {
      const [x, y] = this.c(s);
      const w = 0.32 + text.length * 0.142, ht = 0.36;
      const cx = Math.min(8 - w / 2 - 0.04, Math.max(w / 2 + 0.04, x));
      const hidden = (cy) => (board || []).reduce((sum, p, q) => {
        if (!p) return sum;
        const [qx, qy] = this.c(q);
        const ox = Math.min(cx + w / 2, qx + 0.32) - Math.max(cx - w / 2, qx - 0.32);
        const oy = Math.min(cy + ht / 2, qy + 0.42) - Math.max(cy - ht / 2, qy - 0.4);
        return ox > 0 && oy > 0 ? sum + ox * oy * (q === s ? 0.6 : 1) : sum;
      }, 0);
      let cy = null, least = Infinity;
      [y - 0.5 - ht / 2 - 0.05, y + 0.5 + ht / 2 + 0.05, y + 0.5, y - 0.5].forEach((c, i) => {
        if (c - ht / 2 < 0.02 || c + ht / 2 > 7.98) return;
        const v = hidden(c) + i * 0.001;
        if (v < least) { least = v; cy = c; }
      });
      return this.add(`<g class="state-tag ${kind}"><rect x="${f3(cx - w / 2)}" y="${f3(cy - ht / 2)}" width="${f3(w)}" height="${f3(ht)}" rx="0.18"/><text x="${f3(cx)}" y="${f3(cy + 0.012)}">${esc(text)}</text></g>`);
    }

    /** Movement lines for the selected piece: rays, knight hops or pawn paths. */
    pieceLines(pos, s, legal) {
      const p = pos.board[s];
      if (!p) return this;
      const t = E.typeOf(p);
      if (t === 'n') { legal.forEach((m) => this.hop(s, m.to)); return this; }
      if (t === 'p') return this.pawnLines(pos, s, legal);
      for (const r of E.rays(pos, s)) {
        const diag = r.dir[0] !== 0 && r.dir[1] !== 0;
        const cls = 'ray' + (diag ? ' diag' : '');
        const end = r.stopKind === 'enemy' ? r.stop : r.squares[r.squares.length - 1];
        if (end != null) this.line(s, end, cls, 0.34, r.stopKind === 'enemy' ? 0.36 : 0);
        if (r.stopKind === 'own') this.stopBar(s, r.stop);
      }
      return this;
    }
    pawnLines(pos, s, legal) {
      const color = E.colorOf(pos.board[s]);
      const dir = color === 'w' ? 8 : -8;
      const forward = legal.filter((m) => E.fileOf(m.to) === E.fileOf(s));
      if (forward.length) {
        const far = forward.reduce((a, m) => (Math.abs(m.to - s) > Math.abs(a.to - s) ? m : a));
        this.line(s, far.to, 'ray', 0.34, 0);
        const startRank = color === 'w' ? 1 : 6;
        if (E.rankOf(s) === startRank && forward.length === 1 && pos.board[s + 2 * dir]) this.stopBar(s + dir, s + 2 * dir);
      } else if (s + dir >= 0 && s + dir < 64 && pos.board[s + dir]) {
        this.stopBar(s, s + dir);
      }
      for (const c of E.pawnCaptureSquares(s, color)) {
        if (legal.some((m) => m.to === c)) this.line(s, c, 'ray diag', 0.34, 0.36);
        else if (!pos.board[c]) this.diamond(c);
      }
      return this;
    }
  }

  const rayClass = (a, b) => (E.fileOf(a) !== E.fileOf(b) && E.rankOf(a) !== E.rankOf(b) ? 'ray diag' : 'ray');

  /** Squares the side `by` attacks, with the other king lifted off so lines through it count. */
  function dangerSquares(pos, by) {
    const board = pos.board.slice();
    const k = board.indexOf(E.make(E.other(by), 'k'));
    if (k >= 0) board[k] = null;
    const p = Object.assign({}, pos, { board });
    const out = new Set();
    for (let s = 0; s < 64; s++) if (E.isAttacked(p, s, by)) out.add(s);
    return out;
  }

  /** Visual explanation for a refused move. */
  function whyOverlay(pos, from, to, ex) {
    const o = new Overlay();
    switch (ex.code) {
      case 'blocked':
        o.line(from, ex.blocker, rayClass(from, ex.blocker), 0.34, 0.36);
        o.x(ex.blocker);
        break;
      case 'pawn-blocked':
        o.stopBar(from, ex.blocker);
        o.x(ex.blocker);
        break;
      case 'king-attacked':
        ex.attackers.forEach((a) => o.attack(a, to));
        o.x(to);
        break;
      case 'pinned':
      case 'still-in-check':
        ex.attackers.forEach((a) => o.attack(a, ex.king));
        o.x(to);
        break;
      case 'castle': {
        const fail = ex.report.conditions.find((c) => !c.ok);
        if (fail.blockers) fail.blockers.forEach((b) => o.x(b));
        if (fail.attackers) fail.attackers.forEach((a) => o.attack(a, fail.squares[0]));
        if (fail.id === 'king-unmoved' || fail.id === 'rook-unmoved') o.x(fail.squares[0]);
        break;
      }
      default:
        o.x(to);
    }
    return o;
  }

  /* =====================================================================
   * Board
   * ===================================================================== */
  class Board {
    constructor() {
      this.wrap = $('#board-wrap');
      this.grid = $('#board');
      this.layer = $('#pieces');
      this.svg = $('#overlay');
      this.ranksEl = $('#coords-ranks');
      this.filesEl = $('#coords-files');
      this.orientation = 'w';
      this.cells = new Array(64);
      this.cellGrid = [];
      this.pieceEls = new Map();
      this.pos = null;
      this.marks = {};
      this.focusSq = E.index('e2');
      this.ctrl = null;
      this.notes = [];
      this.build();
      this.bind();
    }

    build() {
      for (let row = 0; row < 8; row++) {
        const r = h('div', { class: 'board-row', role: 'row' });
        const cells = [];
        for (let col = 0; col < 8; col++) {
          const c = h('div', { class: 'cell', role: 'gridcell', tabindex: '-1' });
          r.append(c);
          cells.push(c);
        }
        this.grid.append(r);
        this.cellGrid.push(cells);
      }
      for (let i = 0; i < 8; i++) { this.ranksEl.append(h('span')); this.filesEl.append(h('span')); }
      $('#board-help').textContent = ui('board.help');
      this.layout();
    }

    squareAt(row, col) { return this.orientation === 'w' ? E.sq(col, 7 - row) : E.sq(7 - col, row); }
    xy(s) {
      const f = E.fileOf(s), r = E.rankOf(s);
      return this.orientation === 'w' ? [f, 7 - r] : [7 - f, r];
    }

    layout() {
      this.cellGrid.forEach((cells, row) => cells.forEach((c, col) => {
        const s = this.squareAt(row, col);
        c.dataset.sq = s;
        this.cells[s] = c;
      }));
      [...this.ranksEl.children].forEach((el, row) => { el.textContent = this.orientation === 'w' ? 8 - row : row + 1; });
      [...this.filesEl.children].forEach((el, col) => { el.textContent = (this.orientation === 'w' ? 'abcdefgh' : 'hgfedcba')[col]; });
      for (const [s, el] of this.pieceEls) this.place(el, s);
      if (this.notes) this.drawNotes();
      this.grid.setAttribute('aria-label', ui('board.label', { orientation: sideName(this.orientation) }));
      this.setFocusable();
    }

    flip(to) {
      this.orientation = to || E.other(this.orientation);
      this.layout();
      this.refresh();
    }

    makePiece(letter) {
      const el = h('div', { class: 'piece' });
      el.addEventListener('animationend', () => el.classList.remove('enter'));
      this.setLetter(el, letter);
      return el;
    }
    setLetter(el, letter) {
      el.dataset.piece = letter;
      el.innerHTML = Pieces.svg(letter) + `<span class="piece-letter ${E.colorOf(letter)}">${LETTERS[E.typeOf(letter)]}</span>`;
    }
    place(el, s) {
      const t = this.tr(s);
      el.style.setProperty('--t', t);
      el.style.transform = t;
    }
    tr(s) {
      const [x, y] = this.xy(s);
      return `translate(${x * 100}%, ${y * 100}%)`;
    }

    /** Animate a piece to a square, from another square (or a pixel position), optionally through a corner square. */
    slide(el, fromSq, toSq, o) {
      const opt = o || {};
      this.place(el, toSq);
      if (reducedMotion() || !el.animate) return;
      if (!opt.fromTransform && (fromSq == null || fromSq === toSq)) return;
      const dur = opt.duration || moveMs();
      const frames = [{ transform: opt.fromTransform || this.tr(fromSq) }];
      if (opt.via != null) frames.push({ transform: this.tr(opt.via), offset: 0.55 });
      frames.push({ transform: this.tr(toSq) });
      el.style.zIndex = '4';
      const a = el.animate(frames, { duration: dur, delay: opt.delay || 0, easing: opt.via != null ? 'ease-in-out' : 'cubic-bezier(.4,0,.2,1)', fill: 'backwards' });
      const svg = el.querySelector('.piece-svg');
      if (svg && opt.lift !== 0) {
        svg.animate([{ transform: 'scale(1)' }, { transform: `scale(${opt.lift || 1.1})`, offset: 0.5 }, { transform: 'scale(1)' }],
          { duration: dur, delay: opt.delay || 0, easing: 'ease-in-out' });
      }
      a.onfinish = () => { el.style.zIndex = ''; };
    }

    /** A captured piece is knocked off its square just as the capturing piece lands. */
    knock(el, delay) {
      if (reducedMotion() || !el.animate) { el.remove(); return; }
      const t = el.style.transform;
      // Below every other piece (but still above the board), so it falls away under the piece that took it.
      el.style.zIndex = '-1';
      const a = el.animate([
        { transform: t, opacity: 1 },
        { transform: t + ' translateY(-8%) rotate(-12deg) scale(0.92)', opacity: 1, offset: 0.35 },
        { transform: t + ' translateY(35%) rotate(-40deg) scale(0.3)', opacity: 0 },
      ], { duration: 440, delay: delay || 0, easing: 'ease-in', fill: 'forwards' });
      a.onfinish = () => el.remove();
    }

    /** A ring that bursts outward from a square (used when a pawn promotes). */
    burst(s) {
      if (reducedMotion()) return;
      const [x, y] = this.xy(s);
      const ring = h('div', { class: 'burst' });
      ring.style.left = x * 12.5 + '%';
      ring.style.top = y * 12.5 + '%';
      this.layer.append(ring);
      setTimeout(() => ring.remove(), 900);
    }

    /** Show a position. With `move`, that piece travels (a knight along its L, a castling rook after the king, a captured piece knocked off); other changes slide to the nearest match or fade in. */
    setPosition(pos, opts) {
      const o = opts || {};
      const animate = o.animate !== false && !!this.pos && !reducedMotion();
      const ms = moveMs();
      const next = new Map();
      const leftovers = new Map(this.pieceEls);
      const claim = (fromSq, toSq, slideOpts) => {
        const el = leftovers.get(fromSq);
        if (!el) return null;
        leftovers.delete(fromSq);
        next.set(toSq, el);
        if (animate && !el.dataset.dragged) this.slide(el, fromSq, toSq, slideOpts);
        else this.place(el, toSq);
        delete el.dataset.dragged;
        return el;
      };
      const m = o.move;
      let knockDelay = 0;
      if (m && animate) {
        const knight = E.typeOf(m.piece) === 'n';
        let via = null;
        if (knight) {
          const df = E.fileOf(m.to) - E.fileOf(m.from);
          via = Math.abs(df) === 2 ? E.sq(E.fileOf(m.to), E.rankOf(m.from)) : E.sq(E.fileOf(m.from), E.rankOf(m.to));
        }
        const dur = knight ? ms * 1.6 : ms;
        const el = claim(m.from, m.to, { via, duration: dur, lift: knight ? 1.32 : 1.1 });
        knockDelay = dur * 0.72;
        if (el && m.promotion) {
          const letter = pos.board[m.to];
          el.dataset.piece = letter;
          setTimeout(() => {
            this.setLetter(el, letter);
            const svg = el.querySelector('.piece-svg');
            if (svg && svg.animate && !reducedMotion()) {
              svg.animate([{ transform: 'scale(0.2) rotate(-90deg)', opacity: 0.3 }, { transform: 'scale(1.3)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)' }], { duration: 520, easing: 'ease-out' });
            }
            this.burst(m.to);
          }, dur);
        }
        if (m.castle) claim(m.rookFrom, m.rookTo, { delay: ms * 0.75, duration: ms * 1.1 });
      }
      for (const [s, el] of [...leftovers]) {
        if (!next.has(s) && pos.board[s] === el.dataset.piece) {
          next.set(s, el);
          leftovers.delete(s);
        }
      }
      for (let s = 0; s < 64; s++) {
        const letter = pos.board[s];
        if (!letter || next.has(s)) continue;
        let best = null, bestD = 99;
        if (animate) {
          for (const [ls, el] of leftovers) {
            if (el.dataset.piece !== letter) continue;
            const d = Math.max(Math.abs(E.fileOf(ls) - E.fileOf(s)), Math.abs(E.rankOf(ls) - E.rankOf(s)));
            if (d < bestD) { bestD = d; best = ls; }
          }
        }
        if (best != null) claim(best, s);
        else {
          const el = this.makePiece(letter);
          this.place(el, s);
          if (animate && o.enter !== false) el.classList.add('enter');
          this.layer.append(el);
          next.set(s, el);
        }
      }
      for (const [, el] of leftovers) {
        if (animate) this.knock(el, m ? knockDelay : 0); else el.remove();
      }
      this.pieceEls = next;
      this.pos = pos;
      this.refresh();
    }

    setMarks(m) { this.marks = m || {}; this.refresh(); }

    refresh() {
      const m = this.marks;
      const pos = this.pos;
      const set = (arr) => new Set((arr || []).map(idx));
      const moves = set(m.moves), caps = set(m.captures), hl = set(m.highlight), good = set(m.good), bad = set(m.bad);
      const hint = set(m.hint), last = set(m.last), drag = set(m.draggable);
      const danger = m.danger || new Set();
      const sel = m.selected == null ? -1 : idx(m.selected);
      const check = m.check == null ? -1 : idx(m.check);
      for (let s = 0; s < 64; s++) {
        const c = this.cells[s];
        const p = pos && pos.board[s];
        const cls = ['cell'];
        if (E.isLight(s)) cls.push('light');
        if (last.has(s)) cls.push('is-last');
        if (hl.has(s)) cls.push('is-highlight');
        if (danger.has(s)) cls.push('is-danger');
        if (check === s) cls.push('is-check');
        if (sel === s) cls.push('is-selected');
        if (moves.has(s)) cls.push('is-move');
        if (caps.has(s)) cls.push('is-capture');
        if (good.has(s)) cls.push('is-good');
        if (bad.has(s)) cls.push('is-bad');
        if (hint.has(s)) cls.push('is-hint');
        if (drag.has(s)) cls.push('can-drag');
        c.className = cls.join(' ');
        let label = N(s) + ', ' + (p ? fullName(p) : ui('sq.empty'));
        if (sel === s) label += ', ' + ui('sq.selected');
        if (moves.has(s)) label += ', ' + ui('sq.legal');
        if (caps.has(s)) label += ', ' + ui('sq.capture');
        if (check === s) label += ', ' + ui('sq.check');
        if (danger.has(s)) label += ', ' + ui('sq.danger');
        if (m.labels && m.labels[s]) label += ', ' + m.labels[s];
        c.setAttribute('aria-label', label);
        c.setAttribute('aria-selected', sel === s ? 'true' : 'false');
      }
      this.svg.innerHTML = m.overlay || '';
    }

    pieceAt(s) { return this.pieceEls.get(s); }
    nudge(s) {
      const el = this.pieceEls.get(s);
      if (!el || reducedMotion()) return;
      el.classList.remove('nudge');
      void el.offsetWidth;
      el.classList.add('nudge');
    }

    setFocusable() { this.cells.forEach((c, s) => { c.tabIndex = s === this.focusSq ? 0 : -1; }); }

    bind() {
      this.grid.addEventListener('click', (e) => {
        const c = e.target.closest('.cell');
        if (!c) return;
        if (this.suppressClick) { this.suppressClick = false; return; }
        if (App.draw) return;
        if (presenterOn() && Run.active) { if (!focusingClick) presenterNext(false); return; }
        const s = Number(c.dataset.sq);
        this.focusSq = s;
        this.setFocusable();
        userTookOver();
        if (this.ctrl && this.ctrl.activate) this.ctrl.activate(s);
      });
      this.grid.addEventListener('keydown', (e) => this.onKey(e));
      this.grid.addEventListener('pointerdown', (e) => this.onDown(e));
      this.wrap.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    onKey(e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (presenting() && ['ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', ' '].includes(e.key)) return;
      const [x, y] = this.xy(this.focusSq);
      let nx = x, ny = y;
      switch (e.key) {
        case 'ArrowLeft': nx--; break;
        case 'ArrowRight': nx++; break;
        case 'ArrowUp': ny--; break;
        case 'ArrowDown': ny++; break;
        case 'Home': nx = 0; break;
        case 'End': nx = 7; break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          userTookOver();
          if (this.ctrl && this.ctrl.activate) this.ctrl.activate(this.focusSq);
          return;
        case 'Escape':
          if (this.ctrl && this.ctrl.cancel && this.ctrl.cancel()) { e.preventDefault(); e.stopPropagation(); }
          return;
        default:
          return;
      }
      e.preventDefault();
      e.stopPropagation();
      nx = Math.max(0, Math.min(7, nx));
      ny = Math.max(0, Math.min(7, ny));
      this.focusSq = this.squareAt(ny, nx);
      this.setFocusable();
      this.cells[this.focusSq].focus();
    }

    squareFromPoint(x, y, rect) {
      const size = rect.width / 8;
      const col = Math.floor((x - rect.left) / size), row = Math.floor((y - rect.top) / size);
      if (col < 0 || col > 7 || row < 0 || row > 7) return null;
      return this.squareAt(row, col);
    }

    onDown(e) {
      const c = e.target.closest('.cell');
      if (!c) return;
      const s = Number(c.dataset.sq);
      if (e.button === 2 || (App.draw && e.button === 0)) { this.noteGesture(e, s); return; }
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (presenterOn() && Run.active) return;
      if (!this.ctrl || !this.ctrl.canDrag || !this.ctrl.canDrag(s)) return;
      const el = this.pieceEls.get(s);
      if (!el) return;
      const st = { x0: e.clientX, y0: e.clientY, rect: this.wrap.getBoundingClientRect(), id: e.pointerId, dragging: false, over: null };
      const move = (ev) => {
        if (ev.pointerId !== st.id) return;
        if (!st.dragging) {
          if (Math.hypot(ev.clientX - st.x0, ev.clientY - st.y0) < 6) return;
          st.dragging = true;
          userTookOver();
          this.wrap.classList.add('dragging');
          el.classList.add('dragging');
          if (this.ctrl.dragStart) this.ctrl.dragStart(s);
        }
        ev.preventDefault();
        const size = st.rect.width / 8;
        el.style.transform = `translate(${ev.clientX - st.rect.left - size / 2}px, ${ev.clientY - st.rect.top - size / 2}px)`;
        const over = this.squareFromPoint(ev.clientX, ev.clientY, st.rect);
        if (over !== st.over) {
          if (st.over != null) this.cells[st.over].classList.remove('drop-target');
          st.over = over;
          if (over != null) this.cells[over].classList.add('drop-target');
        }
      };
      const up = (ev) => {
        if (ev.pointerId !== st.id) return;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        if (!st.dragging) return;
        this.suppressClick = true;
        setTimeout(() => { this.suppressClick = false; }, 0);
        this.wrap.classList.remove('dragging');
        el.classList.remove('dragging');
        if (st.over != null) this.cells[st.over].classList.remove('drop-target');
        const to = ev.type === 'pointercancel' ? null : this.squareFromPoint(ev.clientX, ev.clientY, st.rect);
        const pixels = el.style.transform;
        el.dataset.dragged = '1';
        if (this.ctrl && this.ctrl.drop) this.ctrl.drop(s, to == null ? s : to);
        if (this.pieceEls.get(s) === el) {
          delete el.dataset.dragged;
          this.slide(el, s, s, { fromTransform: pixels, duration: 180, lift: 0 });
        }
      };
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    }

    /* ----- Presenter drawings: right-drag (or Draw mode) for arrows, right-click for circles ----- */
    noteGesture(e, s) {
      e.preventDefault();
      const rect = this.wrap.getBoundingClientRect();
      const id = e.pointerId;
      const up = (ev) => {
        if (ev.pointerId !== id) return;
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        if (ev.type === 'pointercancel') return;
        const to = this.squareFromPoint(ev.clientX, ev.clientY, rect);
        if (to == null) return;
        this.suppressClick = true;
        setTimeout(() => { this.suppressClick = false; }, 0);
        const i = this.notes.findIndex(([a, b]) => a === s && b === to);
        if (i >= 0) this.notes.splice(i, 1); else this.notes.push([s, to]);
        this.drawNotes();
      };
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    }
    clearNotes() { this.notes = []; this.drawNotes(); }
    drawNotes() {
      const o = new Overlay();
      for (const [a, b] of this.notes) {
        if (a === b) { const [x, y] = o.c(a); o.add(`<circle class="note-ring" cx="${f3(x)}" cy="${f3(y)}" r="0.42"/>`); }
        else o.arrow(a, b, 'note');
      }
      $('#annotate').innerHTML = o.svg();
    }
  }

  /* =====================================================================
   * Shared UI pieces
   * ===================================================================== */
  const Feedback = {
    get el() { return $('#feedback'); },
    say(text, tone, opts) {
      const o = opts || {};
      const t = tone || 'info';
      const box = h('div', { class: 'fb ' + t }, icon(TONE_ICON[t]), h('p', { class: 'fb-text' }, text));
      if (o.sub) box.append(h('p', { class: 'fb-sub' }, o.sub));
      if (o.actions && o.actions.length) {
        box.append(h('div', { class: 'fb-actions' }, o.actions.map((a) =>
          h('button', { class: 'btn small' + (a.primary ? ' primary' : ''), type: 'button', onclick: a.run }, a.icon ? icon(a.icon) : null, a.label))));
      }
      if (!reducedMotion()) box.classList.add('flash');
      this.el.replaceChildren(box);
      keepFollowing();
    },
    show(node) { this.el.replaceChildren(node); keepFollowing(); },
    clear() { this.el.replaceChildren(); keepFollowing(); },
  };

  function announce(text) {
    const a = $('#announcer');
    a.textContent = '';
    setTimeout(() => { a.textContent = text; }, 30);
  }

  function renderStatus(o) {
    const kids = [];
    if (o.turn) {
      kids.push(h('span', { class: 'chip' }, h('span', { class: 'swatch ' + o.turn, 'aria-hidden': 'true' }), o.drill ? ui('turn.drill') : ui('turn.' + o.turn)));
    }
    if (o.mode) {
      const ic = { drill: 'target', rules: 'shield', demo: 'film', look: 'eye' }[o.mode];
      kids.push(h('span', { class: 'chip mode' }, icon(ic), ui('mode.' + o.mode)));
      if (o.mode !== 'demo') kids.push(h('span', { class: 'mode-detail' }, ui('mode.' + o.mode + '.detail')));
    }
    kids.push(h('span', { class: 'spacer' }));
    if (o.st) {
      const st = o.st;
      if (st.checkmate) kids.push(h('span', { class: 'chip state-mate' }, icon('flag'), ui('state.checkmate')));
      else if (st.stalemate) kids.push(h('span', { class: 'chip state-draw' }, icon('info'), ui('state.stalemate')));
      else if (st.check) kids.push(h('span', { class: 'chip state-check' }, icon('alert'), ui('state.check')));
      else if (st.insufficient) kids.push(h('span', { class: 'chip state-draw' }, icon('info'), ui('state.draw')));
    }
    $('#statusbar').replaceChildren(...kids);
  }

  function toolButton(o) {
    const b = h('button', {
      type: 'button', class: 'tool' + (o.primary ? ' primary' : '') + (o.keep ? ' keep-label' : ''),
      'aria-label': o.label, title: o.title || o.label, onclick: () => { userTookOver(); o.run(); },
      'aria-keyshortcuts': o.keys || null,
    }, icon(o.icon), h('span', { class: 'label', 'aria-hidden': 'true' }, o.label));
    if (o.pressed != null) b.setAttribute('aria-pressed', String(!!o.pressed));
    return b;
  }
  function setPressed(btn, v) { if (btn) btn.setAttribute('aria-pressed', String(!!v)); }
  function setDisabled(btn, v) { if (btn) btn.disabled = !!v; }
  function setToolbar(nodes) {
    const demo = App.ctrl && App.ctrl.demonstrate ? demoButtons() : [];
    $('#toolbar').replaceChildren(...demo, ...nodes.filter(Boolean));
    updateDemoButtons();
  }

  function setLegend(on) {
    const el = $('#legend');
    el.hidden = !on;
    if (!on) return;
    el.replaceChildren(
      h('span', null, h('i', { class: 'dot', 'aria-hidden': 'true' }), ui('legend.move')),
      h('span', null, h('i', { class: 'ring', 'aria-hidden': 'true' }), ui('legend.capture')),
      h('span', null, h('i', { class: 'stopbar', 'aria-hidden': 'true' }), ui('legend.stop')));
  }

  function taskCard() {
    const prompt = h('p', { class: 'task-prompt' });
    const progress = h('p', { class: 'task-progress' });
    const doneChip = h('span', { class: 'done-chip', hidden: true }, icon('check'), ui('goal.complete'));
    const el = h('section', { class: 'task', 'aria-label': ui('task.label') },
      h('p', { class: 'task-label' }, h('span', null, ui('task.label')), doneChip), prompt, progress);
    return {
      el,
      set(p, prog, done) {
        prompt.textContent = p || '';
        prompt.hidden = !p;
        progress.textContent = prog || '';
        progress.hidden = !prog;
        doneChip.hidden = !done;
      },
    };
  }

  function escapesWidget(pos, opts) {
    const o = opts || {};
    const e = E.escapes(pos);
    const box = h('section', { class: 'widget', 'aria-label': ui('esc.title') }, h('h2', null, ui('esc.title')));
    if (!e.check) {
      box.append(h('p', { class: 'notice' }, ui('esc.none')));
      return box;
    }
    const grid = h('div', { class: 'esc-grid' });
    for (const k of ['king', 'block', 'capture']) {
      const n = e.groups[k].length;
      const found = o.found && o.found.has(k);
      const kids = [
        h('span', { class: 'esc-name' }, ui('esc.' + k)),
        h('span', { class: 'esc-count' }, icon(n ? 'check' : 'x'), n ? ui('esc.count', { n, s: n === 1 ? '' : 's' }) : ui('esc.zero')),
        found ? h('span', { class: 'done-chip' }, icon('check'), ui('esc.found')) : null,
      ];
      const cls = 'esc-tile ' + (n ? 'yes' : 'no') + (found ? ' found' : '');
      grid.append(o.onPreview && n
        ? h('button', { type: 'button', class: cls, 'aria-pressed': String(o.preview === k), title: ui('esc.show'), onclick: () => o.onPreview(k) }, kids)
        : h('div', { class: cls }, kids));
    }
    box.append(grid);
    if (e.checkmate) box.append(h('p', { class: 'esc-note' }, ui('esc.mate')));
    if (o.withText) box.append(h('div', { class: 'esc-text' }, ['king', 'block', 'capture'].map((k) => textBlock('check.ways.' + k))));
    return box;
  }

  function castleDetail(pos, c) {
    if (c.id === 'path-clear') return ui('castle.d.path', { squares: c.blockers.map(N).join(', ') });
    if (c.attackers && c.attackers.length) return ui('castle.d.attacked', { attackers: listPieces(pos, c.attackers) });
    return '';
  }

  function castleWidget(pos, color) {
    const box = h('section', { class: 'widget', 'aria-label': ui('castle.title') }, h('h2', null, ui('castle.title') + ' · ' + sideName(color)));
    const cols = h('div', { class: 'castle-cols' });
    for (const side of ['K', 'Q']) {
      const r = E.castlingReport(pos, color, side);
      cols.append(h('div', { class: 'castle-col' },
        h('h3', null, ui('castle.' + side), h('span', { class: 'allowed ' + (r.ok ? 'yes' : 'no') }, ui(r.ok ? 'castle.ready' : 'castle.notReady'))),
        h('ul', null, r.conditions.map((c) => {
          const detail = c.ok ? '' : castleDetail(pos, c);
          return h('li', { class: c.ok ? 'ok' : 'bad' }, icon(c.ok ? 'check' : 'x'),
            h('span', null, ui('castle.c.' + c.id), h('span', { class: 'sr-only' }, ': ' + ui(c.ok ? 'castle.met' : 'castle.unmet'))),
            detail ? h('span', { class: 'why' }, detail) : null);
        }))));
    }
    box.append(cols);
    return box;
  }

  function matrixWidget(pos) {
    const st = E.status(pos);
    const inCheck = st.check, hasMove = st.moves.length > 0;
    const cell = (c, m, key) => {
      const now = inCheck === c && hasMove === m;
      return h('td', { class: 'cell-m' + (now ? ' now' : '') }, now ? h('span', { class: 'now-tag' }, ui('matrix.now')) : null, ui(key));
    };
    return h('section', { class: 'widget', 'aria-label': ui('matrix.title') },
      h('h2', null, ui('matrix.title')),
      h('p', { class: 'notice' }, ui('matrix.side', { Side: sideName(pos.turn) })),
      h('table', { class: 'matrix' },
        h('thead', null, h('tr', null, h('td'), h('th', { scope: 'col' }, ui('matrix.col.yes')), h('th', { scope: 'col' }, ui('matrix.col.no')))),
        h('tbody', null,
          h('tr', null, h('th', { scope: 'row' }, ui('matrix.row.yes')), cell(true, true, 'matrix.check'), cell(true, false, 'matrix.mate')),
          h('tr', null, h('th', { scope: 'row' }, ui('matrix.row.no')), cell(false, true, 'matrix.play'), cell(false, false, 'matrix.stalemate')))));
  }

  /** X marks on every square around the king, showing why it can't go there. */
  function trappedOverlay(pos, o) {
    if (!bothKings(pos)) return o;
    const e = E.escapes(pos);
    for (const a of e.around) {
      if (a.reason === 'attacked') o.x(a.square);
      else if (a.reason === 'own') o.x(a.square, 'own');
    }
    return o;
  }

  /** Label the king when the position is check, checkmate or stalemate. */
  function stateTag(o, st, pos) {
    if (!st || st.king == null || st.king < 0) return o;
    if (st.checkmate) return o.tag(st.king, ui('tag.mate'), 'mate', pos.board);
    if (st.stalemate) return o.tag(st.king, ui('tag.stalemate'), 'stale', pos.board);
    if (st.check) return o.tag(st.king, ui('tag.check'), 'check', pos.board);
    return o;
  }

  function celebrate(fromSq) {
    if (reducedMotion()) return;
    const b = App.board;
    const [fx, fy] = fromSq != null ? b.xy(fromSq) : [3.5, 3.5];
    b.cells.forEach((c, s) => {
      const [x, y] = b.xy(s);
      c.style.setProperty('--d', (Math.hypot(x - fx, y - fy) * 0.09).toFixed(2) + 's');
    });
    b.wrap.classList.remove('celebrate');
    void b.wrap.offsetWidth;
    b.wrap.classList.add('celebrate');
    setTimeout(() => b.wrap.classList.remove('celebrate'), 1600);
  }

  const Promo = {
    pending: null,
    ask(color, auto) {
      const dlg = $('#promo-dialog');
      const grid = $('#promo-grid');
      return new Promise((resolve) => {
        let timer = null;
        // Escape closes the dialog without a choice. A close event left over from an earlier choice finds the dialog open again, and is ignored.
        const onClose = () => { if (!dlg.open) finish(null); };
        // Settle as soon as a piece is chosen, without waiting for the dialog's close event.
        const finish = (choice) => {
          if (this.pending !== finish) return;
          this.pending = null;
          clearTimeout(timer);
          dlg.removeEventListener('close', onClose);
          if (dlg.open) dlg.close();
          resolve(choice);
        };
        this.pending = finish;
        finish.auto = auto;
        grid.replaceChildren(...['q', 'r', 'b', 'n'].map((t) =>
          h('button', { type: 'button', onclick: () => finish(t) },
            fromHTML(Pieces.svg(E.make(color, t))), h('span', null, E.PIECE_NAMES[t][0].toUpperCase() + E.PIECE_NAMES[t].slice(1)))));
        dlg.addEventListener('close', onClose);
        dlg.showModal();
        const pick = auto ? grid.children['qrbn'.indexOf(auto)] : grid.firstElementChild;
        // A demonstration marks the piece it is about to choose, so the person watching can see it.
        if (auto) pick.classList.add('suggested');
        pick.focus();
        // Stepping by hand, the choices stay up until → takes the highlighted piece.
        if (auto && !clickPace()) timer = setTimeout(() => finish(auto), 1400 * waitFactor());
      });
    },
    /** → while a demonstration's promotion choice is on screen: take the highlighted piece now. */
    skip() {
      const f = this.pending;
      if (!f || !f.auto) return false;
      f(f.auto);
      return true;
    },
  };

  /* =====================================================================
   * Progress
   * ===================================================================== */
  const progress = store.get('progress', {});
  const stepKey = (L, S) => L.id + '/' + S.id;
  const isDone = (L, S) => !!progress[stepKey(L, S)];
  const lessonDone = (L) => L.steps.filter((s) => !s.optional).every((s) => isDone(L, s));

  function markDone(L, S) {
    if (!L || !S) return;
    const key = stepKey(L, S);
    const fresh = !App.session.has(key);
    App.session.add(key);
    if (!progress[key]) {
      progress[key] = true;
      store.set('progress', progress);
      renderOutline();
    }
    if (fresh && App.view === 'lesson' && LESSONS[App.li] === L) renderHead();
  }
  /** While presenting, ✓ marks only count what has been shown in this session. */
  const shownDone = (L, S) => (presenterOn() ? App.session.has(stepKey(L, S)) : isDone(L, S));

  /* =====================================================================
   * Controllers
   * ===================================================================== */
  class Ctrl {
    constructor(step, lesson) {
      this.step = step;
      this.lesson = lesson;
      this.timers = [];
    }
    later(fn, ms) { const t = setTimeout(() => { if (!this.stopped) fn(); }, ms); this.timers.push(t); return t; }
    clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; }
    unmount() { this.stopped = true; this.clearTimers(); }
    textNodes() {
      return [...(this.step.text || []).map((id) => textBlock(id)), this.step.caution ? cautionBlock(this.step.caution) : null];
    }
    complete() { markDone(this.lesson, this.step); }
    nextAction() {
      const n = neighbour(1);
      return n ? [{ label: n.L === this.lesson ? ui('nav.nextStep', { title: ui(n.S.label) }) : ui('nav.nextLesson', { title: ui('lesson.' + n.L.id) }), icon: 'arrowRight', primary: true, run: () => goStep(n) }] : [];
    }
  }

  /* ----- Interactive board (explore, tasks) ----- */
  class PlayCtrl extends Ctrl {
    mount() {
      this.mounting = true;
      this.mode = this.step.mode || 'rules';
      this.sides = this.step.sides || 'w';
      this.puzzle = 0;
      this.showLines = !!this.step.rays;
      this.showDanger = false;
      this.showMoves = true;
      this.gs = {};
      this.task = taskCard();
      this.widgetEl = h('div', { class: 'widgets' });
      this.extraEl = h('div');
      this.buildToolbar();
      this.reset(true);
      this.mounting = false;
    }

    panel() {
      const nodes = [...this.textNodes()];
      if (this.step.goal || this.step.prompt) nodes.push(this.task.el);
      nodes.push(this.widgetEl, this.extraEl);
      return nodes;
    }

    fen() { return this.step.puzzles ? this.step.puzzles[this.puzzle] : this.step.fen; }
    goal() { return this.step.goal ? GOALS[this.step.goal.type] : null; }
    learnerSide() { return this.mode === 'drill' ? 'w' : this.sides === 'both' ? this.pos.turn : this.sides; }
    opponent() { return this.mode === 'drill' ? 'b' : this.sides === 'both' ? E.other(this.pos.turn) : E.other(this.sides); }
    sideAllowed(c) { return this.sides === 'both' || this.sides === c; }
    canMove(s) {
      const p = this.pos.board[s];
      if (!p || E.colorOf(p) !== this.pos.turn || !this.sideAllowed(E.colorOf(p))) return false;
      return !this.step.movable || E.typeOf(p) === this.step.movable;
    }
    canDrag(s) { return !this.locked && !this.over && this.canMove(s); }
    legalFrom(s) { return E.legalMoves(this.pos, s); }

    reset(first, keepGoal) {
      this.clearTimers();
      this.deferred = null;
      this.pos = E.parseFEN(this.fen());
      this.history = [];
      this.selected = null;
      this.last = null;
      this.why = null;
      this.hintSq = null;
      this.preview = null;
      this.over = false;
      this.locked = false;
      this.busy = false;
      this.success = false;
      if (!keepGoal) this.gs = {};
      const g = this.goal();
      if (g && g.init) g.init(this);
      $('#board-banner').hidden = true;
      App.board.setPosition(this.pos, { animate: !first });
      this.render();
      this.sayPrompt();
      if (this.step.onStart) {
        this.locked = true;
        this.busy = true;
        this.render();
        this.afterBeat(() => this.playStart(this.step.onStart.slice()), first ? 900 : 600);
      }
    }

    playStart(list) {
      const uci = list.shift();
      const m = E.moveFromUci(this.pos, uci);
      if (m) {
        const prev = this.pos;
        this.pos = E.makeMove(prev, m);
        this.history.push({ pos: prev, last: this.last, move: m, auto: true, fixed: true });
        this.last = [m.from, m.to];
        App.board.setPosition(this.pos, { move: m });
        Feedback.say(describeMove(prev, m), 'info', { sub: this.promptText() });
      }
      if (list.length) this.afterBeat(() => this.playStart(list), 900);
      else { this.locked = false; this.busy = false; this.render(); }
    }

    promptText() {
      const g = this.goal();
      if (g && g.prompt) return g.prompt(this);
      const key = (this.step.goal && this.step.goal.prompt) || this.step.prompt;
      return key ? ui(key, { piece: this.lesson.piece ? E.PIECE_NAMES[this.lesson.piece] : '', par: this.step.goal && this.step.goal.par }) : '';
    }

    sayPrompt() {
      const t = this.promptText();
      if (t) Feedback.say(t, 'info');
      else Feedback.clear();
    }

    activate(s) {
      if (this.locked) { if (this.waiting) Feedback.say(ui('why.waiting'), 'info'); return; }
      if (this.over) { Feedback.say(ui('why.gameOver'), 'info'); return; }
      const p = this.pos.board[s];
      if (this.selected != null) {
        if (s === this.selected) { this.cancel(); return; }
        if (this.canMove(s)) { this.select(s); return; }
        this.attempt(this.selected, s);
        return;
      }
      if (!p) { Feedback.say(ui('why.selectFirst'), 'info'); return; }
      const color = E.colorOf(p);
      if (color !== this.pos.turn && this.sides === 'both') {
        Feedback.say(ui('why.turn', { Turn: sideName(this.pos.turn), turn: ui('side.' + this.pos.turn + '.lower') }), 'error');
        App.board.nudge(s);
        return;
      }
      if (!this.sideAllowed(color) || color !== this.pos.turn) {
        Feedback.say(ui('fb.select', { Side: sideName(color), piece: pieceName(p), square: N(s) }), 'info', { actions: this.selectActions(p) });
        return;
      }
      if (!this.canMove(s)) {
        Feedback.say(ui('why.drill', { pieces: E.PIECE_NAMES[this.step.movable] }), 'info');
        App.board.nudge(s);
        return;
      }
      this.select(s);
    }

    selectActions() { return []; }

    select(s) {
      this.selected = s;
      this.why = null;
      this.hintSq = null;
      const p = this.pos.board[s];
      const n = new Set(this.legalFrom(s).map((m) => m.to)).size;
      Feedback.say(ui(n ? 'fb.select' : 'fb.select.none', { Side: sideName(E.colorOf(p)), piece: pieceName(p), square: N(s) }), 'info',
        { sub: n ? ui('fb.reach', { n, s: n === 1 ? '' : 's' }) : '', actions: this.selectActions(p) });
      this.render();
    }

    cancel() {
      if (this.selected == null && !this.why) return false;
      this.selected = null;
      this.why = null;
      this.render();
      return true;
    }

    dragStart(s) { if (this.selected !== s) this.select(s); }
    drop(from, to) {
      if (from === to) { if (this.selected !== from) this.select(from); return; }
      this.selected = from;
      this.attempt(from, to);
    }

    attempt(from, to, autoPromo) {
      const ex = E.explain(this.pos, from, to);
      if (ex.code === 'legal') {
        const promos = ex.moves.filter((m) => m.promotion);
        if (promos.length) {
          this.locked = true;
          this.promoting = true;
          Promo.ask(E.colorOf(this.pos.board[from]), autoPromo).then((choice) => {
            this.promoting = false;
            if (this.stopped) return;
            this.locked = false;
            if (!choice) { this.render(); return; }
            this.commit(promos.find((m) => m.promotion === choice));
          });
          return;
        }
        this.commit(ex.moves[0]);
        return;
      }
      this.why = { overlay: whyOverlay(this.pos, from, to, ex), bad: ex.code === 'pattern' ? [] : [to] };
      Feedback.say(whyText(this.pos, from, to, ex, { epMissed: this.gs.epMissed }), 'error');
      App.board.nudge(from);
      this.render();
    }

    commit(m) {
      const prev = this.pos;
      const next = E.makeMove(prev, m);
      if (this.mode === 'drill') { next.turn = prev.turn; next.ep = null; }
      this.history.push({ pos: prev, last: this.last, move: m });
      this.pos = next;
      this.last = [m.from, m.to];
      this.selected = null;
      this.why = null;
      this.hintSq = null;
      this.preview = null;
      App.board.setPosition(next, { move: m });
      const line = [describeMove(prev, m), this.mode === 'rules' ? stateLine(next) : ''].filter(Boolean).join(' ');
      const g = this.goal();
      const res = g ? g.after(this, prev, m, next, line) : null;
      if (!res) this.sayMove(line, next);
      this.checkOver();
      const wantsReply = res ? res.reply : true;
      if (wantsReply && !this.over && !this.success && this.mode === 'rules' && this.sides !== 'both' && next.turn !== this.sides) this.scheduleReply();
      this.render();
    }

    sayMove(line, pos) {
      const st = bothKings(pos) ? E.status(pos) : null;
      Feedback.say(line, st && (st.check || st.checkmate) ? 'warn' : 'info', { sub: this.notices(pos) });
    }

    notices() { return ''; }

    checkOver() {
      if (this.mode !== 'rules' || !bothKings(this.pos)) return;
      const st = E.status(this.pos);
      if (st.checkmate || st.stalemate || st.insufficient) this.over = true;
    }

    /** Run a follow-up (Black's reply, a reset) after a delay, or, during a step-by-step demonstration, on the presenter's next press. */
    afterBeat(fn, ms) {
      // A step that is about to be armed (auto-play) also holds its opening move for the first press.
      if (clickPace() && (Run.active || (App.autoplay && this.mounting))) { this.deferred = fn; this.busy = true; }
      else this.later(fn, ms);
    }
    flushDeferred() {
      const fn = this.deferred;
      this.deferred = null;
      if (fn && !this.stopped) fn();
    }

    scheduleReply() {
      this.locked = true;
      this.waiting = true;
      this.busy = true;
      this.afterBeat(() => {
        this.locked = false;
        this.waiting = false;
        this.busy = false;
        const m = (this.step.replies || []).map((u) => E.moveFromUci(this.pos, u)).find(Boolean) || E.legalMoves(this.pos)[0];
        if (!m) { this.render(); return; }
        const prev = this.pos;
        this.pos = E.makeMove(prev, m);
        this.history.push({ pos: prev, last: this.last, move: m, auto: true });
        this.last = [m.from, m.to];
        App.board.setPosition(this.pos, { move: m });
        const line = [describeMove(prev, m), stateLine(this.pos)].filter(Boolean).join(' ');
        const g = this.goal();
        if (g && g.afterReply) g.afterReply(this, prev, m, this.pos, line);
        else this.sayMove(line, this.pos);
        this.checkOver();
        this.render();
      }, (reducedMotion() ? 400 : 750) * waitFactor());
    }

    /** Show the opponent's best answer to a failed puzzle attempt. */
    showReply(m) {
      if (!m) return;
      const prev = this.pos;
      this.pos = E.makeMove(prev, m);
      this.history.push({ pos: prev, last: this.last, move: m, auto: true });
      this.last = [m.from, m.to];
      App.board.setPosition(this.pos, { move: m });
      Feedback.say(describeMove(prev, m), 'info', { actions: [{ label: ui('goal.tryAgain'), primary: true, icon: 'undo', run: () => this.undo(true) }] });
      this.render();
    }

    undo(force) {
      if (this.locked && !force) return;
      const top = () => this.history[this.history.length - 1];
      if (!this.history.length || top().fixed) return;
      let entry = this.history.pop();
      while (entry.auto && this.history.length && !top().fixed) entry = this.history.pop();
      this.clearTimers();
      this.deferred = null;
      this.pos = entry.pos;
      this.last = entry.last;
      this.selected = null;
      this.why = null;
      this.hintSq = null;
      this.over = false;
      this.locked = false;
      this.waiting = false;
      this.busy = false;
      this.success = false;
      $('#board-banner').hidden = true;
      App.board.setPosition(this.pos, { animate: true });
      Feedback.say(ui('fb.undone'), 'info', { sub: this.promptText() });
      this.render();
    }

    hint() {
      const g = this.goal();
      const m = g && g.hint ? g.hint(this) : null;
      if (!m || this.locked) return;
      this.selected = null;
      this.hintSq = [m.from, m.to];
      Feedback.say(ui('hint.generic'), 'info');
      this.render();
      this.later(() => { this.hintSq = null; this.render(); }, 4000);
    }

    succeed(msg, tone) {
      this.success = true;
      this.locked = true;
      Feedback.say(msg, tone || 'success', { actions: this.nextAction() });
      celebrate(this.last ? this.last[1] : null);
      this.complete();
    }

    buildToolbar() {
      const s = this.step;
      this.btn = {};
      const nodes = [];
      nodes.push(this.btn.reset = toolButton({ icon: 'reset', label: ui('tool.reset'), keys: 'R', run: () => { this.puzzle = this.step.puzzles ? this.puzzle : 0; this.reset(false); } }));
      nodes.push(this.btn.undo = toolButton({ icon: 'undo', label: ui('tool.undo'), keys: 'U', run: () => this.undo() }));
      if (s.goal) nodes.push(this.btn.hint = toolButton({ icon: 'hint', label: ui('tool.hint'), keys: 'H', run: () => this.hint() }));
      if (s.rays) nodes.push(this.btn.lines = toolButton({ icon: 'lines', label: ui('tool.lines'), title: ui('tool.lines.long'), pressed: this.showLines, run: () => { this.showLines = !this.showLines; this.render(); } }));
      if (s.dangerTool || s.danger) nodes.push(this.btn.danger = toolButton({ icon: 'danger', label: ui('tool.danger'), title: ui('tool.danger.long'), keys: 'A', pressed: false, run: () => this.toggleDanger() }));
      setToolbar(nodes);
    }

    toggleDanger() {
      if (!this.btn.danger) return;
      this.showDanger = !this.showDanger;
      this.render();
    }

    updateToolbar() {
      const fixedOnly = this.history.length && this.history.every((e) => e.fixed);
      setDisabled(this.btn.undo, !this.history.length || fixedOnly || (this.locked && !this.success));
      setDisabled(this.btn.hint, this.locked || this.over);
      setPressed(this.btn.lines, this.showLines);
      setPressed(this.btn.danger, this.showDanger);
      setLegend(this.showLines && this.selected != null);
    }

    render() {
      const pos = this.pos;
      const marks = { last: this.last };
      const o = new Overlay();
      const rules = this.mode === 'rules' && bothKings(pos);
      const st = rules ? E.status(pos) : null;
      if (Run.active && this.last) o.arrow(this.last[0], this.last[1], 'trail');
      if (st && st.check) {
        marks.check = st.king;
        st.checkers.forEach((c) => o.attack(c, st.king));
      }
      if (this.selected != null) {
        marks.selected = this.selected;
        const ms = this.legalFrom(this.selected);
        if (this.showMoves) {
          marks.moves = ms.filter((m) => !m.captured).map((m) => m.to);
          marks.captures = ms.filter((m) => m.captured).map((m) => m.to);
        }
        if (this.showLines) o.pieceLines(pos, this.selected, ms);
      }
      if (!this.locked && !this.over) {
        marks.draggable = [];
        for (let s = 0; s < 64; s++) if (this.canMove(s)) marks.draggable.push(s);
      }
      if (this.showDanger) marks.danger = dangerSquares(pos, this.opponent());
      if (this.hintSq) marks.hint = this.hintSq;
      if (this.why) { o.merge(this.why.overlay); marks.bad = this.why.bad; }
      if (this.preview) o.merge(this.preview);
      if (this.gs.targets) this.gs.targets.forEach((t) => { if (pos.board[t] && E.colorOf(pos.board[t]) === 'b') o.badge(t, '★', ''); });
      this.decorate(marks, o, st);
      stateTag(o, st, pos);
      marks.overlay = o.svg();
      App.board.setMarks(marks);
      renderStatus({ turn: pos.turn, drill: this.mode === 'drill', mode: this.mode === 'drill' ? 'drill' : 'rules', st });
      this.renderWidgets(st);
      this.updateTask();
      this.updateToolbar();
    }

    decorate() {}

    /* ----- Demonstrate: run the step's script, or solve the goal on its own ----- */
    async demonstrate(run) {
      if (this.history.some((e) => !e.fixed) || this.success || this.over || this.puzzle) {
        this.puzzle = 0;
        this.reset(false);
        await pause(run, 500, false);
      }
      const opening = !!this.deferred;
      await this.idle(run);
      if (opening) await pause(run, 0, true);
      const script = this.step.auto;
      if (script) for (const [i, a] of script.entries()) await this.perform(run, a, i === script.length - 1);
      else await this.autoSolve(run);
      await settle(run, 400);
    }
    async idle(run) {
      for (let i = 0; i < 400; i++) {
        if (this.deferred) { await pause(run, 0, true); this.flushDeferred(); continue; }
        if (!(this.busy || this.promoting)) return;
        await pause(run, 120, false);
      }
    }
    async perform(run, a, last) {
      const hold = (ms) => (last ? settle(run, ms) : pause(run, ms, true));
      await this.idle(run);
      if (a.ask) return askClass(run, a.ask);
      if (a.wait) return hold(a.wait);
      if (a.say) { Feedback.say(ui(a.say), 'info'); return hold(1800); }
      if (a.danger != null) {
        this.showDanger = a.danger;
        this.render();
        Feedback.say(ui(a.danger ? 'fb.danger.on' : 'fb.danger.off', { Side: sideName(this.opponent()) }), 'info');
        return hold(1200);
      }
      if (a.undo) { this.undo(true); return hold(1100); }
      if (a.nextPuzzle) { this.puzzle++; this.reset(false); await pause(run, 900); return this.idle(run); }
      if (a.select) { this.select(E.index(a.select)); return hold(a.hold || 1500); }
      const uci = a.move || a.attempt;
      if (!uci) return null;
      const from = E.index(uci.slice(0, 2)), to = E.index(uci.slice(2, 4));
      if (this.selected !== from) {
        if (a.attempt) { this.selected = from; this.why = null; this.render(); }
        else { this.select(from); await pause(run, 900); }
      }
      await pause(run, 250, false);
      this.attempt(from, to, uci[4] || null);
      await this.idle(run);
      await hold(a.hold || (a.attempt ? 2900 : 1700));
      return this.idle(run);
    }
    /** Whether this move completes the goal (so the demonstration doesn't wait after it). */
    goalWouldFinish(m, next) {
      const g = this.step.goal;
      if (!g) return false;
      if (g.type === 'mate') return E.status(next).checkmate && (!this.step.puzzles || this.puzzle === this.step.puzzles.length - 1);
      if (g.type === 'capture') {
        return this.gs.targets.every((t) => !next.board[t] || E.colorOf(next.board[t]) !== 'b');
      }
      return g.type === 'any' || (g.type === 'ep' && m.ep) || (g.type === 'castle' && m.castle) || (g.type === 'escape-all' && this.gs.found && this.gs.found.size === 2 && !this.gs.found.has(E.escapeKind(this.pos, m)));
    }
    async autoSolve(run) {
      const g = this.goal();
      if (!g || !g.hint) return;
      for (let i = 0; i < 24 && !this.success; i++) {
        await this.idle(run);
        if (this.gs.solvedPuzzle) { await this.perform(run, { nextPuzzle: true }); continue; }
        const m = g.hint(this);
        if (!m) break;
        const next = E.makeMove(this.pos, m);
        await this.perform(run, { move: E.uciOf(m) }, this.goalWouldFinish(m, next));
      }
    }

    renderWidgets(st) {
      const w = this.step.widget;
      const nodes = [];
      if (w === 'escapes') nodes.push(escapesWidget(this.pos, { found: this.gs.found, withText: this.step.goal && this.step.goal.type === 'escape-all' }));
      if (w === 'castling') nodes.push(castleWidget(this.pos, 'w'));
      if (w === 'matrix') nodes.push(matrixWidget(this.pos));
      this.widgetEl.replaceChildren(...nodes);
      if (nodes.length && (w !== 'escapes' || (st && st.check))) followWidget(this.widgetEl);
    }

    updateTask() {
      const g = this.goal();
      this.task.set(this.promptText(), g && g.progress ? g.progress(this) : '', this.success || shownDone(this.lesson, this.step));
    }
  }

  /** Breadth-first search for the shortest capture route (used for hints in drills). */
  function solveCapture(c) {
    const targets = c.gs.targets;
    const start = c.pos;
    const key = (p) => p.board.join(',');
    const done = (p) => targets.every((t) => !p.board[t] || E.colorOf(p.board[t]) !== 'b');
    const seen = new Set([key(start)]);
    let frontier = [{ pos: start, first: null }];
    for (let depth = 0; depth < 10 && frontier.length; depth++) {
      const next = [];
      for (const node of frontier) {
        for (const m of E.legalMoves(node.pos)) {
          if (c.step.movable && E.typeOf(m.piece) !== c.step.movable) continue;
          const n = E.makeMove(node.pos, m);
          n.turn = 'w';
          n.ep = null;
          const k = key(n);
          if (seen.has(k)) continue;
          seen.add(k);
          const first = node.first || m;
          if (done(n)) return first;
          next.push({ pos: n, first });
        }
      }
      frontier = next;
    }
    return null;
  }

  const GOALS = {
    capture: {
      init(c) {
        const pos = E.parseFEN(c.fen());
        const t = c.step.goal.targets;
        c.gs.targets = t ? t.map(E.index) : pos.board.map((p, s) => (p && E.colorOf(p) === 'b' ? s : -1)).filter((s) => s >= 0);
      },
      prompt(c) { return ui(c.step.goal.prompt || 'prompt.capture', { piece: E.PIECE_NAMES[c.step.movable], par: c.step.goal.par }); },
      remaining(c) { return c.gs.targets.filter((s) => c.pos.board[s] && E.colorOf(c.pos.board[s]) === 'b'); },
      progress(c) {
        const total = c.gs.targets.length;
        return ui('goal.capture.progress', { done: total - this.remaining(c).length, total, moves: c.history.length, par: c.step.goal.par });
      },
      after(c, prev, m, next, line) {
        if (this.remaining(c).length) { Feedback.say(line, m.captured ? 'success' : 'info'); return { reply: false }; }
        const moves = c.history.length, par = c.step.goal.par;
        const key = moves < par ? 'goal.capture.under' : moves === par ? 'goal.capture.par' : 'goal.capture.over';
        c.succeed(ui(key, { moves, par }), moves <= par ? 'success' : 'warn');
        return { reply: false };
      },
      hint(c) { return solveCapture(c); },
    },

    plies: {
      prompt(c) { return ui('prompt.turns.' + Math.min(c.history.length, 3)); },
      progress(c) { return ui('goal.turns.progress', { n: Math.min(c.history.length, c.step.goal.count), total: c.step.goal.count }); },
      after(c, prev, m, next, line) {
        if (c.history.length >= c.step.goal.count) { c.succeed(line + ' ' + ui('goal.turns.done')); return { reply: false }; }
        Feedback.say(line, 'info', { sub: this.prompt(c) });
        return { reply: false };
      },
      hint(c) {
        const ms = E.legalMoves(c.pos);
        return ms.find((m) => m.double && 'de'.includes(N(m.from)[0])) || ms[0];
      },
    },

    'escape-all': {
      init(c) { c.gs.found = c.gs.found || new Set(); },
      prompt(c) {
        const left = 3 - c.gs.found.size;
        return c.gs.found.size && left ? ui('goal.escape.next', { left }) + ' ' + ui('prompt.escapeAll') : ui('prompt.escapeAll');
      },
      progress(c) { return ['king', 'block', 'capture'].map((k) => (c.gs.found.has(k) ? '✓ ' : '○ ') + ui('esc.' + k)).join('   '); },
      after(c, prev, m, next, line) {
        const kind = E.escapeKind(prev, m);
        const already = c.gs.found.has(kind);
        c.gs.found.add(kind);
        if (c.gs.found.size === 3) { c.succeed(ui('goal.escape.' + kind) + ' ' + ui('goal.escape.done')); return { reply: false }; }
        Feedback.say(already ? ui('goal.escape.again') : ui('goal.escape.' + kind), already ? 'warn' : 'success', { sub: line });
        c.locked = true;
        c.busy = true;
        c.afterBeat(() => c.reset(false, true), 2200 * waitFactor());
        return { reply: false };
      },
      hint(c) {
        const e = E.escapes(c.pos);
        for (const k of ['king', 'block', 'capture']) if (!c.gs.found.has(k) && e.groups[k].length) return e.groups[k][0];
        return null;
      },
    },

    any: {
      after(c, prev, m, next, line) { c.succeed(line + ' ' + ui(c.step.goal.done || 'goal.done')); return { reply: false }; },
      hint(c) { return E.legalMoves(c.pos)[0]; },
    },

    mate: {
      prompt(c) {
        const g = c.step.goal;
        if (g.prompt) return ui(g.prompt);
        return ui('prompt.mate') + (c.step.puzzles ? ' ' + ui('goal.mate.puzzle', { n: c.puzzle + 1, total: c.step.puzzles.length }) : '');
      },
      progress(c) { return c.step.puzzles ? ui('goal.mate.puzzle', { n: c.puzzle + 1, total: c.step.puzzles.length }) : ''; },
      after(c, prev, m, next, line) {
        const st = E.status(next);
        const g = c.step.goal;
        if (st.checkmate) {
          let msg = ui('goal.mate.done');
          if (g.promote) msg = ui(m.promotion === 'r' ? 'goal.promote.doneRook' : 'goal.promote.done');
          const total = c.step.puzzles ? c.step.puzzles.length : 1;
          if (c.puzzle < total - 1) {
            c.locked = true;
            c.gs.solvedPuzzle = true;
            celebrate(m.to);
            Feedback.say(msg, 'success', { actions: [{ label: ui('goal.mate.next'), primary: true, icon: 'arrowRight', run: () => { c.puzzle++; c.reset(false); } }] });
          } else {
            c.succeed(msg + (c.step.puzzles ? ' ' + ui('goal.mate.allDone') : ''));
          }
          return { reply: false };
        }
        c.locked = true;
        const actions = [{ label: ui('goal.tryAgain'), primary: true, icon: 'undo', run: () => c.undo(true) }];
        let msg, tone = 'error';
        if (st.stalemate) { msg = ui('goal.mate.stalemate'); tone = 'warn'; }
        else if (m.promotion && (m.promotion === 'b' || m.promotion === 'n')) msg = ui('goal.promote.under', { promo: E.PIECE_NAMES[m.promotion] });
        else if (st.check) {
          const reply = st.moves.find((x) => E.typeOf(x.piece) === 'k') || st.moves[0];
          msg = ui('goal.mate.check', { escape: moveShort(reply) });
          actions.push({ label: ui('goal.showReply'), run: () => c.showReply(reply) });
        } else msg = ui('goal.mate.quiet');
        Feedback.say(msg, tone, { sub: describeMove(prev, m), actions });
        return { reply: false };
      },
      hint(c) { return E.legalMoves(c.pos).find((m) => E.status(E.makeMove(c.pos, m)).checkmate); },
    },

    castle: {
      after(c, prev, m, next, line) {
        if (m.castle) { c.succeed(line + ' ' + ui('goal.castle.done')); return { reply: false }; }
        if (c.step.goal.only) {
          c.locked = true;
          c.busy = true;
          Feedback.say(line, 'warn', { sub: ui('goal.castle.other') });
          c.afterBeat(() => c.undo(true), 1600 * waitFactor());
          return { reply: false };
        }
        Feedback.say(line, 'info');
        return { reply: true };
      },
      afterReply(c, prev, m, next, line) {
        const can = ['K', 'Q'].some((side) => E.castlingReport(next, 'w', side).ok);
        Feedback.say(line, 'info', can ? { sub: ui('goal.castle.cleared') } : {});
      },
      hint(c) {
        const ms = E.legalMoves(c.pos);
        const castle = ms.find((m) => m.castle);
        if (castle) return castle;
        const between = E.CASTLE.wK.between;
        return ms.find((m) => between.includes(m.from) && !between.includes(m.to)) || null;
      },
    },

    ep: {
      after(c, prev, m, next) {
        if (m.ep) { c.succeed(ui('goal.ep.done', { to: N(m.to), captureSq: N(m.captureSq) })); return { reply: false }; }
        c.gs.epMissed = true;
        return { reply: true };
      },
      afterReply(c, prev, m, next, line) {
        const actions = [{ label: ui('goal.ep.replay'), primary: true, icon: 'reset', run: () => c.reset(false) }];
        if (!c.gs.missedShown) { c.gs.missedShown = true; Feedback.say(ui('goal.ep.missed'), 'warn', { sub: line, actions }); }
        else Feedback.say(line, 'info', { actions });
      },
      hint(c) { return E.legalMoves(c.pos).find((m) => m.ep) || null; },
    },
  };

  /* ----- Look-only board: name pieces, highlight groups ----- */
  class LookCtrl extends Ctrl {
    mount() {
      this.pos = E.parseFEN(this.step.fen);
      this.selected = null;
      this.named = (this.step.highlight || []).map(E.index);
      this.highlight = this.named.slice();
      App.board.setPosition(this.pos, { animate: false });
      setToolbar([]);
      this.render();
      this.complete();
      Feedback.clear();
    }
    activate(s) {
      const p = this.pos.board[s];
      this.highlight = [];
      this.named = [];
      if (!p) { this.selected = null; this.render(); return; }
      this.selected = s;
      Feedback.say(ui('fb.select', { Side: sideName(E.colorOf(p)), piece: pieceName(p), square: N(s) }), 'info');
      this.render();
    }
    cancel() { if (this.selected == null) return false; this.selected = null; this.render(); return true; }
    render() {
      const o = new Overlay();
      (this.named || []).forEach((s) => o.name(s));
      App.board.setMarks({ selected: this.selected, highlight: this.highlight, overlay: o.svg() });
      const st = bothKings(this.pos) ? E.status(this.pos) : null;
      renderStatus({ mode: 'look', st });
    }
    panel() { return this.textNodes(); }
  }

  class EquipmentCtrl extends LookCtrl {
    panel() {
      const kitKey = 'kit';
      const have = store.get(kitKey, {});
      const items = ['board', 'pieces', 'opponent'];
      const kit = h('ul', { class: 'kit' }, items.map((id) => {
        const box = h('input', { type: 'checkbox', id: 'kit-' + id, checked: have[id] ? true : null, onchange: (e) => { have[id] = e.target.checked; store.set(kitKey, have); } });
        return h('li', null, h('label', { for: 'kit-' + id }, box,
          h('span', null, h('span', { class: 'kit-name' }, ui('kit.' + id)), h('span', { class: 'kit-detail' }, ui('kit.' + id + '.detail')))));
      }));
      const counts = { k: 1, q: 1, r: 2, b: 2, n: 2, p: 8 };
      this.invButtons = [];
      const inv = h('div', { class: 'inventory', role: 'group', 'aria-label': ui('kit.count.title') }, Object.keys(counts).map((t) => {
        const b = h('button', { type: 'button', class: 'inv-btn', 'aria-pressed': 'false', onclick: () => this.showType(t, counts[t], b) },
          fromHTML(Pieces.svg(t.toUpperCase())),
          h('span', { class: 'inv-count' }, '×' + counts[t]),
          h('span', { class: 'inv-name' }, E.PIECE_NAMES[t]));
        this.invButtons.push(b);
        return b;
      }));
      return [
        ...this.textNodes(),
        h('section', { class: 'widget', 'aria-labelledby': 'kit-title' }, h('h2', { id: 'kit-title' }, ui('kit.title')), kit),
        h('section', { class: 'widget', 'aria-labelledby': 'inv-title' }, h('h2', { id: 'inv-title' }, ui('kit.count.title')), inv, h('p', { class: 'notice' }, ui('kit.count.hint'))),
      ];
    }
    showType(t, count, btn) {
      this.invButtons.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      this.selected = null;
      this.highlight = [];
      this.pos.board.forEach((p, s) => { if (p && E.typeOf(p) === t) this.highlight.push(s); });
      Feedback.say(ui('kit.count.found', { count, name: E.PIECE_NAMES[t], plural: count > 1 ? 's' : '' }), 'info');
      this.render();
    }
  }

  class InfoCtrl extends LookCtrl {}

  /** Equipment: tick through the checklist, then find each kind of piece on the board. */
  EquipmentCtrl.prototype.demonstrate = async function (run) {
    const rows = [...document.querySelectorAll('#panel-body .kit li')];
    try {
      for (const li of rows) {
        li.classList.add('spot');
        bringIntoView(li);
        await pause(run, 800);
        li.classList.remove('spot');
      }
    } finally { rows.forEach((li) => li.classList.remove('spot')); }
    for (const [i, b] of this.invButtons.entries()) {
      bringIntoView(b);
      b.click();
      const last = i === this.invButtons.length - 1;
      if (last && clickPace()) return;
      await pause(run, 1500, !last);
    }
    this.invButtons.forEach((b) => b.setAttribute('aria-pressed', 'false'));
    this.highlight = [];
    this.render();
  };

  /* ----- Demonstrations ----- */
  function demoMove(pos, uci, mode) {
    let p = pos;
    if (mode === 'free') p = Object.assign({}, pos, { turn: E.colorOf(pos.board[E.index(uci.slice(0, 2))]) });
    if (mode === 'drill') p = Object.assign({}, pos, { turn: 'w' });
    const m = E.moveFromUci(p, uci);
    if (!m) throw new Error('Demo move not legal: ' + uci);
    const n = E.makeMove(p, m);
    if (mode === 'drill') { n.turn = 'w'; n.ep = null; }
    return { m, n, prev: p };
  }

  class DemoCtrl extends Ctrl {
    mount() {
      const s = this.step;
      this.mode = s.mode || 'rules';
      this.positions = [];
      this.moves = [];
      this.prevs = [];
      let pos = E.parseFEN(s.fen);
      s.frames.forEach((f) => {
        if (f.fen) pos = E.parseFEN(f.fen);
        let m = null, prev = null;
        if (f.move) { const r = demoMove(pos, f.move, this.mode); m = r.m; prev = r.prev; pos = r.n; }
        this.positions.push(pos);
        this.moves.push(m);
        this.prevs.push(prev);
      });
      this.reps = this.positions.map((p, i) => {
        if (s.frames[i].widget !== 'repetition') return 0;
        const key = E.positionKey(p);
        return this.positions.slice(0, i + 1).filter((q, j) => s.frames[j].widget === 'repetition' && E.positionKey(q) === key).length;
      });
      this.i = 0;
      this.widgetEl = h('div', { class: 'widgets' });
      this.buildToolbar();
      App.board.setPosition(this.positions[0], { animate: false });
      this.render();
    }
    get last() { return this.positions.length - 1; }
    panel() { return [...this.textNodes(), this.widgetEl]; }

    goto(i) {
      if (i < 0 || i > this.last) return;
      const forward = i === this.i + 1;
      this.i = i;
      App.board.setPosition(this.positions[i], { move: forward ? this.moves[i] : null });
      this.render();
      if (i === this.last) this.complete();
    }
    next() { if (this.i < this.last) this.goto(this.i + 1); }
    back() { Run.stop(); this.goto(this.i - 1); }
    restart() { Run.stop(); this.goto(0); }
    delay() {
      const f = this.step.frames[this.i];
      if ((f.caption && hasText(f.caption)) || f.why) return 3600;
      return this.moves[this.i] ? 1800 : 2600;
    }
    async demonstrate(run) {
      if (this.i >= this.last) { this.goto(0); await pause(run, 800, false); }
      await pause(run, 150, false);
      while (this.i < this.last) {
        const f = this.step.frames[this.i + 1];
        if (f.ask) await askClass(run, f.ask);
        this.next();
        if (this.i < this.last) await pause(run, this.delay(), true);
      }
    }
    advance() { if (this.i < this.last) { Run.stop(); this.next(); return true; } return false; }
    retreat() { if (this.i > 0) { this.back(); return true; } return false; }

    buildToolbar() {
      this.btn = {
        restart: toolButton({ icon: 'restart', label: ui('tool.restart'), run: () => this.restart() }),
        back: toolButton({ icon: 'back', label: ui('tool.back'), keys: ',', run: () => this.back() }),
        next: toolButton({ icon: 'next', label: ui('tool.next'), keys: '.', run: () => this.next() }),
      };
      this.counter = h('span', { class: 'frame-count', 'aria-live': 'off' });
      setToolbar([this.btn.restart, this.btn.back, this.btn.next, this.counter]);
    }
    updateToolbar() {
      if (!this.btn) return;
      setDisabled(this.btn.back, this.i === 0);
      setDisabled(this.btn.next, this.i === this.last);
      this.counter.textContent = ui('tool.frame', { n: this.i + 1, total: this.last + 1 });
    }

    activate(s) {
      const p = App.board.pos.board[s];
      if (p) Feedback.say(ui('fb.select', { Side: sideName(E.colorOf(p)), piece: pieceName(p), square: N(s) }), 'info', { sub: ui('demo.boardHint') });
    }
    cancel() { return false; }

    render() {
      const f = this.step.frames[this.i];
      const pos = this.positions[this.i];
      const m = this.moves[this.i];
      const marks = {};
      const o = new Overlay();
      if (m) { marks.last = [m.from, m.to]; o.arrow(m.from, m.to, 'trail'); }
      if (f.highlight) marks.highlight = f.highlight;
      const st = this.mode !== 'free' && bothKings(pos) ? E.status(pos) : null;
      if (st && st.check) { marks.check = st.king; st.checkers.forEach((c) => o.attack(c, st.king)); }
      if (f.danger) marks.danger = dangerSquares(pos, E.other(pos.turn));
      const turnFor = (s) => Object.assign({}, pos, { turn: E.colorOf(pos.board[s]) });
      if (f.rays) { const s = E.index(f.rays); o.pieceLines(pos, s, E.legalMoves(turnFor(s), s)); marks.selected = s; }
      if (f.movesFrom) {
        const s = E.index(f.movesFrom);
        const ms = E.legalMoves(turnFor(s), s);
        marks.selected = s;
        marks.moves = ms.filter((x) => !x.captured).map((x) => x.to);
        marks.captures = ms.filter((x) => x.captured).map((x) => x.to);
        if (E.typeOf(pos.board[s]) === 'p') o.pawnLines(pos, s, ms);
      }
      if (f.blocked) {
        const s = E.index(f.blocked);
        const ahead = s + (E.colorOf(pos.board[s]) === 'w' ? 8 : -8);
        marks.selected = s;
        o.stopBar(s, ahead);
        o.x(ahead);
      }
      let whyLine = '';
      if (f.why) {
        const from = E.index(f.why.slice(0, 2)), to = E.index(f.why.slice(2, 4));
        const ex = E.explain(pos, from, to);
        o.merge(whyOverlay(pos, from, to, ex));
        marks.selected = from;
        marks.bad = [to];
        whyLine = whyText(pos, from, to, ex);
      }
      if (f.arrows) f.arrows.forEach(([a, b]) => o.arrow(E.index(a), E.index(b), 'attack'));
      if (f.show && st && st.check) {
        const e = E.escapes(pos);
        e.groups[f.show].forEach((x) => o.arrow(x.from, x.to, 'good'));
        marks.good = e.groups[f.show].map((x) => x.to);
      }
      if (f.trapped) trappedOverlay(pos, o);
      stateTag(o, st, pos);
      marks.overlay = o.svg();
      App.board.setMarks(marks);
      renderStatus({ turn: this.mode === 'free' ? null : pos.turn, drill: this.mode === 'drill', mode: 'demo', st });

      const prev = this.prevs[this.i];
      const moveLine = m ? [describeMove(prev, m), this.mode === 'rules' ? stateLine(pos) : ''].filter(Boolean).join(' ') : '';
      let frameName = f.label ? ui(f.label) : '';
      if (!frameName && this.step.numbered) frameName = m ? ui('frame.move', { n: prev.fullmove, Side: sideName(E.colorOf(m.piece)) }) : ui('frame.start');
      const label = ui('tool.frame', { n: this.i + 1, total: this.last + 1 }) + (frameName ? ' · ' + frameName : '');
      const upcoming = this.step.frames[this.i + 1];
      Feedback.show(h('div', { class: 'caption' },
        h('p', { class: 'frame-label' }, label),
        moveLine ? h('p', { class: 'move-line' }, moveLine) : null,
        whyLine ? h('p', { class: 'why-line' }, icon('error'), h('span', null, whyLine)) : null,
        f.caption ? textBlock(f.caption) : null,
        f.note ? h('p', null, ui(f.note)) : null,
        upcoming && upcoming.ask && !Run.active ? h('p', { class: 'ask-inline' }, icon('users'), h('span', null, h('strong', null, ui('ask.label') + ': '), ui(upcoming.ask))) : null,
        this.i === this.last ? h('p', { class: 'notice' }, ui('demo.done')) : null,
        null));

      const w = f.widget || this.step.widget;
      const nodes = [];
      if (w === 'escapes') nodes.push(escapesWidget(pos));
      if (w === 'castling') nodes.push(castleWidget(pos, this.step.widgetColor || pos.turn));
      if (w === 'matrix') nodes.push(matrixWidget(pos));
      if (w === 'repetition') nodes.push(repetitionWidget(this.reps[this.i]));
      if (this.step.numbered && this.i > 0) {
        const entries = [];
        for (let j = 1; j <= this.i; j++) if (this.moves[j]) entries.push({ n: this.prevs[j].fullmove, m: this.moves[j] });
        nodes.push(h('section', { class: 'widget', 'aria-label': ui('play.moves') }, h('h2', null, ui('play.moves')), h('div', { class: 'scoresheet' }, scoreTable(entries))));
      }
      this.widgetEl.replaceChildren(...nodes);
      if (nodes.length && (w !== 'escapes' || (st && st.check) || this.step.numbered)) followWidget(this.widgetEl);
      this.updateToolbar();
    }
  }

  /** A scoresheet table: entries are { n (move number), m (move) } in order. The newest move is highlighted. */
  function scoreTable(entries) {
    const cellFor = (e, latest) => {
      if (!e) return h('td');
      const m = e.m;
      const text = m.castle ? ui('castle.side.' + m.castle) : N(m.from) + (m.captured ? ' × ' : ' – ') + N(m.to) + (m.promotion ? ' = ' + E.PIECE_NAMES[m.promotion] : '');
      return h('td', { class: latest ? 'latest' : null }, h('span', { class: 'mini', html: Pieces.svg(m.piece), 'aria-hidden': 'true' }), h('span', { class: 'sr-only' }, pieceName(m.piece) + ' '), text);
    };
    const rows = [];
    let row = null;
    entries.forEach((e, i) => {
      const white = E.colorOf(e.m.piece) === 'w';
      if (white || !row || row.n !== e.n) { row = { n: e.n, w: null, b: null }; rows.push(row); }
      row[white ? 'w' : 'b'] = Object.assign({ latest: i === entries.length - 1 }, e);
    });
    return h('table', null,
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, '#'), h('th', { scope: 'col' }, sideName('w')), h('th', { scope: 'col' }, sideName('b')))),
      h('tbody', null, rows.map((r) => h('tr', null, h('td', null, String(r.n)), cellFor(r.w, r.w && r.w.latest), cellFor(r.b, r.b && r.b.latest)))));
  }

  function repetitionWidget(count) {
    return h('section', { class: 'widget', 'aria-label': ui('rep.title') },
      h('h2', null, ui('rep.title')),
      h('div', { class: 'rep-row' },
        h('div', { class: 'rep-dots', 'aria-hidden': 'true' }, [1, 2, 3].map((n) => h('span', { class: 'rep-dot' + (n <= count ? ' on' : '') }))),
        h('p', null, ui('rep.count', { n: count, s: count === 1 ? '' : 's' }))),
      count >= 3 ? h('p', { class: 'rep-claim' }, icon('check'), ui('rep.claim')) : null);
  }

  /* ----- Place the board: rotate until the right-hand corner is light ----- */
  class RotateCtrl extends Ctrl {
    mount() {
      this.rot = 90;
      App.hideCoords = true;
      applySettings();
      App.board.setPosition(E.parseFEN(EMPTY), { animate: false });
      App.board.setMarks({});
      const wrap = App.board.wrap;
      wrap.classList.add('rotating');
      wrap.style.transform = `rotate(${this.rot}deg)`;
      this.corner = h('div', { class: 'corner-mark', 'aria-hidden': 'true' });
      this.corner.style.gridArea = '1 / 2';
      this.corner.style.position = 'relative';
      this.corner.style.justifySelf = 'end';
      this.corner.style.alignSelf = 'end';
      this.corner.style.width = '12.5%';
      this.corner.style.height = '12.5%';
      $('#board-frame').append(this.corner);
      this.task = taskCard();
      setToolbar([
        toolButton({ icon: 'turnLeft', label: ui('tool.turnLeft'), keep: true, run: () => this.turn(-90) }),
        toolButton({ icon: 'turnRight', label: ui('tool.turnRight'), keep: true, run: () => this.turn(90) }),
      ]);
      renderStatus({ mode: 'look' });
      this.check(false);
    }
    panel() { return [...this.textNodes(), this.task.el]; }
    turn(d) { this.rot += d; App.board.wrap.style.transform = `rotate(${this.rot}deg)`; this.check(true); }
    async demonstrate(run) {
      const r = ((this.rot % 360) + 360) % 360;
      if (r === 0 || r === 180) { this.rot += 90; App.board.wrap.style.transform = `rotate(${this.rot}deg)`; this.check(false); await pause(run, 1200, false); }
      await askClass(run, 'ask.board');
      this.turn(90);
      await settle(run, 2000);
    }
    check(spoken) {
      const r = ((this.rot % 360) + 360) % 360;
      const ok = r === 0 || r === 180;
      this.task.set(ui('prompt.rotate'), ui('goal.rotate.corner', { shade: ui(ok ? 'goal.rotate.light' : 'goal.rotate.darkWord') }), ok && shownDone(this.lesson, this.step));
      if (ok) {
        Feedback.say(ui('goal.rotate.done'), 'success', { actions: this.nextAction() });
        if (spoken) this.later(() => celebrate(null), 560);
        this.complete();
        this.task.set(ui('prompt.rotate'), ui('goal.rotate.corner', { shade: ui('goal.rotate.light') }), true);
      } else Feedback.say(spoken ? ui('goal.rotate.dark') : ui('prompt.rotate'), spoken ? 'warn' : 'info');
    }
    unmount() {
      super.unmount();
      const wrap = App.board.wrap;
      wrap.style.transform = '';
      wrap.classList.remove('rotating');
      this.corner.remove();
      App.hideCoords = false;
      applySettings();
    }
  }

  /* ----- Spot the setup mistakes ----- */
  class SpotCtrl extends Ctrl {
    mount() {
      this.answer = E.parseFEN(this.step.answer);
      this.task = taskCard();
      setToolbar([
        toolButton({ icon: 'reset', label: ui('tool.reset'), run: () => this.start() }),
        toolButton({ icon: 'eye', label: ui('tool.showAnswer'), run: () => this.revealAll() }),
      ]);
      renderStatus({ mode: 'look' });
      this.start(true);
    }
    start(first) {
      this.pos = E.parseFEN(this.step.fen);
      this.found = new Set();
      this.good = [];
      App.board.setPosition(this.pos, { animate: !first });
      Feedback.say(ui('prompt.fix'), 'info');
      this.render();
    }
    panel() { return [...this.textNodes(), this.task.el]; }
    fix(i) {
      const mk = this.step.mistakes[i];
      this.found.add(i);
      const board = this.pos.board.slice();
      mk.squares.forEach((q) => { const s = E.index(q); board[s] = this.answer.board[s]; });
      this.pos = Object.assign({}, this.pos, { board });
      this.good = mk.squares.map(E.index);
      App.board.setPosition(this.pos);
    }
    activate(s) {
      const mistakes = this.step.mistakes;
      if (this.found.size === mistakes.length) return;
      const i = mistakes.findIndex((m, k) => !this.found.has(k) && m.squares.map(E.index).includes(s));
      if (i >= 0) {
        this.fix(i);
        const left = mistakes.length - this.found.size;
        if (!left) {
          Feedback.say(ui('goal.fix.done'), 'success', { actions: this.nextAction() });
          celebrate(s);
          this.complete();
        } else Feedback.say(ui('goal.fix.found', { what: ui(mistakes[i].what), left }), 'success');
      } else if (this.pos.board[s]) {
        Feedback.say(ui('goal.fix.correct'), 'info');
        App.board.nudge(s);
      }
      this.render();
    }
    async demonstrate(run) {
      this.start();
      await pause(run, 600, false);
      await askClass(run, 'ask.setup');
      for (let i = 0; i < this.step.mistakes.length; i++) {
        const squares = this.step.mistakes[i].squares.map(E.index);
        this.flashSquares = squares;
        Feedback.say(ui('fix.flash', { n: i + 1, total: this.step.mistakes.length }), 'info');
        this.render();
        await pause(run, 1400);
        this.flashSquares = null;
        this.activate(squares[0]);
        if (i < this.step.mistakes.length - 1) await pause(run, 1800, true);
        else await settle(run, 1800);
      }
    }
    revealAll() {
      this.step.mistakes.forEach((m, i) => { if (!this.found.has(i)) this.fix(i); });
      this.good = this.step.mistakes.flatMap((m) => m.squares.map(E.index));
      Feedback.say(ui('goal.fix.done'), 'info', { actions: this.nextAction() });
      this.render();
    }
    cancel() { return false; }
    render() {
      App.board.setMarks({ good: this.good, highlight: this.flashSquares || [] });
      this.task.set(ui('prompt.fix'), ui('goal.fix.progress', { n: this.found.size, total: this.step.mistakes.length }), this.found.size === this.step.mistakes.length);
    }
  }

  /* ----- Checkmate, stalemate, or neither? ----- */
  function classify(pos) {
    const st = E.status(pos);
    return st.checkmate ? 'mate' : st.stalemate ? 'stalemate' : 'neither';
  }

  class ClassifyCtrl extends Ctrl {
    mount() {
      this.k = 0;
      this.score = 0;
      this.box = h('div', { class: 'choices-wrap' });
      this.widgetEl = h('div');
      this.task = taskCard();
      setToolbar([toolButton({ icon: 'reset', label: ui('tool.reset'), run: () => { this.k = 0; this.score = 0; this.show(); } })]);
      this.show(true);
    }
    panel() { return [...this.textNodes(), this.task.el, this.box, this.widgetEl]; }
    show(first) {
      this.pos = E.parseFEN(this.step.items[this.k]);
      this.answered = null;
      App.board.setPosition(this.pos, { animate: !first });
      Feedback.say(ui('prompt.classify'), 'info');
      this.render();
    }
    choose(key) {
      if (this.answered) return;
      this.answered = key;
      const right = classify(this.pos);
      if (key === right) this.score++;
      const last = this.k === this.step.items.length - 1;
      const answerText = ui('goal.classify.' + right);
      const actions = last ? this.nextAction() : [{ label: ui('goal.classify.next'), primary: true, icon: 'arrowRight', run: () => { this.k++; this.show(); } }];
      if (last) { this.complete(); }
      Feedback.say(ui(key === right ? 'goal.classify.right' : 'goal.classify.wrong', { answer: answerText }), key === right ? 'success' : 'error',
        { sub: last ? ui('goal.classify.done', { total: this.step.items.length }) : '', actions });
      if (key === right) celebrate(E.findKing(this.pos, this.pos.turn));
      this.render();
    }
    cancel() { return false; }
    activate(s) {
      const p = this.pos.board[s];
      if (p) Feedback.say(ui('fb.select', { Side: sideName(E.colorOf(p)), piece: pieceName(p), square: N(s) }), 'info', { sub: this.answered ? '' : ui('prompt.classify') });
    }
    async demonstrate(run) {
      const lastIdx = this.step.items.length - 1;
      if (this.answered && this.k === lastIdx) { this.k = 0; this.score = 0; this.show(); await pause(run, 700, false); }
      for (;;) {
        if (this.answered) { this.k++; this.show(); await pause(run, 800, false); }
        await askClass(run, 'ask.classify');
        this.choose(classify(this.pos));
        if (this.k >= lastIdx) { await settle(run, 3200); break; }
        await pause(run, 3200, true);
      }
    }
    render() {
      const st = E.status(this.pos);
      const o = new Overlay();
      const marks = {};
      if (this.answered) {
        if (st.check) { marks.check = st.king; st.checkers.forEach((c) => o.attack(c, st.king)); }
        trappedOverlay(this.pos, o);
        stateTag(o, st, this.pos);
      }
      marks.overlay = o.svg();
      App.board.setMarks(marks);
      renderStatus({ turn: this.pos.turn, mode: 'rules', st: this.answered ? st : null });
      const right = classify(this.pos);
      this.box.replaceChildren(h('div', { class: 'choices', role: 'group', 'aria-label': ui('prompt.classify') },
        ['mate', 'stalemate', 'neither'].map((key, i) => {
          const isRight = this.answered && key === right;
          return h('button', {
            type: 'button', class: 'choice' + (this.answered ? (isRight ? ' correct' : ' wrong') : ''),
            'aria-pressed': String(this.answered === key), disabled: this.answered ? true : null, onclick: () => this.choose(key),
          }, h('span', { class: 'key', 'aria-hidden': 'true' }, 'ABC'[i]), ui('classify.' + key),
            isRight ? h('span', { class: 'verdict' }, icon('check'), ui('ch.correct')) : h('span'));
        })));
      this.widgetEl.replaceChildren(...(this.answered ? [matrixWidget(this.pos), escapesWidget(this.pos)] : []));
      if (this.answered) followWidget(this.widgetEl);
      this.task.set(ui('prompt.classify'), ui('goal.classify.progress', { n: this.k + 1, total: this.step.items.length, score: this.score }), shownDone(this.lesson, this.step) && this.k === this.step.items.length - 1 && !!this.answered);
    }
  }

  const CONTROLLERS = {
    equipment: EquipmentCtrl, demo: DemoCtrl, play: PlayCtrl, rotate: RotateCtrl,
    spot: SpotCtrl, classify: ClassifyCtrl, info: InfoCtrl,
  };

  /* =====================================================================
   * Class challenge
   * ===================================================================== */
  class ChallengeCtrl {
    constructor(i) { this.i = i; this.timers = []; }
    later(fn, ms) { const t = setTimeout(() => { if (!this.stopped) fn(); }, ms); this.timers.push(t); return t; }
    unmount() { this.stopped = true; this.timers.forEach(clearTimeout); }
    get q() { return CHALLENGE[this.i]; }
    basePos() { return E.parseFEN(this.q.fen); }

    mount() {
      this.vote = null;
      this.revealed = false;
      this.playing = null;
      this.pos = this.basePos();
      App.board.setPosition(this.pos, { animate: false });
      this.choicesEl = h('div', { class: 'choices', role: 'group', 'aria-label': ui(this.q.question) });
      this.resultsEl = h('div');
      this.revealBtn = h('button', { type: 'button', class: 'btn primary', 'aria-keyshortcuts': 'R', onclick: () => this.reveal() }, icon('eye'), ui('ch.reveal'));
      setToolbar([
        toolButton({ icon: 'back', label: ui('ch.prev'), run: () => goChallenge(this.i - 1) }),
        toolButton({ icon: 'reset', label: ui('ch.restart'), run: () => this.mount() }),
        toolButton({ icon: 'next', label: ui('ch.next'), run: () => goChallenge(this.i + 1) }),
      ]);
      Feedback.say(ui('ch.vote'), 'info');
      this.render();
      this.renderPanel();
    }

    optionLabel(o) {
      if (o.label) return ui(o.label);
      if (o.square) return pieceName(this.basePos().board[E.index(o.square)]).replace(/^./, (c) => c.toUpperCase());
      if (o.move) {
        const m = E.moveFromUci(this.basePos(), o.move);
        return moveShort(m).replace(/^./, (c) => c.toUpperCase());
      }
      return o.key;
    }

    renderPanel() {
      const q = this.q;
      this.renderChoices();
      $('#panel-body').replaceChildren(
        h('p', { class: 'ch-question', id: 'ch-question' }, ui(q.question)),
        this.choicesEl,
        h('div', { class: 'ch-controls' }, this.revealBtn),
        this.resultsEl,
        panelNavChallenge(this.i));
    }

    renderChoices() {
      const q = this.q;
      this.choicesEl.replaceChildren(...q.options.map((o) => {
        const isRight = this.revealed && o.key === q.answer;
        return h('button', {
          type: 'button', class: 'choice' + (this.revealed ? (isRight ? ' correct' : ' wrong') : ''),
          'aria-pressed': String(this.vote === o.key), onclick: () => this.choose(o.key),
        }, h('span', { class: 'key', 'aria-hidden': 'true' }, o.key), h('span', null, h('span', { class: 'sr-only' }, o.key + ': '), this.optionLabel(o)),
        isRight ? h('span', { class: 'verdict' }, icon('check'), ui('ch.correct')) : this.vote === o.key ? h('span', { class: 'verdict' }, ui('ch.classPicked')) : h('span'));
      }));
    }

    choose(key) {
      this.vote = this.vote === key ? null : key;
      this.renderChoices();
      this.render();
    }

    reveal() {
      if (this.revealed) return;
      this.revealed = true;
      this.revealBtn.disabled = true;
      const q = this.q;
      const correctLabel = q.answer + ' (' + this.optionLabel(q.options.find((o) => o.key === q.answer)) + ')';
      if (this.vote) {
        if (this.vote === q.answer) Feedback.say(ui('ch.classRight'), 'success');
        else Feedback.say(ui('ch.classWrong', { picked: this.vote, answer: correctLabel }), 'error');
      } else Feedback.say(ui('ch.correct') + ': ' + correctLabel, 'success');
      if (this.vote === q.answer || !this.vote) celebrate(null);
      this.renderChoices();
      this.renderResults();
      if (q.reveal === 'pin') this.showPin();
      this.render();
    }

    renderResults() {
      const q = this.q;
      const pos = this.basePos();
      const items = [];
      if (q.reveal === 'reach') {
        const drill = Object.assign({}, pos, { turn: 'w' });
        q.options.forEach((o) => {
          const from = E.index(o.square), star = E.index(q.star);
          const ex = E.explain(drill, from, star);
          const v = { label: o.key, piece: pieceName(pos.board[from]), to: N(star) };
          let text;
          if (ex.code === 'legal') text = ui('cq.reach.legal', v);
          else if (ex.code === 'blocked') text = ui('cq.reach.blocked', Object.assign(v, { blocker: fullName(pos.board[ex.blocker]), blockerSq: N(ex.blocker) }));
          else if (ex.code === 'pawn-diagonal-empty') text = ui('cq.reach.pawn', v);
          else text = ui('cq.reach.pattern', v);
          items.push({ ok: ex.code === 'legal', text });
        });
      }
      if (q.reveal === 'moves') {
        q.options.forEach((o) => {
          if (!o.move) { items.push({ ok: o.key === q.answer, text: o.key + ': ' + this.optionLabel(o) }); return; }
          const m = E.moveFromUci(pos, o.move);
          const next = E.makeMove(pos, m);
          const st = E.status(next);
          const v = { label: o.key };
          let text;
          if (m.ep) text = ui('cq.move.ep', Object.assign(v, { captureSq: N(m.captureSq) }));
          else if (st.checkmate) text = ui('cq.move.mate', v);
          else if (st.stalemate) text = ui('cq.move.stalemate', v);
          else if (st.check) text = ui('cq.move.check', Object.assign(v, { escape: moveShort(st.moves.find((x) => E.typeOf(x.piece) === 'k') || st.moves[0]) }));
          else text = ui('cq.move.quiet', v);
          items.push({ ok: o.key === q.answer, text, play: o.move });
        });
      }
      if (q.reveal === 'pin') {
        const [a, b] = q.arrow.map(E.index);
        const ex = E.explain(pos, a, b);
        items.push({ ok: false, text: whyText(pos, a, b, ex) });
      }
      if (q.reveal === 'castle') {
        const r = E.castlingReport(pos, 'w', q.side);
        const fail = r.conditions.find((c) => !c.ok);
        items.push({ ok: false, text: ui('why.castle', { sideName: ui('castle.side.' + q.side), reason: castleReason(pos, fail) }) });
      }
      const list = h('ul', { class: 'ch-results' }, items.map((it) => h('li', { class: it.ok ? 'ok' : 'no' }, icon(it.ok ? 'check' : 'x'),
        h('span', null, it.text, it.play ? h('span', null, ' ', h('button', { type: 'button', class: 'linkish', onclick: () => this.playOption(it.play) }, ui('ch.showMe'))) : null))));
      this.resultsEl.replaceChildren(...[hasText(q.explain) ? null : list, textBlock(q.explain), q.reveal === 'castle' ? castleWidget(pos, 'w') : null].filter(Boolean));
      followWidget(this.resultsEl);
    }

    showPin() {
      const [a, b] = this.q.arrow.map(E.index);
      const base = this.basePos();
      const board = base.board.slice();
      board[b] = board[a];
      board[a] = null;
      this.pos = Object.assign({}, base, { board });
      this.hypo = { from: a, to: b };
      App.board.setPosition(this.pos, { move: { from: a, to: b, piece: base.board[a] } });
      this.later(() => this.render(), 50);
    }

    playOption(uci) {
      const base = this.basePos();
      const m = E.moveFromUci(base, uci);
      this.pos = base;
      App.board.setPosition(base, { animate: false });
      this.playing = { m, reply: null };
      const next = E.makeMove(base, m);
      this.pos = next;
      App.board.setPosition(next, { move: m });
      const st = E.status(next);
      Feedback.say([describeMove(base, m), stateLine(next)].filter(Boolean).join(' '), st.checkmate ? 'success' : st.stalemate ? 'warn' : 'info',
        { actions: [{ label: ui('ch.back'), icon: 'undo', run: () => this.backToQuestion() }] });
      this.render();
      if (st.check && !st.checkmate) {
        const reply = st.moves.find((x) => E.typeOf(x.piece) === 'k') || st.moves[0];
        this.later(() => {
          const after = E.makeMove(next, reply);
          this.playing.reply = reply;
          this.pos = after;
          App.board.setPosition(after, { move: reply });
          Feedback.say(describeMove(next, reply), 'info', { actions: [{ label: ui('ch.back'), icon: 'undo', run: () => this.backToQuestion() }] });
          this.render();
        }, 1300);
      }
    }

    backToQuestion() {
      this.timers.forEach(clearTimeout);
      this.playing = null;
      this.hypo = null;
      this.pos = this.basePos();
      App.board.setPosition(this.pos);
      Feedback.say(ui('ch.correct') + ': ' + this.q.answer, 'info');
      this.render();
    }

    activate(s) {
      const p = this.pos.board[s];
      if (p) Feedback.say(ui('fb.select', { Side: sideName(E.colorOf(p)), piece: pieceName(p), square: N(s) }), 'info');
    }
    cancel() { return false; }
    advance() { return false; }
    retreat() { return false; }
    async demonstrate(run) {
      const right = this.q.options.find((o) => o.key === this.q.answer);
      const plays = this.q.reveal === 'moves' && !!right.move;
      if (!this.revealed) {
        this.reveal();
        if (plays) await pause(run, 2600, true);
        else await settle(run, 2600);
      }
      if (plays) {
        this.playOption(right.move);
        await settle(run, 3200);
      }
    }
    render() {
      const q = this.q;
      const pos = this.pos;
      const base = this.basePos();
      const o = new Overlay();
      const marks = {};
      const rules = q.mode === 'rules';
      const st = rules ? E.status(pos) : null;
      if (st && st.check) { marks.check = st.king; st.checkers.forEach((c) => o.attack(c, st.king)); }
      if (q.lastMove && !this.playing) marks.last = q.lastMove;
      if (this.playing) {
        const m = this.playing.reply || this.playing.m;
        marks.last = [m.from, m.to];
        if (st && (st.checkmate || st.stalemate)) trappedOverlay(pos, o);
        stateTag(o, st, pos);
      } else if (this.hypo) {
        marks.bad = [this.hypo.to];
        marks.last = [this.hypo.from, this.hypo.to];
      } else {
        if (q.star) o.star(E.index(q.star));
        if (q.reveal === 'reach') {
          q.options.forEach((opt) => o.badge(E.index(opt.square), opt.key, this.revealed ? (opt.key === q.answer ? 'correct' : 'wrong') : ''));
          if (this.revealed) {
            const drill = Object.assign({}, base, { turn: 'w' });
            const star = E.index(q.star);
            q.options.forEach((opt) => {
              const from = E.index(opt.square);
              const ex = E.explain(drill, from, star);
              if (ex.code === 'legal') {
                if (E.typeOf(base.board[from]) === 'n') o.hop(from, star, 'good'); else o.arrow(from, star, 'good');
                o.tick(star);
              } else if (ex.code === 'blocked') { o.line(from, ex.blocker, rayClass(from, ex.blocker), 0.34, 0.36); o.x(ex.blocker); }
              else if (ex.code === 'pawn-diagonal-empty') o.diamond(star);
            });
          }
        }
        if (q.arrow) o.arrow(E.index(q.arrow[0]), E.index(q.arrow[1]), 'option');
        if (q.reveal === 'moves') {
          marks.highlight = [];
          q.options.forEach((opt) => {
            if (!opt.move) return;
            const m = E.moveFromUci(base, opt.move);
            const kind = this.revealed ? (opt.key === q.answer ? 'good' : 'option') : 'option';
            o.arrow(m.from, m.to, kind);
            o.badge(m.to, opt.key, this.revealed ? (opt.key === q.answer ? 'correct' : 'wrong') : '');
            marks.highlight.push(m.to);
            marks.labels = Object.assign(marks.labels || {}, { [m.to]: ui('ch.option', { key: opt.key }) });
          });
        }
        if (q.reveal === 'castle' && this.revealed) {
          const r = E.castlingReport(base, 'w', q.side);
          const fail = r.conditions.find((c) => !c.ok);
          if (fail && fail.attackers) fail.attackers.forEach((a) => o.attack(a, fail.squares[0]));
          if (fail) o.x(fail.squares[0]);
        }
      }
      if (this.hypo) {
        const king = E.findKing(pos, 'w');
        marks.check = king;
        E.attackers(pos, king, 'b').forEach((a) => o.attack(a, king));
        o.tag(king, ui('tag.check'), 'check', pos.board);
      }
      marks.overlay = o.svg();
      App.board.setMarks(marks);
      renderStatus({ turn: q.mode === 'drill' ? 'w' : pos.turn, drill: q.mode === 'drill', mode: q.mode === 'drill' ? 'drill' : 'rules', st: this.playing ? st : null });
    }
  }

  function panelNavChallenge(i) {
    return h('nav', { class: 'panel-nav', 'aria-label': ui('ch.title') },
      i > 0 ? h('button', { type: 'button', class: 'btn', onclick: () => goChallenge(i - 1) }, icon('arrowLeft'), ui('ch.prev')) : h('span'),
      i < CHALLENGE.length - 1
        ? h('button', { type: 'button', class: 'btn primary next', onclick: () => goChallenge(i + 1) }, ui('ch.next'), icon('arrowRight'))
        : h('a', { class: 'btn next', href: '#overview' }, ui('lesson.overview'), icon('arrowRight')));
  }

  /* =====================================================================
   * Automatic demonstrations
   *
   * Every step's controller has demonstrate(run), an async script. The run can
   * be paused, resumed, or stopped; any click on the board or a tool hands
   * control back to the presenter. With auto-play on, each step demonstrates
   * itself on arrival and then holds until the presenter presses →.
   * ===================================================================== */
  const CANCEL = new Error('demonstration stopped');
  const Run = {
    active: null,
    factor: waitFactor,
    start(opts) {
      const c = App.ctrl;
      if (!c || !c.demonstrate) return false;
      this.stop();
      const run = { cancelled: false, paused: false, asking: false, waitingBeat: false, armed: false, started: !!(opts && opts.fromClick), skipper: null, waiters: [] };
      this.active = run;
      clearReady();
      document.documentElement.classList.add('demo-running');
      updateDemoButtons();
      if (c.render) c.render();
      const fromClick = !!(opts && opts.fromClick);
      const go = async () => {
        // Arriving at a step changes nothing until the presenter presses →.
        if (!fromClick && clickPace() && !c.deferred) {
          run.armed = true;
          await pause(run, 0, true);
          run.armed = false;
        }
        await c.demonstrate(run);
      };
      go().then(() => this.finish(run, true), (err) => {
        if (err !== CANCEL) console.error(err);
        this.finish(run, false);
      });
      return true;
    },
    finish(run, completed) {
      if (this.active !== run) return;
      this.active = null;
      document.documentElement.classList.remove('demo-running');
      hideAsk();
      updateDemoButtons();
      if (App.ctrl && App.ctrl.render && App.ctrl instanceof DemoCtrl) App.ctrl.render();
      if (completed) markReady();
    },
    stop() {
      const run = this.active;
      if (!run) return;
      run.cancelled = true;
      run.waiters.splice(0).forEach((f) => f());
      this.active = null;
      document.documentElement.classList.remove('demo-running', 'beat-wait');
      if (App.ctrl && App.ctrl.flushDeferred) App.ctrl.flushDeferred();
      hideAsk();
      updateDemoButtons();
    },
    pause() { if (this.active) { this.active.paused = true; updateDemoButtons(); } },
    /** Cut the current wait short, so the next move happens now. */
    skip() { const r = this.active; if (r && r.skipper) r.skipper(); },
    resume() {
      const run = this.active;
      if (!run) return;
      run.paused = false;
      run.asking = false;
      hideAsk();
      run.waiters.splice(0).forEach((f) => f());
      updateDemoButtons();
    },
    toggle() {
      if (!this.active) this.start({ fromClick: true });
      else if (this.active.paused) this.resume();
      else this.pause();
    },
  };

  /**
   * Wait inside a demonstration, holding while paused. Throws if the run was stopped.
   * With step-by-step pacing (the default) the wait lasts until the presenter presses →
   * whenever `beat` is true, or when it is left unset and the wait is long enough to notice.
   * `beat: false` marks setup and closing waits that never need a press. Otherwise the wait
   * is timed by the speed setting, and → cuts it short.
   */
  async function pause(run, ms, beat) {
    if (run.cancelled) throw CANCEL;
    if (clickPace() && (beat === true || (beat === undefined && ms >= 600))) {
      run.waitingBeat = true;
      document.documentElement.classList.add('beat-wait');
      updateDemoButtons();
      await new Promise((r) => { run.skipper = r; run.waiters.push(r); });
      // A stopped run leaves the page alone: the next step's run may already be waiting.
      if (run.cancelled) throw CANCEL;
      run.waitingBeat = false;
      run.started = true;
      document.documentElement.classList.remove('beat-wait');
      updateDemoButtons();
    } else {
      await new Promise((r) => {
        const t = setTimeout(r, ms * waitFactor());
        run.skipper = () => { clearTimeout(t); r(); };
      });
    }
    run.skipper = null;
    while (run.paused && !run.cancelled) await new Promise((r) => run.waiters.push(r));
    if (run.cancelled) throw CANCEL;
  }

  /**
   * The wait after a demonstration's last change. Auto-play needs it so the change can be read
   * before the next step starts; stepping by hand skips it, so the next → always moves on.
   */
  function settle(run, ms) {
    return pause(run, clickPace() ? 0 : ms, false);
  }

  /** Stop and put a question to the class; continues when the presenter presses → or Space. */
  async function askClass(run, key) {
    if (run.cancelled) throw CANCEL;
    run.paused = true;
    run.asking = true;
    Feedback.show(h('div', { class: 'ask-card' },
      h('p', { class: 'ask-label' }, icon('users'), ui('ask.label')),
      h('p', { class: 'ask-q' }, ui(key)),
      h('div', { class: 'ask-row' },
        h('button', { type: 'button', class: 'btn primary', onclick: () => Run.resume() }, ui('demo.continue'), icon('arrowRight')))));
    announce(ui('ask.label') + ': ' + ui(key));
    updateDemoButtons();
    while (run.paused && !run.cancelled) await new Promise((r) => run.waiters.push(r));
    run.started = true;
    if (run.cancelled) throw CANCEL;
  }
  function hideAsk() { if (Feedback.el.querySelector('.ask-card')) Feedback.clear(); }

  /** The presenter (or a learner) touched something: hand control back to them. */
  function userTookOver() {
    if (Run.active) Run.stop();
  }

  /** Space / the Demonstrate button: start, continue after a question or move, or pause. */
  function demoKey() {
    const r = Run.active;
    if (!r) Run.start({ fromClick: true });
    else if (r.asking) Run.resume();
    else if (r.waitingBeat) Run.skip();
    else if (r.paused) Run.resume();
    else Run.pause();
  }

  /** → / a clicker: continue a demonstration if one is playing, otherwise go to the next step. */
  function presenterNext(skipToStep) {
    if (closeStickyCard()) return;
    hidePartCard();
    const r = Run.active;
    if (r && !skipToStep) {
      if (r.asking || r.paused) Run.resume(); else Run.skip();
      return;
    }
    const c = App.ctrl;
    const unplayed = c && c.demonstrate && !(c instanceof DemoCtrl) && !App.ready && !c.success && !c.revealed;
    if (unplayed && !skipToStep && App.view !== 'authoring') { Run.start({ fromClick: true }); return; }
    step(1, skipToStep);
  }

  /** True while the screen is being presented: presenter mode, or a demonstration is ready or playing. */
  function presenting() {
    return document.documentElement.classList.contains('presenter') || !!Run.active;
  }

  /** A step whose demonstration has finished waits for the presenter; the → controls glow softly. */
  function markReady() {
    App.ready = true;
    document.documentElement.classList.add('step-ready');
    updateDemoButtons();
  }
  function clearReady() {
    App.ready = false;
    document.documentElement.classList.remove('step-ready');
  }

  /** Auto-play: each step demonstrates itself on arrival, then holds until the presenter moves on. */
  const Autoplay = {
    afterMount() {
      clearTimeout(this.t);
      if (!App.autoplay) return;
      if (clickPace()) { if (!Run.active && !App.ready) Run.start(); return; }
      const wait = $('#part-card').hidden ? 900 : 3000;
      this.t = setTimeout(() => { if (App.autoplay && !Run.active && !App.ready) Run.start(); }, wait * waitFactor());
    },
  };
  function demoButtons() {
    const go = h('button', { type: 'button', class: 'tool primary keep-label demo-btn', 'data-demo': '', 'aria-keyshortcuts': 'Space', onclick: () => demoKey() });
    const stop = h('button', {
      type: 'button', class: 'tool', 'data-demo-stop': '', hidden: true, 'aria-label': ui('demo.stop'), title: ui('demo.stop'),
      onclick: () => Run.stop(),
    }, icon('stop'), h('span', { class: 'label', 'aria-hidden': 'true' }, ui('demo.stop')));
    return [go, stop];
  }

  function updateDemoButtons() {
    const r = Run.active;
    const state = !r ? (App.ready ? 'done' : 'idle') : r.asking ? 'asking' : r.armed ? 'armed' : r.waitingBeat ? 'beat' : r.paused ? 'paused' : 'running';
    const label = ui({ idle: 'demo.start', armed: 'demo.start', done: 'demo.replay', running: 'demo.pause', paused: 'demo.resume', asking: 'demo.continue', beat: 'demo.nextBeat' }[state]);
    const ic = { idle: 'play', armed: 'play', done: 'restart', running: 'pause', paused: 'play', asking: 'arrowRight', beat: 'arrowRight' }[state];
    document.querySelectorAll('[data-demo]').forEach((b) => {
      b.replaceChildren(icon(ic), h('span', { class: 'label', 'aria-hidden': 'true' }, label));
      b.setAttribute('aria-label', label);
      b.title = label + ' (Space)';
      b.dataset.state = state;
      b.hidden = !(App.ctrl && App.ctrl.demonstrate);   // nothing to demonstrate on this screen
    });
    document.querySelectorAll('[data-demo-stop]').forEach((b) => { b.hidden = !r; });
  }

  /* =====================================================================
   * App shell: navigation, outline, dialogs, keyboard
   * ===================================================================== */
  const App = { board: null, ctrl: null, li: 0, si: 0, view: 'lesson', hideCoords: false, autoplay: true, ready: false, draw: false, lastPart: null, session: new Set(), followed: null };
  const FLAT = LESSONS.flatMap((L, li) => L.steps.map((S, si) => ({ L, S, li, si })));

  function lessonNumber(L) { const i = LESSONS.indexOf(L); return i === 0 ? null : i; }

  /** In the 15-minute talk, → and ← only visit the steps on its route. */
  const inRoute = (L, S) => settings.route !== 'talk' || TALK.has(L.id + '/' + S.id);
  /** The steps of a lesson that are shown and counted: the route's, plus the one on screen. */
  const shownSteps = (L) => L.steps.filter((S, i) => inRoute(L, S) || (LESSONS[App.li] === L && i === App.si));
  function neighbour(d) {
    let k = FLAT.findIndex((x) => x.li === App.li && x.si === App.si) + d;
    while (FLAT[k] && !inRoute(FLAT[k].L, FLAT[k].S)) k += d;
    return FLAT[k] || null;
  }
  const tokenFor = (L, S) => (L.steps[0] === S ? L.id : L.id + '-' + S.id);
  function goTo(token) {
    if (location.hash === '#' + token) route();
    else location.hash = token;
  }
  const goStep = (x) => goTo(tokenFor(x.L, x.S));
  const goChallenge = (i) => goTo('challenge-' + (Math.max(0, Math.min(CHALLENGE.length - 1, i)) + 1));

  function teardown() {
    hidePartCard();   // a new step never opens under the previous step's card
    App.followed = null;
    clearTimeout(keepFollowing.t);
    Run.stop();
    clearReady();
    App.board.clearNotes();
    if (App.ctrl && App.ctrl.unmount) App.ctrl.unmount();
    App.ctrl = null;
    App.board.ctrl = null;
    $('#board-banner').hidden = true;
    setLegend(false);
    if (App.board.orientation !== 'w') App.board.flip('w');
    App.hideCoords = false;
    applySettings();
  }

  function route() {
    const token = decodeURIComponent(location.hash.replace(/^#/, ''));
    closeDrawer();
    if (token === 'authoring') return showAuthoring();
    const ch = token.match(/^challenge(?:-(\d+))?$/);
    if (ch) return showChallenge(ch[1] ? Number(ch[1]) - 1 : 0);
    const [lid, sid] = token.split('-');
    let li = LESSONS.findIndex((L) => L.id === lid);
    if (li < 0) li = 0;
    let si = sid ? LESSONS[li].steps.findIndex((S) => S.id === sid) : 0;
    if (si < 0) si = 0;
    showStep(li, si);
  }

  function setView(view) {
    App.view = view;
    document.body.dataset.view = view;
  }

  /** Order of the parts, with the quiz after all of them. */
  const partIdx = (id) => (id === 'quiz' ? PARTS.length : PARTS.findIndex((p) => p.id === id));

  function showStep(li, si) {
    teardown();
    window.scrollTo(0, 0);
    setView('lesson');
    App.li = li;
    App.si = si;
    const L = LESSONS[li], S = L.steps[si];
    const prevPart = App.lastPart;
    App.lastPart = L.part;
    if (prevPart && partIdx(L.part) > partIdx(prevPart) && presenterOn()) showPartCard(PARTS[partIdx(L.part)]);
    renderHead();
    const C = CONTROLLERS[S.kind] || PlayCtrl;
    const ctrl = new C(S, L);
    App.ctrl = ctrl;
    App.board.ctrl = ctrl;
    ctrl.mount();
    $('#panel-body').replaceChildren(...ctrl.panel().filter(Boolean), panelNav());
    if (ctrl.render && !(ctrl instanceof RotateCtrl)) ctrl.render();
    if (ctrl.renderSheet) ctrl.renderSheet();
    renderOutline();
    updateChrome(ui('lesson.' + L.id) + (L.steps.length > 1 ? ' · ' + ui(S.label) : ''));
    announce(ui('lesson.' + L.id) + (L.steps.length > 1 ? ', ' + ui(S.label) : ''));
    playEnter();
    Autoplay.afterMount();
  }

  /** A soft fade as a new step or question appears. */
  function playEnter() {
    if (reducedMotion()) return;
    const els = ['#lesson-head', '#panel-body', '#pieces', '#statusbar'].map((sel) => $(sel));
    els.forEach((el) => {
      el.classList.remove('step-enter');
      void el.offsetWidth;
      el.classList.add('step-enter');
    });
    // The fade lasts 0.35 s; clearing it afterwards means nothing can stay faded if the browser skips frames.
    clearTimeout(playEnter.t);
    playEnter.t = setTimeout(() => els.forEach((el) => el.classList.remove('step-enter')), 600);
  }

  function showChallenge(i) {
    teardown();
    window.scrollTo(0, 0);
    setView('challenge');
    const k = Math.max(0, Math.min(CHALLENGE.length - 1, i));
    const fromLessons = App.lastPart && App.lastPart !== 'quiz';
    App.lastPart = 'quiz';
    if (fromLessons && k === 0 && presenterOn()) {
      showCard({ kicker: ui('quiz.card.kicker'), title: ui('ch.title'), items: CHALLENGE.map((q, j) => [String(j + 1), ui('ch.q.' + q.id)]) });
    }
    $('#lesson-head').replaceChildren(
      h('p', { class: 'kicker' }, ui('ch.title'), CHALLENGE[k].bonus ? h('span', { class: 'tag required' }, ui('ch.bonus')) : null),
      h('h1', { class: 'lesson-title', id: 'lesson-title' }, ui('ch.question', { n: k + 1, total: CHALLENGE.length })),
      h('nav', { class: 'steps', 'aria-label': ui('ch.title') }, CHALLENGE.map((q, j) =>
        h('button', { type: 'button', class: 'step-pill', 'aria-current': j === k ? 'step' : null, onclick: () => goChallenge(j) }, h('span', { class: 'n' }, String(j + 1)), ui('ch.q.' + q.id)))));
    const ctrl = new ChallengeCtrl(k);
    App.ctrl = ctrl;
    App.board.ctrl = ctrl;
    ctrl.mount();
    renderOutline();
    updateChrome(ui('ch.title') + ' · ' + (k + 1) + '/' + CHALLENGE.length);
    announce(ui('ch.question', { n: k + 1, total: CHALLENGE.length }) + '. ' + ui(CHALLENGE[k].question));
    playEnter();
    Autoplay.afterMount();
  }

  function showAuthoring() {
    teardown();
    setView('authoring');
    const used = {};
    const note = (id, where) => { (used[id] = used[id] || []).push(where); };
    LESSONS.forEach((L) => L.steps.forEach((S) => {
      const where = ui('lesson.' + L.id) + (L.steps.length > 1 ? ' · ' + ui(S.label) : '');
      (S.text || []).forEach((id) => note(id, where));
      if (S.caution) note(S.caution, where);
      (S.frames || []).forEach((f) => { if (f.caption) note(f.caption, where); });
    }));
    CHALLENGE.forEach((q, i) => note(q.explain, ui('ch.title') + ' ' + (i + 1)));
    ['king', 'block', 'capture'].forEach((k) => note('check.ways.' + k, ui('esc.title')));
    const ids = Object.keys(TEXT);
    const table = (list) => h('div', { class: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Key'), h('th', { scope: 'col' }, 'Brief'), h('th', { scope: 'col' }, ui('auth.where')), h('th', { scope: 'col' }, ''))),
      h('tbody', null, list.map((id) => h('tr', null,
        h('td', null, h('code', null, id)),
        h('td', null, TEXT[id].brief, h('br'), h('span', { class: 'ph-length' }, TEXT[id].length || '')),
        h('td', null, [...new Set(used[id] || [])].join('; ')),
        h('td', { class: 'state' + (hasText(id) ? ' ok' : '') }, hasText(id) ? ui('auth.done') : '—'))))));
    const req = ids.filter((id) => !TEXT[id].optional), opt = ids.filter((id) => TEXT[id].optional);
    const missing = req.filter((id) => !hasText(id)).length;
    $('#lesson-head').replaceChildren();
    $('#panel-body').replaceChildren(h('div', { class: 'authoring' },
      h('h1', { class: 'lesson-title', id: 'lesson-title' }, ui('auth.title')),
      h('p', { class: 'prose' }, ui('auth.intro')),
      h('p', null, h('strong', null, missing ? ui('nav.missing', { count: missing }) : ui('auth.all'))),
      h('h2', null, ui('auth.required') + ' (' + req.length + ')'), table(req),
      h('h2', null, ui('auth.optional') + ' (' + opt.length + ')'), table(opt)));
    Feedback.clear();
    renderOutline();
    updateChrome(ui('auth.title'));
  }

  function renderHead() {
    const L = LESSONS[App.li];
    const part = PARTS.find((p) => p.id === L.part);
    const num = lessonNumber(L);
    const shown = shownSteps(L);
    const steps = shown.length > 1 ? h('nav', { class: 'steps', 'aria-label': ui('nav.steps') }, shown.map((S, i) => {
      const done = shownDone(L, S);
      return h('button', { type: 'button', class: 'step-pill' + (done ? ' done' : ''), 'aria-current': S === L.steps[App.si] ? 'step' : null, onclick: () => goTo(tokenFor(L, S)) },
        h('span', { class: 'n', 'aria-hidden': 'true' }, done ? icon('check') : String(i + 1)),
        ui(S.label),
        S.optional ? h('span', { class: 'opt' }, '(' + ui('lesson.tag.optional').toLowerCase() + ')') : null,
        done ? h('span', { class: 'sr-only' }, ', ' + ui('nav.completed')) : null);
    })) : null;
    $('#lesson-head').replaceChildren(...[
      h('p', { class: 'kicker' }, num ? ui('nav.lesson', { n: num }) + ' · ' + ui(part.title) : ui(part.title),
        L.tag ? h('span', { class: 'tag' }, ui(L.tag)) : part.optional ? h('span', { class: 'tag optional' }, ui('lesson.tag.optional')) : null),
      h('h1', { class: 'lesson-title', id: 'lesson-title' }, ui('lesson.' + L.id)),
      steps].filter(Boolean));
  }

  function panelNav() {
    const prev = neighbour(-1), next = neighbour(1);
    const label = (x) => (x.L === LESSONS[App.li] ? ui(x.S.label) : ui('lesson.' + x.L.id));
    return h('nav', { class: 'panel-nav', 'aria-label': ui('nav.lessons') },
      prev ? h('a', { class: 'btn', href: '#' + tokenFor(prev.L, prev.S) }, icon('arrowLeft'), h('span', null, h('span', { class: 'sr-only' }, ui('nav.prev') + ': '), label(prev))) : h('span'),
      next ? h('a', { class: 'btn primary next', href: '#' + tokenFor(next.L, next.S) }, h('span', null, h('span', { class: 'sr-only' }, ui('nav.next') + ': '), label(next)), icon('arrowRight')) : h('span'));
  }

  function renderOutline() {
    const nav = $('#outline');
    const done = LESSONS.filter(lessonDone).length;
    const kids = [h('div', { class: 'outline-progress' },
      h('p', null, ui('nav.progress', { done, total: LESSONS.length })),
      h('div', { class: 'rank-meter', 'aria-hidden': 'true', style: `grid-template-columns: repeat(${LESSONS.length}, 1fr)` }, LESSONS.map((L) => h('span', { class: lessonDone(L) ? 'done' : '' }))),
      missingCount() ? h('a', { class: 'missing-link', href: '#authoring' }, icon('pen'), ui('nav.missing', { count: missingCount() })) : null)];
    PARTS.forEach((part) => {
      kids.push(h('h2', null, ui(part.title), part.optional ? h('span', { class: 'tag optional' }, ui('lesson.tag.optional')) : null));
      kids.push(h('ol', null, LESSONS.filter((L) => L.part === part.id).map((L) => {
        const num = lessonNumber(L);
        const current = App.view === 'lesson' && LESSONS[App.li] === L;
        return h('li', null, h('a', { class: 'outline-link', href: '#' + L.id, 'aria-current': current ? 'page' : null },
          h('span', { class: 'outline-num', 'aria-hidden': 'true' }, num == null ? '★' : String(num)),
          h('span', null, ui('lesson.' + L.id)),
          lessonDone(L) ? h('span', { class: 'outline-done' }, icon('check'), h('span', { class: 'sr-only' }, ui('nav.completed'))) : h('span')));
      })));
    });
    kids.push(h('h2', null, ui('ch.title')));
    kids.push(h('ol', null, h('li', null, h('a', { class: 'outline-link', href: '#challenge', 'aria-current': App.view === 'challenge' ? 'page' : null },
      h('span', { class: 'outline-num', 'aria-hidden': 'true' }, '?'), h('span', null, ui('ch.title')), h('span')))));
    nav.replaceChildren(...kids);
  }

  function updateChrome(where) {
    $('#crumb').textContent = where;
    document.title = where + ' · ' + ui('site.name');
    updateDock(where);
  }

  const missingCount = () => Object.keys(TEXT).filter((id) => !TEXT[id].optional && !hasText(id)).length;

  const presenterOn = () => document.documentElement.classList.contains('presenter');

  function dockButton(ic, label, run, extra) {
    return h('button', Object.assign({ type: 'button', class: 'icon-btn', onclick: run, 'aria-label': label, title: label }, extra || {}), icon(ic));
  }

  function updateDock(where) {
    const dock = $('#presenter-dock');
    dock.hidden = !presenterOn();
    if (!presenterOn()) return;
    let sub = '';
    let main = where || $('#crumb').textContent;
    if (App.view === 'lesson') {
      const L = LESSONS[App.li];
      const n = lessonNumber(L);
      const part = PARTS.find((x) => x.id === L.part);
      const shown = shownSteps(L);
      sub = (n ? ui('dock.lesson', { n, total: LESSONS.length - 1 }) : ui(part.title)) + (shown.length > 1 ? ' · ' + ui('dock.step', { n: shown.indexOf(L.steps[App.si]) + 1, total: shown.length }) : '');
    } else if (App.view === 'challenge' && App.ctrl) {
      sub = ui('ch.title') + ' · ' + ui('ch.question', { n: App.ctrl.i + 1, total: CHALLENGE.length });
      main = ui('ch.q.' + CHALLENGE[App.ctrl.i].id);
    }
    const demo = h('button', { type: 'button', class: 'dock-demo', 'data-demo': '', onclick: () => demoKey() });
    dock.replaceChildren(
      dockButton('arrowLeft', ui('nav.prev'), () => step(-1)),
      h('div', { class: 'where' }, h('span', { class: 'where-sub' }, sub), h('span', { class: 'where-main' }, main)),
      dockButton('arrowRight', ui('nav.next'), () => presenterNext(false), { class: 'icon-btn dock-next' }),
      h('span', { class: 'dock-sep', 'aria-hidden': 'true' }),
      demo,
      // Extras drop out on mid-size screens; their keys (D, X, F, G, C) still work.
      h('span', { class: 'dock-sep dock-extra', 'aria-hidden': 'true' }),
      dockButton('pen', ui('dock.draw'), toggleDraw, { class: 'icon-btn dock-extra', 'aria-pressed': String(App.draw), id: 'dock-draw' }),
      dockButton('eraser', ui('dock.clear'), () => App.board.clearNotes(), { class: 'icon-btn dock-extra' }),
      dockButton('maximize', ui('dock.focus'), toggleFocus, { class: 'icon-btn dock-extra', 'aria-pressed': String(document.documentElement.classList.contains('focus-board')) }),
      h('span', { class: 'dock-sep', 'aria-hidden': 'true' }),
      dockButton('search', ui('nav.goto'), openGoto, { class: 'icon-btn dock-extra' }),
      dockButton('users', ui('nav.challenge'), () => goTo('challenge'), { class: 'icon-btn dock-extra' }),
      dockButton('x', ui('dock.exit'), togglePresenter));
    updateDemoButtons();
  }

  /** Presenter "next": steps through a demonstration first, then moves on. */
  function step(d, skipFrames) {
    hidePartCard();
    const c = App.ctrl;
    const r = Run.active;
    const untouched = !!(r && !r.started) && !App.ready;
    if (d < 0 && !skipFrames && c && !(c instanceof DemoCtrl) && !untouched && App.view !== 'authoring') {
      Run.stop();
      route();
      return;
    }
    if (App.view === 'challenge') {
      Run.stop();
      if (d > 0 && c.i === CHALLENGE.length - 1) { showEndCard(); return; }
      if (d < 0 && c.i === 0) { goStep([...FLAT].reverse().find((x) => inRoute(x.L, x.S))); return; }
      goChallenge(c.i + d);
      return;
    }
    if (App.view !== 'lesson') return;
    if (!skipFrames && c) {
      if (d > 0 && c.advance && c.advance()) return;
      if (d < 0 && c.retreat && c.retreat()) return;
    }
    Run.stop();
    const n = neighbour(d);
    if (n) goStep(n);
    else if (d > 0) goChallenge(0);
  }

  /** Presenter mode follows the setting, except on phone-sized screens, which keep the touch controls. */
  function applyPresenter(force) {
    const on = !!settings.presenter && !mqPhone.matches;
    if (!force && on === presenterOn()) return;
    document.documentElement.classList.toggle('presenter', on);
    $('#presenter-btn').setAttribute('aria-pressed', String(on));
    if (!on) document.documentElement.classList.remove('focus-board', 'pointer-idle');
    if (!App.ctrl) return;
    if (App.view === 'lesson') renderHead();
    placeFeedback();
    updateDock($('#crumb').textContent);
  }

  function togglePresenter() {
    settings.presenter = !presenterOn();
    store.set('settings', settings);
    applyPresenter(true);
    const on = presenterOn();
    if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else if (!on && document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }

  function toggleFocus() {
    document.documentElement.classList.toggle('focus-board');
    placeFeedback();
    updateDock($('#crumb').textContent);
  }

  function toggleDraw() {
    App.draw = !App.draw;
    document.documentElement.classList.toggle('drawing', App.draw);
    const b = $('#dock-draw');
    if (b) b.setAttribute('aria-pressed', String(App.draw));
  }

  /* ----- Title cards (presenter mode): parts, the quiz, the end ----- */
  function showCard(opts) {
    const card = $('#part-card');
    card.replaceChildren(h('div', { class: 'part-inner' },
      opts.kicker ? h('p', { class: 'kicker' }, opts.kicker) : null,
      h('h2', null, opts.title),
      opts.sub ? h('p', { class: 'part-sub' }, opts.sub) : null,
      opts.items ? h('ol', { class: 'part-lessons' }, opts.items.map(([num, text]) =>
        h('li', null, h('span', { class: 'outline-num', 'aria-hidden': 'true' }, num), text))) : null));
    // Stepping by hand, a card stays until the next press, and that press only closes it.
    const sticky = opts.sticky || clickPace();
    card.dataset.sticky = sticky ? '1' : '';
    card.hidden = false;
    announce([opts.kicker, opts.title, opts.sub].filter(Boolean).join('. '));
    clearTimeout(showCard.t);
    if (!sticky) showCard.t = setTimeout(hidePartCard, 2800 * waitFactor());
  }
  function showPartCard(part) {
    if (!part) return;
    const n = PARTS.indexOf(part) + 1;
    showCard({
      kicker: ui('part.card', { n, total: PARTS.length }),
      title: ui(part.title),
      items: LESSONS.filter((L) => L.part === part.id).map((L) => [lessonNumber(L) == null ? '★' : String(lessonNumber(L)), ui('lesson.' + L.id)]),
    });
  }
  function showEndCard() {
    showCard({ kicker: ui('end.kicker'), title: ui('end.title'), sub: ui('end.sub'), sticky: true });
  }
  function hidePartCard() {
    clearTimeout(showCard.t);
    $('#part-card').hidden = true;
  }
  /** A card that waits for a press (the closing card, or any card when stepping by hand): the press only closes it. */
  function closeStickyCard() {
    const card = $('#part-card');
    if (card.hidden || !card.dataset.sticky) return false;
    hidePartCard();
    return true;
  }

  /* ----- Keeping live panels in view while presenting ----- */
  /** Scroll just enough that `el` sits below the pinned caption, without hiding the caption. */
  function keepInView(el, center) {
    if (!el || !el.isConnected || !presenterOn() || mqNarrow.matches) return;
    const r = el.getBoundingClientRect();
    const empty = !r.height;
    // Once the page scrolls, the caption sits pinned under the top bar, so measure from there.
    const captionBottom = $('.topbar').getBoundingClientRect().bottom + $('#feedback').offsetHeight;
    const top = captionBottom + 12;
    const bottom = window.innerHeight - 16;
    let dy = 0;
    if (!empty && center && r.height <= bottom - top) dy = Math.max(-window.scrollY, (r.top + r.bottom - top - bottom) / 2);
    else if (!empty) {
      if (r.bottom > bottom) dy = r.bottom - bottom;
      if (r.top - dy < top) dy = r.top - top;
    }
    // Nor is the lesson heading left cut in half under the top bar.
    const barBottom = $('.topbar').getBoundingClientRect().bottom;
    const head = $('#lesson-head').getBoundingClientRect();
    if (head.height && head.top - dy < barBottom - 1 && head.bottom - dy > barBottom + 1) {
      const whole = head.top - barBottom;
      dy = empty || r.bottom - whole <= bottom ? whole : head.bottom - barBottom;
    }
    // No block of the panel is left cut in half under the caption: it is shown whole if `el` still
    // fits, and otherwise scrolled out of view (unless it holds `el`).
    for (const b of $('#panel-body').children) {
      const br = b.getBoundingClientRect();
      if (!br.height || br.top - dy >= captionBottom || br.bottom - dy <= captionBottom) continue;
      const whole = br.top - top, away = br.bottom - captionBottom + 3;
      if (empty || r.bottom - whole <= bottom) dy = whole;
      else if (r.top - away >= top) dy = away;
      break;
    }
    if (Math.abs(dy) > 2) window.scrollBy({ top: dy, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }
  /** Follow a panel that changed, once the presenter has started the step (never on arrival). */
  function followWidget(el) {
    const r = Run.active;
    if (!presenterOn() || !r || !r.started) return;
    App.followed = el;
    keepFollowing();
  }
  /** Re-check the followed panel once the current change has settled (the caption may have changed size). */
  function keepFollowing() {
    clearTimeout(keepFollowing.t);
    if (App.followed) keepFollowing.t = setTimeout(() => keepInView(App.followed), 40);
  }
  /** Bring a highlighted item into view: below the pinned caption while presenting, the nearest way otherwise. */
  function bringIntoView(el) {
    if (presenterOn() && !mqNarrow.matches) { App.followed = el; keepInView(el); }
    else el.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  /* ----- Drawer (narrow screens) ----- */
  function openDrawer() {
    $('#outline').classList.add('open');
    $('#scrim').hidden = false;
    $('#menu-btn').setAttribute('aria-expanded', 'true');
    const cur = $('#outline [aria-current="page"]') || $('#outline a');
    if (cur) cur.focus();
  }
  function closeDrawer() {
    const nav = $('#outline');
    if (!nav.classList.contains('open')) return;
    nav.classList.remove('open');
    $('#scrim').hidden = true;
    $('#menu-btn').setAttribute('aria-expanded', 'false');
  }

  /* ----- Go to (command palette) ----- */
  function gotoItems() {
    const items = [];
    LESSONS.forEach((L) => L.steps.forEach((S, i) => {
      const title = ui('lesson.' + L.id) + (L.steps.length > 1 ? ' · ' + ui(S.label) : '');
      const n = lessonNumber(L);
      items.push({ title, sub: (n ? ui('nav.lesson', { n }) : ui('lesson.overview')) + (i ? '' : ''), token: tokenFor(L, S) });
    }));
    CHALLENGE.forEach((q, i) => items.push({ title: ui('ch.title') + ' ' + (i + 1) + ': ' + ui('ch.q.' + q.id), sub: ui(q.question), token: 'challenge-' + (i + 1) }));
    items.push({ title: ui('auth.title'), sub: 'content.js', token: 'authoring' });
    return items;
  }
  function openGoto() {
    const dlg = $('#goto-dialog');
    const input = $('#goto-input');
    const list = $('#goto-list');
    const all = gotoItems();
    let shown = all, active = 0;
    const draw = () => {
      list.replaceChildren(...(shown.length ? shown.map((it, i) => h('li', { role: 'presentation' },
        h('button', { type: 'button', role: 'option', id: 'goto-opt-' + i, 'aria-selected': String(i === active), onclick: () => pick(it) },
          h('span', null, it.title), h('span', { class: 'sub' }, it.sub)))) : [h('li', { class: 'notice' }, ui('nav.goto.empty'))]));
      input.setAttribute('aria-activedescendant', shown.length ? 'goto-opt-' + active : '');
      const el = $('#goto-opt-' + active);
      if (el) el.scrollIntoView({ block: 'nearest' });
    };
    const pick = (it) => { dlg.close(); goTo(it.token); };
    input.value = '';
    input.placeholder = ui('nav.goto.placeholder');
    input.oninput = () => {
      const q = input.value.trim().toLowerCase();
      shown = q ? all.filter((it) => (it.title + ' ' + it.sub).toLowerCase().includes(q)) : all;
      active = 0;
      draw();
    };
    input.onkeydown = (e) => {
      if (e.key === 'ArrowDown') { active = Math.min(shown.length - 1, active + 1); draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); draw(); e.preventDefault(); }
      else if (e.key === 'Enter' && shown[active]) { e.preventDefault(); pick(shown[active]); }
    };
    draw();
    dlg.showModal();
    input.focus();
  }

  /* ----- Settings ----- */
  function buildSettings() {
    const body = $('#settings-body');
    const seg = (name, legend, options) => h('fieldset', { class: 'set-group' }, h('legend', null, legend),
      h('div', { class: 'seg' }, options.map(([value, label]) => h('label', null,
        h('input', { type: 'radio', name, id: 'set-' + name + '-' + value, value, checked: settings[name] === value ? true : null, onchange: () => { settings[name] = value; saveSettings(); if (name === 'route') rerender(); } }),
        h('span', null, label)))));
    const check = (name, label) => h('label', { class: 'check-row', for: 'set-' + name },
      h('input', { type: 'checkbox', id: 'set-' + name, checked: settings[name] ? true : null, onchange: (e) => { settings[name] = e.target.checked; saveSettings(); } }),
      h('span', null, label));
    const resetMsg = h('p', { class: 'notice', role: 'status' });
    body.replaceChildren(
      seg('theme', ui('set.theme'), [['system', ui('set.theme.system')], ['light', ui('set.theme.light')], ['dark', ui('set.theme.dark')]]),
      seg('motion', ui('set.motion'), [['system', ui('set.theme.system')], ['reduce', ui('set.motion.on')], ['full', ui('set.motion.off')]]),
      seg('speed', ui('set.speed'), [['slow', ui('set.speed.slow')], ['normal', ui('set.speed.normal')], ['fast', ui('set.speed.fast')]]),
      seg('route', ui('set.route'), [['talk', ui('set.route.talk')], ['full', ui('set.route.full')]]),
      seg('advance', ui('set.pace'), [['click', ui('set.pace.click')], ['auto', ui('set.pace.auto')]]),
      check('large', ui('set.large')),
      check('letters', ui('set.letters')),
      check('coords', ui('set.coords')),
      h('div', null, h('button', { type: 'button', class: 'btn', onclick: () => {
        Object.keys(progress).forEach((k) => delete progress[k]);
        store.set('progress', progress);
        renderOutline();
        if (App.view === 'lesson') renderHead();
        resetMsg.textContent = ui('set.reset.done');
      } }, icon('reset'), ui('set.reset')), resetMsg));
  }
  function saveSettings() { store.set('settings', settings); applySettings(); }
  function rerender() { route(); }

  function buildKeys() {
    const rows = [
      [['Space'], 'keys.demo'], [['←', '→'], 'keys.nav'], [['Shift', '→'], 'keys.skip'],
      [['G'], 'keys.goto'], [['1', '–', String(PARTS.length)], 'keys.parts'], [['P'], 'keys.presenter'], [['F'], 'keys.focus'],
      [['D'], 'keys.draw'], [['X'], 'keys.clear'], [['C'], 'keys.challenge'], [['A', '–', 'D'], 'keys.vote'], [['R'], 'keys.reveal'],
      [['R'], 'keys.reset'], [['U'], 'keys.undo'], [['A'], 'keys.danger'], [[',', '.'], 'keys.step'],
      [['↑', '↓', '←', '→'], 'keys.board'], [['Enter'], 'keys.select'], [['Esc'], 'keys.cancel'], [['?'], 'keys.help'],
    ];
    $('#keys-body').replaceChildren(h('dl', { class: 'keys' }, rows.flatMap(([keys, label]) => [
      h('dt', null, keys.map((k) => (k === '–' ? h('span', null, '–') : h('kbd', null, k)))), h('dd', null, ui(label))])));
  }

  /* ----- Keyboard ----- */
  function onGlobalKey(e) {
    if (e.defaultPrevented) return;
    const t = e.target;
    if (t.closest && t.closest('input, textarea, select, [contenteditable="true"]')) return;
    if ((e.key === 'ArrowRight' || e.key === 'PageDown') && Promo.skip()) { e.preventDefault(); return; }
    if (document.querySelector('dialog[open]')) return;
    if (closeStickyCard()) { e.preventDefault(); return; }
    if (!$('#part-card').hidden) hidePartCard();
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openGoto(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const onControl = t.closest && t.closest('button, a, [role="gridcell"]');
    const c = App.ctrl;
    const run = Run.active;
    const key = e.key;
    if (App.view === 'challenge' && /^[a-dA-D]$/.test(key) && c && c.q.options.some((o) => o.key === key.toUpperCase())) {
      c.choose(key.toUpperCase());
      e.preventDefault();
      return;
    }
    if (/^[1-9]$/.test(key)) {
      const part = PARTS[Number(key) - 1];
      const L = part && LESSONS.find((x) => x.part === part.id);
      if (L) { userTookOver(); goTo(L.id); }
      e.preventDefault();
      return;
    }
    switch (key) {
      case 'ArrowRight': case 'PageDown':
        presenterNext(e.shiftKey);
        break;
      case 'ArrowLeft': case 'PageUp': step(-1, e.shiftKey); break;
      case ' ':
        if (onControl && !presenting()) return;
        // While presenting, Space is "next", as in slide software.
        if (presenterOn()) presenterNext(e.shiftKey); else demoKey();
        break;
      case 'Enter':
        if (run && (run.asking || run.waitingBeat) && !onControl) { presenterNext(false); break; }
        return;
      case 'd': case 'D': toggleDraw(); break;
      case 'x': case 'X': App.board.clearNotes(); break;
      case 'f': case 'F': toggleFocus(); break;
      case 'g': case 'G': case '/': openGoto(); break;
      case 'p': case 'P': togglePresenter(); break;
      case 'c': case 'C': userTookOver(); goTo('challenge'); break;
      case 'r': case 'R':
        userTookOver();
        if (App.view === 'challenge') c.reveal();
        else if (c && c.btn && c.btn.reset) c.btn.reset.click();
        else if (c && c.restart) c.restart();
        break;
      case 'u': case 'U': userTookOver(); if (c && c.undo) c.undo(); break;
      case 'h': case 'H': userTookOver(); if (c && c.hint) c.hint(); break;
      case 'a': case 'A': if (c && c.toggleDanger) c.toggleDanger(); break;
      case ',': if (c && c.retreat) c.retreat(); break;
      case '.': if (c && c.advance) c.advance(); break;
      case '?': $('#keys-dialog').showModal(); break;
      case 'Escape':
        // While presenting, Esc (pressed out of slideshow habit, or to leave full screen) never stops a step.
        if (run && !presenterOn()) { Run.stop(); break; }
        closeDrawer();
        return;
      default: return;
    }
    e.preventDefault();
  }

  /* ----- Feedback placement: under the board on phones, atop the panel on wide screens ----- */
  const mqNarrow = window.matchMedia('(max-width: 899px)');
  const mqPhone = window.matchMedia('(max-width: 640px)');
  function placeFeedback() {
    const fb = $('#feedback');
    if (mqNarrow.matches || document.documentElement.classList.contains('focus-board')) $('#feedback-mobile-slot').append(fb);
    else $('#lesson-panel').prepend(fb);
  }

  /* ----- Boot ----- */
  function init() {
    document.querySelectorAll('[data-ui]').forEach((el) => { el.textContent = ui(el.dataset.ui); });
    App.board = new Board();
    applyPresenter(true);
    applySettings();
    placeFeedback();
    mqNarrow.addEventListener && mqNarrow.addEventListener('change', placeFeedback);
    mqPhone.addEventListener && mqPhone.addEventListener('change', () => applyPresenter());
    buildSettings();
    buildKeys();
    $('#skip-link').addEventListener('click', (e) => { e.preventDefault(); $('#lesson-panel').focus(); });
    $('#menu-btn').addEventListener('click', () => ($('#outline').classList.contains('open') ? closeDrawer() : openDrawer()));
    $('#scrim').addEventListener('click', closeDrawer);
    $('#outline').addEventListener('click', (e) => { if (e.target.closest('a')) closeDrawer(); });
    $('#goto-btn').addEventListener('click', openGoto);
    $('#challenge-btn').addEventListener('click', () => goTo('challenge'));
    $('#presenter-btn').addEventListener('click', togglePresenter);
    $('#settings-btn').addEventListener('click', () => $('#settings-dialog').showModal());
    $('#keys-btn').addEventListener('click', () => $('#keys-dialog').showModal());
    $('#part-card').addEventListener('click', hidePartCard);
    document.addEventListener('pointerdown', () => { focusingClick = !document.hasFocus(); }, true);
    let idle;
    document.addEventListener('mousemove', () => {
      document.documentElement.classList.remove('pointer-idle');
      clearTimeout(idle);
      idle = setTimeout(() => { if (presenterOn()) document.documentElement.classList.add('pointer-idle'); }, 2500);
    }, { passive: true });
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('button, a');
      if (b && presenterOn() && !b.closest('dialog')) setTimeout(() => b.blur(), 0);
    }, true);
    window.focus();
    document.querySelectorAll('dialog [data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
    // A click outside a dialog closes it, except that during a demonstration's promotion it takes the highlighted piece (as → does).
    document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d && !(d.id === 'promo-dialog' && Promo.skip())) d.close(); }));
    // Outside presenter mode (phones, narrow windows) one Next button drives everything, exactly like →.
    document.body.append(h('nav', { class: 'deckbar', id: 'deckbar', 'aria-label': ui('nav.lessons') },
      h('button', { type: 'button', class: 'btn', onclick: () => step(-1), 'aria-label': ui('nav.prev'), title: ui('nav.prev') }, icon('arrowLeft')),
      h('button', { type: 'button', class: 'btn primary next', onclick: () => presenterNext(false) }, ui('nav.next'), icon('arrowRight'))));
    document.addEventListener('keydown', onGlobalKey);
    window.addEventListener('hashchange', route);
    route();
  }

  init();
})();
