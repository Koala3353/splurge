// The one place the OCR pipeline touches the browser.
//
// Everything else in src/utils/ocr/ is arithmetic over pixel buffers, which
// means it can be unit-tested and benchmarked off the main thread — but only
// if canvas creation, image decoding and "what do we hand the recogniser"
// are injectable. They are, through setOcrEnvironment(). The default is the
// real DOM; scripts/ocr-eval swaps in a Node canvas so the evaluation harness
// runs the production pipeline rather than a reimplementation of it.

const browserEnv = {
  createCanvas(width, height) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(width));
    c.height = Math.max(1, Math.round(height));
    return c;
  },
  loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  },
  // Tesseract.js takes an HTMLCanvasElement directly in the browser; in Node
  // it wants bytes. The harness overrides this to encode.
  toRecognizerInput(canvas) {
    return canvas;
  },
  encodeThumbnail(canvas) {
    return canvas.toDataURL('image/jpeg', 0.6);
  },
};

let env = browserEnv;

/** Swap the canvas/image backend. Pass nothing to restore the browser one. */
export function setOcrEnvironment(next) {
  env = next ? { ...browserEnv, ...next } : browserEnv;
}

export const createCanvas = (w, h) => env.createCanvas(w, h);
export const loadImage = (file) => env.loadImage(file);
export const toRecognizerInput = (canvas) => env.toRecognizerInput(canvas);
export const encodeThumbnail = (canvas) => env.encodeThumbnail(canvas);

/** 2d context with the read-heavy hint the preprocessing passes all want. */
export const ctx2d = (canvas) => canvas.getContext('2d', { willReadFrequently: true });
