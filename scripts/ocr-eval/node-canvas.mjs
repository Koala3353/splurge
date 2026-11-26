// Teaches the production OCR pipeline to run under Node.
//
// src/utils/ocr/env.js is the only part of the pipeline that touches the DOM;
// everything else is arithmetic over pixel buffers. Swapping that one module's
// backend for @napi-rs/canvas means the harness measures the REAL pipeline
// rather than a reimplementation that could drift from it.
//
// @napi-rs/canvas is not a dependency of the app (it is a prebuilt native
// binary and the app never runs in Node), so it is resolved leniently: from
// the repo if someone added it as a devDependency, otherwise from a directory
// given by --canvas-dir / $OCR_EVAL_CANVAS_DIR.
import { createRequire } from 'node:module';
import path from 'node:path';
import { setOcrEnvironment } from '../../src/utils/ocr.js';

export async function loadNapiCanvas(dir) {
  const candidates = [];
  if (dir) candidates.push(path.resolve(dir, 'node_modules/@napi-rs/canvas/index.js'));
  if (process.env.OCR_EVAL_CANVAS_DIR) {
    candidates.push(path.resolve(process.env.OCR_EVAL_CANVAS_DIR, 'node_modules/@napi-rs/canvas/index.js'));
  }
  candidates.push('@napi-rs/canvas');
  const require = createRequire(import.meta.url);
  const errors = [];
  for (const spec of candidates) {
    try { return require(spec); } catch (e) { errors.push(`${spec}: ${e.message}`); }
  }
  throw new Error(
    'Could not load @napi-rs/canvas.\n'
    + 'Install it as a devDependency (npm i -D @napi-rs/canvas) or point\n'
    + '--canvas-dir at a directory whose node_modules contains it.\n'
    + errors.map((e) => `  - ${e}`).join('\n'),
  );
}

export async function installNodeCanvas(dir) {
  const napi = await loadNapiCanvas(dir);
  setOcrEnvironment({
    createCanvas(w, h) {
      return napi.createCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
    },
    // The "file" here is a Buffer of image bytes, not a browser File.
    loadImage(buf) { return napi.loadImage(buf); },
    // Tesseract.js in Node wants bytes, not a canvas object.
    toRecognizerInput(canvas) { return canvas.toBuffer('image/png'); },
    encodeThumbnail() { return null; },   // previews are a UI concern
  });
  return napi;
}
