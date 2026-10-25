/* Square One — original piece set.
 *
 * Each piece is a stack of simple shapes in a 100 × 100 box. Every piece is
 * drawn twice: a thick outline pass for a crisp silhouette, then a fill pass
 * whose thinner strokes become the inner detail lines. White pieces are ivory
 * with ink lines; black pieces are ink with pale inner lines, so the two sides
 * differ in lightness and in line treatment, not by colour alone.
 */
(function (root) {
  'use strict';

  const BASE = '<rect x="21" y="81" width="58" height="11" rx="4"/>';

  const SHAPES = {
    p: [
      BASE,
      '<path d="M32 81 C34 71 39 63 42.5 58 H57.5 C61 63 66 71 68 81 Z"/>',
      '<rect x="35" y="52" width="30" height="7.5" rx="3.75"/>',
      '<circle cx="50" cy="38" r="13.5"/>',
    ],
    r: [
      BASE,
      '<path d="M30 81 L33.5 47 H66.5 L70 81 Z"/>',
      '<rect x="27" y="41" width="46" height="8" rx="2.5"/>',
      '<path d="M26.5 41.5 V19 H36.5 V27 H44.5 V19 H55.5 V27 H63.5 V19 H73.5 V41.5 Z"/>',
    ],
    n: [
      BASE,
      '<path d="M33 81 C32 70 37 61 45 56 C40 57.5 34 59.5 28.5 59.5 C21.5 59.5 17.5 54 20 47.5 C22.5 42 29 36.5 34 31 C38 26.5 41.5 22.5 45 20.5 L45.5 11 L54 19 C67 21.5 77.5 34 77.5 52 C77.5 64 73 73 71 81 Z"/>',
      '<rect x="27" y="75" width="46" height="7" rx="3"/>',
    ],
    b: [
      BASE,
      '<path d="M35 81 C37 72 41.5 65.5 43 61 H57 C58.5 65.5 63 72 65 81 Z"/>',
      '<rect x="35" y="55" width="30" height="7.5" rx="3.75"/>',
      '<path d="M50 17 C62 26.5 67 36.5 65 45 C63 52 57 56 50 56 C43 56 37 52 35 45 C33 36.5 38 26.5 50 17 Z"/>',
      '<circle cx="50" cy="13.5" r="5"/>',
    ],
    q: [
      BASE,
      '<path d="M31 81 C32.5 71 33.5 63 32.5 57 L19.5 30 L33 43 L36 22 L45.5 39 L50 17.5 L54.5 39 L64 22 L67 43 L80.5 30 L67.5 57 C66.5 63 67.5 71 69 81 Z"/>',
      '<rect x="30" y="54" width="40" height="8" rx="3.5"/>',
      '<circle cx="19.5" cy="29" r="4.6"/>',
      '<circle cx="36" cy="21" r="4.6"/>',
      '<circle cx="50" cy="15.5" r="4.6"/>',
      '<circle cx="64" cy="21" r="4.6"/>',
      '<circle cx="80.5" cy="29" r="4.6"/>',
    ],
    k: [
      BASE,
      '<path d="M32 81 C33 71 33.5 64 31.5 57 H68.5 C66.5 64 67 71 68 81 Z"/>',
      '<path d="M50 41.5 C46 36 41 33.5 36 33.5 C26.5 33.5 22.5 43.5 27.5 55 H72.5 C77.5 43.5 73.5 33.5 64 33.5 C59 33.5 54 36 50 41.5 Z"/>',
      '<rect x="28" y="53" width="44" height="8" rx="3.5"/>',
      '<path d="M46 9 H54 V16.5 H61 V24.5 H54 V40 H46 V24.5 H39 V16.5 H46 Z"/>',
    ],
  };

  // Extra lines drawn on top in the detail colour (stroke only).
  const DETAILS = {
    n: '<path d="M55 21.5 C63.5 26 69.5 36.5 70 50" fill="none"/><circle cx="40.5" cy="33" r="2.6" class="dot"/><circle cx="24.6" cy="51" r="1.7" class="dot"/>',
    b: '<path d="M55.5 30 L47 41" fill="none"/>',
    k: '',
    q: '',
    r: '',
    p: '',
  };

  const STYLE = {
    w: { fill: '#FBF8F0', line: '#1B1F1C', outline: '#1B1F1C', detail: '#1B1F1C', inner: 2.4 },
    b: { fill: '#23292A', line: '#D6D0BC', outline: '#121615', detail: '#D6D0BC', inner: 1.7 },
  };

  const cache = {};

  /** Returns SVG markup for a piece given as a FEN letter. */
  function svg(letter) {
    if (cache[letter]) return cache[letter];
    const color = letter === letter.toUpperCase() ? 'w' : 'b';
    const type = letter.toLowerCase();
    const s = STYLE[color];
    const shapes = SHAPES[type].join('');
    const markup =
      '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" class="piece-svg">' +
      `<g fill="${s.outline}" stroke="${s.outline}" stroke-width="6" stroke-linejoin="round">${shapes}</g>` +
      `<g fill="${s.fill}" stroke="${s.line}" stroke-width="${s.inner}" stroke-linejoin="round">${shapes}</g>` +
      (DETAILS[type] ? `<g stroke="${s.detail}" fill="${s.detail}" stroke-width="2.4" stroke-linecap="round">${DETAILS[type]}</g>` : '') +
      '</svg>';
    cache[letter] = markup;
    return markup;
  }

  root.SQ1 = root.SQ1 || {};
  root.SQ1.Pieces = { svg };
})(typeof window !== 'undefined' ? window : globalThis);
