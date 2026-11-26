import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

// GitHub Pages has no SPA fallback: hard-refreshing a client-side route like
// /splurge/people returns a 404 before the service worker takes over. Emitting
// a 404.html that is a copy of the app shell lets Pages serve the SPA for any
// unmatched path; the router then renders the correct route.
function spaFallback() {
  return {
    name: 'spa-404-fallback',
    closeBundle() {
      // Resolved against the project root (cwd during `vite build`).
      const index = resolve('dist/index.html')
      const notFound = resolve('dist/404.html')
      if (existsSync(index)) copyFileSync(index, notFound)
    },
  }
}

// public/sw.js is copied verbatim into dist/. After the bundle is written, stamp
// it with a version derived from the content-hashed asset names (so it changes
// exactly when the app changes) and the list of JS/CSS files to precache.
function stampServiceWorker() {
  return {
    name: 'stamp-service-worker',
    apply: 'build',
    writeBundle(_options, bundle) {
      const swPath = resolve('dist/sw.js')
      if (!existsSync(swPath)) return
      const assets = Object.keys(bundle)
        .filter((f) => /\.(js|css)$/.test(f))
        .sort()
      const version = createHash('sha1').update(assets.join('|')).digest('hex').slice(0, 10)
      const sw = readFileSync(swPath, 'utf8')
        .replace('__BUILD_VERSION__', version)
        .replace('"__PRECACHE_ASSETS__"', JSON.stringify(assets.map((f) => './' + f)))
      writeFileSync(swPath, sw)
    },
  }
}

// https://vite.dev/config/
// Use the repo sub-path only for production builds (GitHub Pages serves the
// app from /splurge/). In dev we serve from root so the dev server and
// tooling don't have to deal with a redirect.
export default defineConfig(({ command }) => ({
  plugins: [react(), spaFallback(), stampServiceWorker()],
  base: command === 'build' ? '/splurge/' : '/',
}))
