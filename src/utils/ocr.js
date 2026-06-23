// Browser-only OCR helper: one reused Tesseract worker (fast repeat scans) and
// document-grade image preprocessing (adaptive thresholding) tuned for phone
// photos of thermal receipts.

let workerPromise = null;
let progressCb = null;

// Lazily create — and reuse — a single configured worker. Calling this early
// (e.g. when the user taps "Scan") warms the engine while they pick a photo.
export function warmUpOcr() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng', 1, {
        logger: (m) => {
          if (!progressCb) return;
          if (m.status === 'recognizing text') progressCb(`Reading text… ${Math.round(m.progress * 100)}%`);
          else if (/load|traineddata|initial/i.test(m.status)) progressCb('Warming up the scanner (one-time)…');
        },
      });
      // PSM 4 = single column of variable-size lines (a receipt).
      await worker.setParameters({ tessedit_pageseg_mode: '4', preserve_interword_spaces: '1' });
      return worker;
    })().catch((err) => { workerPromise = null; throw err; });
  }
  return workerPromise;
}

export async function scanReceipt(file, onProgress) {
  progressCb = onProgress || null;
  try {
    onProgress?.('Optimizing image…');
    const blob = await preprocess(file);
    onProgress?.('Reading the receipt…');
    const worker = await warmUpOcr();
    const { data } = await worker.recognize(blob);
    return data.text;
  } finally {
    progressCb = null;
  }
}

// --- Preprocessing --------------------------------------------------------

async function preprocess(file) {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.src = url;
  try {
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });

    const TARGET = 1600; // longest side: legible text vs. mobile memory/speed
    let { width, height } = img;
    const scale = TARGET / Math.max(width, height);
    if (scale < 0.95 || scale > 1.1) {
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, width, height);

    let out = canvas;
    try {
      const imageData = ctx.getImageData(0, 0, width, height);
      adaptiveThreshold(imageData.data, width, height);
      const angle = estimateSkew(imageData.data, width, height);
      ctx.putImageData(imageData, 0, 0);
      if (Math.abs(angle) >= 1) out = deskew(canvas, angle); // level the receipt
    } catch { /* tainted canvas — fall back to the plain draw */ }

    return await new Promise((resolve) => out.toBlob(resolve, 'image/jpeg', 0.85));
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Estimate the skew angle (degrees) via projection-profile variance: the angle
// at which black (text) pixels collapse into the sharpest horizontal bands is
// the angle the receipt is tilted. Runs on a downscaled sample for speed.
function estimateSkew(data, w, h) {
  const SW = Math.min(260, w);
  const s = SW / w;
  const SH = Math.max(1, Math.round(h * s));
  const xs = [];
  const ys = [];
  for (let sy = 0; sy < SH; sy++) {
    const y = Math.min(h - 1, Math.round(sy / s));
    for (let sx = 0; sx < SW; sx++) {
      const x = Math.min(w - 1, Math.round(sx / s));
      if (data[(y * w + x) * 4] < 128) { xs.push(sx); ys.push(sy); }
    }
  }
  if (xs.length < 80) return 0;

  const off = SW;
  const binLen = SH + 2 * SW;
  const score = (deg) => {
    const t = Math.tan((deg * Math.PI) / 180);
    const bins = new Float64Array(binLen);
    for (let i = 0; i < xs.length; i++) {
      const r = Math.round(ys[i] - xs[i] * t) + off;
      if (r >= 0 && r < binLen) bins[r]++;
    }
    let acc = 0;
    for (let i = 0; i < binLen; i++) acc += bins[i] * bins[i];
    return acc;
  };

  let best = 0;
  let bestScore = -1;
  for (let deg = -12; deg <= 12; deg += 1) {
    const sc = score(deg);
    if (sc > bestScore) { bestScore = sc; best = deg; }
  }
  for (let deg = best - 1; deg <= best + 1; deg += 0.25) {
    const sc = score(deg);
    if (sc > bestScore) { bestScore = sc; best = deg; }
  }
  return best;
}

// Rotate the canvas to level the text. Expands the canvas to avoid clipping
// and fills the new corners white so OCR sees clean margins.
function deskew(src, angleDeg) {
  const rad = (-angleDeg * Math.PI) / 180;
  const w = src.width;
  const h = src.height;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const nw = Math.ceil(w * cos + h * sin);
  const nh = Math.ceil(w * sin + h * cos);
  const out = document.createElement('canvas');
  out.width = nw;
  out.height = nh;
  const c = out.getContext('2d');
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, nw, nh);
  c.translate(nw / 2, nh / 2);
  c.rotate(rad);
  c.drawImage(src, -w / 2, -h / 2);
  return out;
}

// Adaptive (local-mean) thresholding via an integral image. Converts the photo
// to crisp black text on white, correcting for shadows, folds, uneven lighting
// and dark backgrounds far better than a global contrast stretch. O(pixels).
function adaptiveThreshold(d, w, h) {
  const n = w * h;
  const gray = new Float64Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    gray[i] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
  }

  const iw = w + 1;
  const integral = new Float64Array(iw * (h + 1));
  for (let y = 1; y <= h; y++) {
    let rowSum = 0;
    const yo = y * iw;
    const yp = (y - 1) * iw;
    for (let x = 1; x <= w; x++) {
      rowSum += gray[(y - 1) * w + (x - 1)];
      integral[yo + x] = integral[yp + x] + rowSum;
    }
  }

  // Window ~1/18 of the smaller side (odd); C biases toward keeping faint text.
  const win = (Math.max(15, Math.round(Math.min(w, h) / 18)) | 1);
  const half = win >> 1;
  const C = 8;

  for (let y = 0; y < h; y++) {
    const y0 = y - half < 0 ? 0 : y - half;
    const y1 = y + half >= h ? h - 1 : y + half;
    for (let x = 0; x < w; x++) {
      const x0 = x - half < 0 ? 0 : x - half;
      const x1 = x + half >= w ? w - 1 : x + half;
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum = integral[(y1 + 1) * iw + (x1 + 1)]
        - integral[y0 * iw + (x1 + 1)]
        - integral[(y1 + 1) * iw + x0]
        + integral[y0 * iw + x0];
      const mean = sum / area;
      const idx = y * w + x;
      const v = gray[idx] < mean - C ? 0 : 255;
      const p = idx * 4;
      d[p] = d[p + 1] = d[p + 2] = v;
    }
  }
}
