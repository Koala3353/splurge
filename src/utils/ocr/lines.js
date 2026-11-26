// Rebuilding physical receipt lines from Tesseract word boxes.
//
// PSM 6 usually keeps an item name and its price on one text line, but not
// always: when the gap between the two columns is wide enough, the engine
// decides it is looking at two separate blocks and emits them as separate
// lines. The parser then sees a name with no amount followed by an orphan
// number, and drops the item.
//
// The word boxes don't have that ambiguity. Two words printed on the same row
// of the paper overlap vertically no matter how far apart they sit, so
// regrouping every word on the page by vertical overlap reconstructs the
// physical lines regardless of how the engine chose to block them.

const WORD_MIN_CONFIDENCE = 30;

function collectWords(blocks) {
  const words = [];
  const walk = (node) => {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.words) { node.words.forEach(walk); return; }
    if (node.paragraphs) { node.paragraphs.forEach(walk); return; }
    if (node.lines) { node.lines.forEach(walk); return; }
    if (typeof node.text === 'string' && node.bbox) {
      const text = node.text.trim();
      if (text && (node.confidence ?? 100) >= WORD_MIN_CONFIDENCE) {
        words.push({ text, ...node.bbox });
      }
    }
  };
  walk(blocks);
  return words;
}

export function linesFromBlocks(blocks) {
  const words = collectWords(blocks);
  if (words.length < 4) return '';

  // Typical glyph height sets the tolerance: half a line is close enough to
  // count as "the same row", which absorbs the baseline wobble of a photo
  // without merging two genuinely adjacent lines.
  const heights = words.map((w) => w.y1 - w.y0).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)] || 1;
  const tol = Math.max(2, median * 0.5);

  const byTop = [...words].sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
  const rows = [];
  for (const w of byTop) {
    const mid = (w.y0 + w.y1) / 2;
    const row = rows[rows.length - 1];
    if (row && Math.abs(mid - row.mid) <= tol) {
      row.words.push(w);
      // Running centre, so a row drifting across a tilted photo stays one row.
      row.mid = (row.mid * (row.words.length - 1) + mid) / row.words.length;
    } else {
      rows.push({ mid, words: [w] });
    }
  }

  return rows
    .map((row) => {
      const sorted = row.words.sort((a, b) => a.x0 - b.x0);
      let out = sorted[0].text;
      for (let i = 1; i < sorted.length; i++) {
        // A gap wider than a couple of characters is a column boundary, not a
        // word space — pad it so the parser's "name … amount" split is clean.
        const gap = sorted[i].x0 - sorted[i - 1].x1;
        out += gap > median * 1.5 ? '   ' : ' ';
        out += sorted[i].text;
      }
      return out;
    })
    .join('\n');
}
