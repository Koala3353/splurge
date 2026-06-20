import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync } from 'node:fs'
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

// https://vite.dev/config/
// Use the repo sub-path only for production builds (GitHub Pages serves the
// app from /splurge/). In dev we serve from root so the dev server and
// tooling don't have to deal with a redirect.
export default defineConfig(({ command }) => ({
  plugins: [react(), spaFallback()],
  base: command === 'build' ? '/splurge/' : '/',
}))
