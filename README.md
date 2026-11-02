# Splurge

**Splurge** is a mobile-first bill-splitting progressive web app (PWA) built with React and Vite. Scan a receipt, split it line-by-line, and track who owes you — built for the way real group dinners actually get paid back (one person fronts the bill, everyone settles up after).

Big dinner. Clean split.

**Live:** [koala3353.github.io/splurge](https://koala3353.github.io/splurge/)

## ✨ Features

- **Receipt scanner** — Tesseract.js OCR reads the receipt and pulls out line items and prices; downscales images first to avoid memory crashes on phones. When the engine's own line grouping splits a two-column receipt badly, lines are rebuilt geometrically from word bounding boxes.
- **Line-by-line splitting** — assign each item to the people who shared it, or tap **Everyone**. Shared fees, tips, and discounts are allocated proportionally to each person's share.
- **Split again** — the splits you keep repeating (same crew, similar amount) are offered back as one-tap chips, ranked by recency and time of day. Save any of them as a template.
- **Bill detail, edit & delete** — tap any split to see the full breakdown, edit it, share a summary, or delete it (with a confirm).
- **People & balances** — see exactly who owes you, sorted by balance; settled friends drop to the bottom. Record full / half / custom payments and **undo** any of them. Long histories are paginated, newest first, with the payment actions above the list rather than buried under it.
- **"This is me"** — tag yourself so your own share never counts as money owed to you.
- **Send a request** — generate a ready-to-send message (Web Share, with clipboard fallback) to nudge a friend — perfect for GCash collections. The wording is tested against a list of machine-written tells so it reads like you wrote it.
- **Groups** — save the crews you split with often, split with them or remind them all in one tap.
- **Analytics** — outings, total splurged, you're-owed and collected, plus month-by-month spending, a collection rate, who you split with most, and an expandable leaderboard. All charts are plain CSS, no charting dependency.
- **Light and dark** — follows the OS by default, with a manual override that survives it. Every shipping colour pair is measured against WCAG AA by a script, not by eye.
- **Backup & restore** — everything lives on-device; export a JSON backup and restore it on another phone. Clear-all is guarded.
- **Installable & offline** — installs to the home screen, works offline via a service worker, handles notched safe areas, and deep-links survive hard refresh on GitHub Pages.

## 🎨 Design system

The interface is built on translucent "glass" panels over an ambient colour wash, in a palette called **Prism**.

Two rules do most of the work:

- **The glass is never tinted.** It is neutral white at low alpha, and all the colour lives in the wash behind it. Real glass takes its colour from what is behind it, which is exactly what `backdrop-filter` already does — tinting the pane itself is what makes glass read as coloured plastic.
- **Colour has one job each.** Indigo is chrome (controls, nav, focus, brand) and never touches a money figure. Amounts stay neutral, turn mint when settled and rose when owed.

Tokens are declared in three layers (primitive → semantic → component) in `src/index.css`, with the semantic layer written twice — once for dark, once for light. No component knows which mode is active.

Glass has two failure modes that would strand text, and both are handled: no `backdrop-filter` support, and `prefers-reduced-transparency`. Either one turns the panes opaque at their composited colour, leaving layout and hierarchy unchanged.

## 💻 Tech Stack

- **Framework:** React 19 + Vite
- **Routing:** React Router (nested routes with a shared `AppLayout`)
- **State:** React Context + `localStorage` (with cross-tab sync)
- **Styling:** Hand-rolled CSS — design tokens, glassmorphism, a small utility layer, native `<dialog>`, View Transitions
- **Type:** Geist + Geist Mono
- **Icons:** Lucide React
- **OCR:** Tesseract.js
- **Charts:** Custom CSS/flex bars (no charting dependency)
- **Tests:** Node's built-in test runner — no test framework dependency

## 🛠️ Local Development

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (node --test)
npm run build    # production build (emits dist/ + a 404.html SPA fallback)
npm run lint
```

Plus one check that is not wired into `npm` scripts:

```bash
node scripts/check-contrast.mjs
```

Run it after any palette change. It composites the real layers — translucent pane over ambient wash over base — and measures every shipping foreground/background pair against WCAG AA in both modes, at the worst case where every wash blob overlaps. It exits non-zero on a failure. It exists because an earlier retheme shipped white-on-emerald buttons at 2.28:1 on every primary CTA and nothing caught it until it was measured.

The dev server runs from `/`; production builds use the `/splurge/` base path for GitHub Pages (see `vite.config.js`).

## 🌐 Deployment

Pushing to `main` triggers a GitHub Actions build that publishes `dist/` to GitHub Pages. A generated `404.html` (a copy of the app shell) lets client-side routes resolve on hard refresh.

## 📐 Architecture notes

- `src/utils/split.js` — single source of truth for the splitting math (used by the store, the New Bill review, and the bill detail view, so the numbers always agree).
- `src/utils/suggestions.js` — ranks repeat splits from history and saved templates, with time-of-day affinity.
- `src/utils/stats.js` — derived figures for the Stats page; pure and dependency-free so each one can be pinned by a test.
- `src/utils/shareText.js` — the outbound message templates.
- `src/utils/ocr.js` / `receipt.js` — scanning and line-item parsing.
- `src/store/AppContext.jsx` — people, groups, bills, payments, templates, derived balances, self-identity, and backup/restore.
- `src/components/AppLayout.jsx` — the shell. Routes that own the bottom of the screen (the new-bill wizard, which ends in its own action bar) hide the floating tab bar rather than stacking two bars.

### Known gaps

- Tesseract's WASM and language data load from a CDN, so a **first** scan needs a network connection even though the rest of the app is offline-first.
- All OCR validation to date is synthetic — the parser is well covered by unit tests, but it has not been measured against a corpus of real receipt photos.
