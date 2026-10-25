/* Square One — curriculum structure.
 *
 * Positions, demonstrations, goals, automatic demonstrations and challenge
 * questions. Text lives in content.js; entries here refer to it by key. Every
 * position and script is checked by tests/validate-lessons.js.
 *
 * Step kinds:
 *   overview, equipment  front-door views
 *   demo                 replayable frames ({ move } or { fen } plus caption)
 *   play                 interactive board; optional goal
 *   rotate, find, spot   board-orientation and setup activities
 *   classify             checkmate / stalemate / neither sorting
 *
 * Board modes:
 *   drill  only the learner's side moves; Black stands still (movement patterns)
 *   rules  full legality, turns alternate
 *   free   (demos only) each move is made by whichever side owns the piece
 *   look   nothing moves; selecting a piece names it
 *
 * Demo frame options:
 *   move / fen     what changes on this frame
 *   caption        content.js key shown under the frame
 *   ask            UI key: during "Demonstrate" the show pauses on this question
 *                  before the frame appears, so the presenter can ask the class
 *   why            a move ("d2f3") that is refused, with the reason drawn on the board
 *   danger         shade the squares the other side attacks
 *   highlight, arrows, rays, movesFrom, blocked, show, trapped, widget
 *
 * `auto` (play steps): the script "Demonstrate" runs. Actions:
 *   { select } { move } { attempt } (a refused move, to show why)
 *   { ask } { danger } { undo } { nextPuzzle } { wait }
 * Steps with a goal but no script are solved automatically.
 */
(function (root) {
  'use strict';

  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  const PARTS = [
    { id: 'before', title: 'part.before' },
    { id: 'moving', title: 'part.moving' },
    { id: 'safety', title: 'part.safety' },
    { id: 'special', title: 'part.special', optional: true },
    { id: 'play', title: 'part.play' },
  ];

  /* The procedure shown on the "Start here" view. `tag` is how the step behaves. */
  const PROCEDURE = [
    { title: 'proc.step.equipment', text: 'proc.equipment', tag: 'order', go: 'equipment' },
    { title: 'proc.step.setup', text: 'proc.setup', tag: 'order', go: 'setup' },
    { title: 'proc.step.first', text: 'proc.first', tag: 'order', go: 'turns', board: ['e2e4'] },
    {
      title: 'proc.step.turns', text: 'proc.turns', tag: 'repeat', go: 'rook', board: ['e7e5', 'g1f3', 'b8c6'],
      during: [
        { title: 'proc.step.check', text: 'proc.check', tag: 'if', tag2: 'required', go: 'check' },
        { title: 'proc.step.promote', text: 'proc.promote', tag: 'if', tag2: 'required', go: 'promotion' },
        { title: 'proc.step.special', text: 'proc.special', tag: 'optional', go: 'castling' },
      ],
    },
    { title: 'proc.step.end', text: 'proc.end', tag: 'order', go: 'checkmate' },
  ];

  const LESSONS = [
    /* ---------------- Before you play ---------------- */
    {
      id: 'overview', part: 'before',
      steps: [{ id: 'map', label: 'step.overview', kind: 'info', fen: START, mode: 'look', text: ['overview.intro'] }],
    },
    {
      id: 'equipment', part: 'before',
      steps: [{ id: 'kit', label: 'step.kit', kind: 'equipment', fen: START, mode: 'look', text: ['equipment.body'] }],
    },
    {
      id: 'setup', part: 'before',
      steps: [
        { id: 'orient', label: 'step.orient', kind: 'rotate', text: ['board.orientation'], caution: 'board.caution', prompt: 'prompt.rotate' },
        {
          id: 'squares', label: 'step.squares', kind: 'find', mode: 'look', fen: '8/8/8/8/8/8/8/8 w - - 0 1',
          text: ['board.squares'], targets: ['e4', 'a1', 'h8', 'c6', 'f3'],
        },
        {
          id: 'watch', label: 'step.watch', kind: 'demo', mode: 'free', fen: '8/8/8/8/8/8/8/8 w - - 0 1',
          text: ['setup.body'], caution: 'setup.caution',
          frames: [
            { caption: 'setup.demo.0', label: 'frame.empty', highlight: ['h1', 'a8'] },
            { fen: 'r6r/8/8/8/8/8/8/R6R w - - 0 1', caption: 'setup.demo.1', label: 'frame.rooks', highlight: ['a1', 'h1', 'a8', 'h8'] },
            { fen: 'rn4nr/8/8/8/8/8/8/RN4NR w - - 0 1', caption: 'setup.demo.2', label: 'frame.knights', highlight: ['b1', 'g1', 'b8', 'g8'] },
            { fen: 'rnb2bnr/8/8/8/8/8/8/RNB2BNR w - - 0 1', caption: 'setup.demo.3', label: 'frame.bishops', highlight: ['c1', 'f1', 'c8', 'f8'] },
            { fen: 'rnbq1bnr/8/8/8/8/8/8/RNBQ1BNR w - - 0 1', caption: 'setup.demo.4', label: 'frame.queens', highlight: ['d1', 'd8'] },
            { fen: 'rnbqkbnr/8/8/8/8/8/8/RNBQKBNR w - - 0 1', caption: 'setup.demo.5', label: 'frame.kings', highlight: ['e1', 'e8'] },
            { fen: START, caption: 'setup.demo.6', label: 'frame.pawns', highlight: ['a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2', 'a7', 'b7', 'c7', 'd7', 'e7', 'f7', 'g7', 'h7'] },
          ],
        },
        {
          id: 'fix', label: 'step.fix', kind: 'spot', prompt: 'prompt.fix', caution: 'setup.caution',
          fen: 'rbnqkbnr/pppppppp/8/8/8/2P5/PP1PPPPP/RNBKQBNR w - - 0 1',
          answer: START,
          mistakes: [
            { squares: ['d1', 'e1'], what: 'goal.fix.kq' },
            { squares: ['b8', 'c8'], what: 'goal.fix.bn' },
            { squares: ['c3', 'c2'], what: 'goal.fix.pawn' },
          ],
        },
      ],
    },

    /* ---------------- Moving and capturing ---------------- */
    {
      id: 'rook', part: 'moving', piece: 'r',
      steps: [
        {
          id: 'watch', label: 'step.watch', kind: 'demo', mode: 'drill', fen: '8/8/P7/4n3/8/8/8/R7 w - - 0 1',
          text: ['moving.body', 'rook.body'],
          frames: [
            { label: 'frame.rook.lines', caption: 'rook.demo.1', rays: 'a1' },
            { move: 'a1a5', label: 'frame.rook.move', caption: 'rook.demo.2', rays: 'a5' },
            { move: 'a5e5', label: 'frame.capture', caption: 'rook.demo.3', ask: 'ask.rookCapture' },
          ],
        },
        {
          id: 'explore', label: 'step.explore', kind: 'play', mode: 'drill', movable: 'r', rays: true, fen: '8/8/3P4/8/3R2p1/8/8/8 w - - 0 1', text: ['rook.body'], prompt: 'prompt.explore',
          auto: [{ select: 'd4' }, { attempt: 'd4d8' }, { move: 'd4g4' }, { move: 'g4g8' }, { select: 'g8' }],
        },
        { id: 'try', label: 'step.try', kind: 'play', mode: 'drill', movable: 'r', rays: true, fen: '8/1n2P1p1/8/8/8/8/1R4b1/8 w - - 0 1', text: ['rook.body'], goal: { type: 'capture', par: 4 } },
      ],
    },
    {
      id: 'bishop', part: 'moving', piece: 'b',
      steps: [
        {
          id: 'explore', label: 'step.explore', kind: 'play', mode: 'drill', movable: 'b', rays: true, fen: '8/8/1n2pP2/8/3B4/8/8/8 w - - 0 1', text: ['bishop.body'], prompt: 'prompt.explore',
          auto: [{ select: 'd4' }, { attempt: 'd4d6' }, { move: 'd4b6' }, { ask: 'ask.bishop' }, { attempt: 'b6e6' }, { say: 'note.bishop' }, { select: 'b6' }],
        },
        { id: 'try', label: 'step.try', kind: 'play', mode: 'drill', movable: 'b', rays: true, fen: '8/8/7p/8/5n2/p3P3/8/2B5 w - - 0 1', text: ['bishop.body'], goal: { type: 'capture', par: 4 } },
      ],
    },
    {
      id: 'queen', part: 'moving', piece: 'q',
      steps: [
        {
          id: 'explore', label: 'step.explore', kind: 'play', mode: 'drill', movable: 'q', rays: true, fen: '8/8/1n3P2/8/3Q4/8/5b2/8 w - - 0 1', text: ['queen.body'], prompt: 'prompt.explore',
          auto: [{ select: 'd4' }, { attempt: 'd4g7' }, { move: 'd4f2' }, { move: 'f2b6' }, { select: 'b6' }],
        },
        { id: 'try', label: 'step.try', kind: 'play', mode: 'drill', movable: 'q', rays: true, fen: '8/3n3p/8/3P4/p7/8/8/3Q4 w - - 0 1', text: ['queen.body'], goal: { type: 'capture', par: 3 } },
      ],
    },
    {
      id: 'king', part: 'moving', piece: 'k',
      steps: [
        {
          id: 'explore', label: 'step.explore', kind: 'play', mode: 'drill', movable: 'k', rays: true, fen: '8/8/8/8/4K3/8/8/8 w - - 0 1', text: ['king.body'], prompt: 'prompt.explore',
          auto: [{ select: 'e4' }, { attempt: 'e4e6' }, { move: 'e4e5' }, { move: 'e5d6' }, { select: 'd6' }],
        },
        {
          id: 'try', label: 'step.try', kind: 'play', mode: 'drill', movable: 'k', rays: true, danger: true, fen: '8/8/8/8/2p1p3/8/3K4/8 w - - 0 1', text: ['king.body'], goal: { type: 'capture', par: 4 },
          auto: [{ danger: true }, { select: 'd2' }, { attempt: 'd2d3' }, { move: 'd2e3' }, { move: 'e3e4' }, { move: 'e4d4' }, { move: 'd4c4' }],
        },
      ],
    },
    {
      id: 'knight', part: 'moving', piece: 'n',
      steps: [
        {
          id: 'explore', label: 'step.explore', kind: 'play', mode: 'drill', movable: 'n', rays: true, fen: '8/8/8/2PPPp2/2PNP3/1PPPP3/8/8 w - - 0 1', text: ['knight.body'], prompt: 'prompt.explore',
          auto: [{ ask: 'ask.knight' }, { select: 'd4', hold: 2200 }, { attempt: 'd4b3' }, { move: 'd4f5' }, { move: 'f5d6' }, { select: 'd6' }],
        },
        { id: 'try', label: 'step.try', kind: 'play', mode: 'drill', movable: 'n', rays: true, fen: '8/8/4p3/8/8/2p5/8/1N6 w - - 0 1', text: ['knight.body'], goal: { type: 'capture', par: 4 } },
      ],
    },
    {
      id: 'pawn', part: 'moving', piece: 'p',
      steps: [
        {
          id: 'watch', label: 'step.watch', kind: 'demo', mode: 'free', fen: '8/3p4/8/8/8/2p5/2P1P3/8 w - - 0 1',
          text: ['pawn.body'], caution: 'pawn.caution',
          frames: [
            { label: 'frame.pawn.start', caption: 'pawn.demo.1', movesFrom: 'e2' },
            { move: 'e2e4', label: 'frame.pawn.two', caption: 'pawn.demo.2' },
            { move: 'd7d5', label: 'frame.blackReplies', caption: null },
            { move: 'e4d5', label: 'frame.capture', caption: 'pawn.demo.3', ask: 'ask.pawnCapture' },
            { label: 'frame.blocked', caption: 'pawn.demo.4', blocked: 'c2' },
          ],
        },
        {
          id: 'try', label: 'step.try', kind: 'play', mode: 'drill', movable: 'p', rays: true,
          fen: '8/8/8/2n5/4pb2/8/1P2P3/8 w - - 0 1', text: ['pawn.body'], caution: 'pawn.caution',
          goal: { type: 'capture', targets: ['c5', 'f4'], par: 4, prompt: 'prompt.captureSome' },
          auto: [{ select: 'b2' }, { attempt: 'b2c3' }, { move: 'b2b4' }, { move: 'b4c5' }, { select: 'e2' }, { attempt: 'e2e4' }, { move: 'e2e3' }, { move: 'e3f4' }],
        },
      ],
    },

    {
      id: 'turns', part: 'moving',
      steps: [{
        id: 'try', label: 'step.try', kind: 'play', mode: 'rules', sides: 'both', fen: START,
        text: ['turns.body', 'pieces.together'],
        goal: { type: 'plies', count: 4 },
        auto: [{ attempt: 'e7e5' }, { move: 'e2e4' }, { attempt: 'd2d4' }, { move: 'e7e5' }, { move: 'g1f3' }, { move: 'b8c6' }],
      }],
    },

    /* ---------------- Keep your king safe ---------------- */
    {
      id: 'goal', part: 'safety',
      steps: [{
        id: 'watch', label: 'step.watch', kind: 'demo', mode: 'rules',
        fen: '6k1/Q7/5K2/8/8/8/8/8 w - - 0 1',
        text: ['goal.body', 'goal.resign'],
        frames: [
          { label: 'frame.whiteToMove', caption: 'goal.demo.1', highlight: ['g8', 'a7'] },
          { move: 'a7g7', label: 'frame.checkmate', caption: 'goal.demo.2', trapped: true, ask: 'ask.goal' },
        ],
      }],
    },
    {
      id: 'check', part: 'safety',
      steps: [
        {
          id: 'watch', label: 'step.watch', kind: 'demo', mode: 'rules', fen: 'r6k/8/8/1B6/8/8/8/4K1N1 b - - 0 1',
          text: ['check.body'], caution: 'check.caution', widget: 'escapes',
          frames: [
            { label: 'frame.blackToMove', caption: 'check.demo.1' },
            { move: 'a8e8', label: 'frame.check', caption: 'check.demo.2' },
            { label: 'frame.way.king', show: 'king', ask: 'ask.checkWays' },
            { label: 'frame.way.block', show: 'block' },
            { label: 'frame.way.capture', show: 'capture' },
          ],
        },
        {
          id: 'three', label: 'step.three', kind: 'play', mode: 'rules', sides: 'w', dangerTool: true,
          fen: '4r2k/8/8/1B6/8/8/8/4K1N1 w - - 0 1', widget: 'escapes', caution: 'check.caution',
          goal: { type: 'escape-all' },
          auto: [{ attempt: 'b5c4' }, { move: 'e1f1' }, { move: 'g1e2' }, { move: 'b5e8' }],
        },
        {
          id: 'safe', label: 'step.safe', kind: 'play', mode: 'rules', sides: 'w', dangerTool: true,
          fen: '7k/8/8/1b6/8/1n6/8/r3K3 w - - 0 1', widget: 'escapes', text: ['check.ways.king'],
          goal: { type: 'any', done: 'goal.safe.done', prompt: 'prompt.safeSquare' },
          auto: [{ select: 'e1' }, { attempt: 'e1f1' }, { danger: true }, { attempt: 'e1d2' }, { move: 'e1f2' }],
        },
      ],
    },
    {
      id: 'checkmate', part: 'safety',
      steps: [
        {
          id: 'watch', label: 'step.watch', kind: 'demo', mode: 'rules', fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
          text: ['mate.body'],
          frames: [
            { label: 'frame.whiteToMove', caption: 'mate.demo.1', highlight: ['f7', 'g7', 'h7'] },
            { move: 'd1d8', label: 'frame.checkmate', caption: 'mate.demo.2', widget: 'escapes', trapped: true, ask: 'ask.mateInOne' },
          ],
        },
      ],
    },
    {
      id: 'draws', part: 'safety',
      steps: [
        {
          id: 'watch', label: 'step.watch', kind: 'demo', mode: 'rules', fen: 'k7/8/1K6/2Q5/8/8/8/8 w - - 0 1',
          text: ['stalemate.body'], widget: 'matrix',
          frames: [
            { label: 'frame.whiteToMove', caption: 'stalemate.demo.1' },
            { move: 'c5c7', label: 'frame.stalemate', caption: null, trapped: true, ask: 'ask.stalemate' },
          ],
        },
        {
          id: 'sort', label: 'step.sort', kind: 'classify', text: ['stalemate.body'],
          items: ['k1Q5/8/1K6/8/8/8/8/8 b - - 0 1', '7k/7P/6K1/8/8/8/8/8 b - - 0 1', 'k7/8/2K5/8/8/8/8/1Q6 b - - 0 1', 'k7/8/1K6/8/8/8/8/Q7 b - - 0 1'],
        },
        {
          id: 'other', label: 'step.other', kind: 'demo', mode: 'rules', fen: '8/8/3k4/8/8/4K3/8/8 w - - 0 1',
          text: ['draws.body', 'draws.agreement'],
          frames: [
            { label: 'frame.material', caption: 'draws.material' },
            { fen: '7k/6p1/7p/3Q4/8/8/pp3PPP/6K1 w - - 0 1', label: 'frame.repetition', caption: 'draws.repetition', widget: 'repetition', ask: 'ask.repetition' },
            { move: 'd5d8', widget: 'repetition', label: 'frame.repetition' }, { move: 'h8h7', widget: 'repetition', label: 'frame.repetition' },
            { move: 'd8d3', widget: 'repetition', label: 'frame.repetition' }, { move: 'h7h8', widget: 'repetition', label: 'frame.repetition' },
            { move: 'd3d8', widget: 'repetition', label: 'frame.repetition' }, { move: 'h8h7', widget: 'repetition', label: 'frame.repetition' },
            { move: 'd8d3', widget: 'repetition', label: 'frame.repetition' }, { move: 'h7h8', widget: 'repetition', label: 'frame.repetition' },
            { move: 'd3d8', widget: 'repetition', label: 'frame.repetition' },
          ],
        },
      ],
    },

    /* ---------------- Special moves ---------------- */
    {
      id: 'promotion', part: 'special', tag: 'lesson.tag.special.promotion',
      steps: [
        {
          id: 'watch', label: 'step.watch', kind: 'demo', mode: 'rules', fen: '8/4P3/8/8/1k6/8/8/K7 w - - 0 1',
          text: ['promotion.body'],
          frames: [
            { label: 'frame.promo.ready', caption: 'promotion.demo.1', movesFrom: 'e7' },
            { move: 'e7e8q', label: 'frame.promotion', caption: null, note: 'demo.choices' },
          ],
        },
        {
          id: 'try', label: 'step.try', kind: 'play', mode: 'rules', sides: 'w', fen: '7k/1P6/6K1/8/8/8/8/8 w - - 0 1',
          text: ['promotion.body'], goal: { type: 'mate', promote: true, prompt: 'prompt.promoteMate' },
          auto: [{ ask: 'ask.promote' }, { select: 'b7' }, { move: 'b7b8n', hold: 2600 }, { undo: true }, { move: 'b7b8q' }],
        },
      ],
    },
    {
      id: 'castling', part: 'special', tag: 'lesson.tag.special.castling',
      steps: [
        {
          id: 'watch', label: 'step.watch', kind: 'demo', mode: 'rules', fen: 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1',
          text: ['castling.body', 'castling.conditions'], caution: 'castling.caution', widget: 'castling',
          frames: [
            { label: 'frame.castle.ready', caption: 'castling.demo.1' },
            { move: 'e1g1', label: 'frame.castle.white', caption: 'castling.demo.2' },
            { move: 'e8c8', label: 'frame.castle.black', caption: null },
          ],
        },
        {
          id: 'clear', label: 'step.clear', kind: 'play', mode: 'rules', sides: 'w', widget: 'castling',
          fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
          text: ['castling.conditions'], caution: 'castling.caution',
          replies: ['b8c6', 'd7d6', 'a7a6', 'h7h6', 'g7g6', 'b7b6'],
          goal: { type: 'castle', prompt: 'prompt.castleClear' },
          auto: [{ select: 'e1' }, { attempt: 'e1g1' }, { move: 'g1f3' }, { move: 'f1c4' }, { move: 'e1g1' }],
        },
        {
          id: 'which', label: 'step.which', kind: 'play', mode: 'rules', sides: 'w', widget: 'castling',
          fen: '4k3/8/8/8/2b5/8/8/R3K2R w KQ - 0 1', text: ['castling.conditions'],
          goal: { type: 'castle', only: true, prompt: 'prompt.castleWhich' },
          auto: [{ ask: 'ask.castleWhich' }, { attempt: 'e1g1' }, { move: 'e1c1' }],
        },
        {
          id: 'rights', label: 'step.rights', kind: 'demo', mode: 'rules', fen: '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1',
          text: ['castling.conditions'], widget: 'castling', widgetColor: 'w',
          frames: [
            { label: 'frame.castle.ready', caption: 'castling.rights.1' },
            { move: 'e1f1', label: 'frame.king.moves' }, { move: 'e8e7', label: 'frame.blackReplies' },
            { move: 'f1e1', label: 'frame.king.back', caption: 'castling.rights.2' },
            { move: 'e7e8', label: 'frame.blackReplies', ask: 'ask.castleRights' },
            { label: 'frame.castle.no', why: 'e1g1' },
          ],
        },
      ],
    },
    {
      id: 'enpassant', part: 'special', tag: 'lesson.tag.special.enpassant',
      steps: [
        {
          id: 'watch', label: 'step.watch', kind: 'demo', mode: 'rules', fen: '4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1',
          text: ['ep.body'],
          frames: [
            { label: 'frame.blackToMove', caption: 'ep.demo.1' },
            { move: 'd7d5', label: 'frame.ep.jump', caption: 'ep.demo.2', movesFrom: 'e5' },
            { move: 'e5d6', label: 'frame.ep', caption: null, ask: 'ask.ep' },
          ],
        },
        {
          id: 'try', label: 'step.try', kind: 'play', mode: 'rules', sides: 'w', fen: '4k3/2p5/8/3P4/8/8/8/4K3 b - - 0 1',
          text: ['ep.body'], onStart: ['c7c5'],
          replies: ['e8d8', 'e8f8', 'e8f7', 'e8e7', 'e8d7'],
          goal: { type: 'ep', prompt: 'prompt.ep' },
          auto: [{ select: 'd5' }, { move: 'd5c6' }],
        },
      ],
    },

    /* ---------------- Play ---------------- */
    {
      id: 'play', part: 'play',
      steps: [
        { id: 'steps', label: 'step.steps', kind: 'overview', fen: START, mode: 'rules' },
        {
          id: 'board', label: 'step.play', kind: 'play', mode: 'rules', sides: 'both', sandbox: true, fen: START, text: ['play.body'], prompt: 'prompt.play',
          auto: [{ select: 'e2' }, { move: 'e2e4' }, { move: 'e7e5' }],
        },
      ],
    },
  ];

  /* Class challenge: one question per key idea, in lesson order. */
  const CHALLENGE = [
    {
      id: 'reach', question: 'cq.1', explain: 'challenge.q1', mode: 'drill', reveal: 'reach', star: 'e5',
      fen: '8/8/8/R1P5/2NP4/8/8/B7 w - - 0 1',
      options: [{ key: 'A', square: 'a5' }, { key: 'B', square: 'a1' }, { key: 'C', square: 'c4' }, { key: 'D', square: 'd4' }],
      answer: 'C',
    },
    {
      id: 'mate', question: 'cq.3', explain: 'challenge.q3', mode: 'rules', reveal: 'moves',
      fen: '7k/8/5K2/8/8/8/8/6Q1 w - - 0 1',
      options: [{ key: 'A', move: 'g1h2' }, { key: 'B', move: 'g1g7' }, { key: 'C', move: 'g1g6' }],
      answer: 'B',
    },
    {
      id: 'castle', question: 'cq.4', explain: 'challenge.q4', mode: 'rules', reveal: 'castle', side: 'K',
      fen: '4k3/8/b7/8/8/8/8/4K2R w K - 0 1',
      options: [{ key: 'A', label: 'ch.yes' }, { key: 'B', label: 'ch.no' }],
      answer: 'B',
    },
    {
      id: 'enpassant', question: 'cq.5', explain: 'challenge.q5', mode: 'rules', reveal: 'moves', lastMove: ['d7', 'd5'],
      fen: '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2',
      options: [{ key: 'A', label: 'ch.yes', move: 'e5d6' }, { key: 'B', label: 'ch.no' }],
      answer: 'A',
    },
  ];

  root.SQ1 = root.SQ1 || {};
  /* The 15-minute talk: the one step per topic that → visits while presenting (the rest stay reachable with Go to). */
  const TALK_ROUTE = [
    'overview/map', 'equipment/kit', 'setup/orient', 'setup/squares', 'setup/watch',
    'rook/watch', 'bishop/explore', 'queen/explore', 'king/explore', 'knight/explore', 'pawn/watch', 'turns/try',
    'goal/watch', 'check/watch', 'check/three', 'checkmate/watch', 'draws/watch', 'draws/other',
    'promotion/watch', 'castling/watch', 'enpassant/watch', 'play/steps', 'play/board',
  ];

  root.SQ1.Curriculum = { START, PARTS, PROCEDURE, LESSONS, CHALLENGE, TALK_ROUTE };
})(typeof window !== 'undefined' ? window : globalThis);
