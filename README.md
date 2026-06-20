# Splurge

**Splurge** is a mobile-first bill-splitting progressive web app (PWA) built with React and Vite. Scan a receipt, split it line-by-line, and track who owes you — built for the way real group dinners actually get paid back (one person fronts the bill, everyone settles up after).

Big dinner. Clean split.

## ✨ Features

- **Receipt scanner** — Tesseract.js OCR reads the receipt and pulls out line items and prices; downscales images first to avoid memory crashes on phones.
- **Line-by-line splitting** — assign each item to the people who shared it, or tap **Everyone**. Shared fees, tips, and discounts are allocated proportionally to each person's share.
- **Bill detail, edit & delete** — tap any split to see the full breakdown, edit it, share a summary, or delete it (with a confirm).
- **People & balances** — see exactly who owes you, sorted by balance; settled friends drop to the bottom. Record full / half / custom payments and **undo** any of them.
- **"This is me"** — tag yourself so your own share never counts as money owed to you.
- **Send a request** — generate a ready-to-send message (Web Share, with clipboard fallback) to nudge a friend — perfect for GCash collections.
- **Groups** — save the crews you split with often and add them all in one tap.
- **Analytics** — outings, total splurged, you're-owed, collected, plus a custom (dependency-free) "who owes you most" bar chart and an expandable leaderboard.
- **Backup & restore** — everything lives on-device; export a JSON backup and restore it on another phone. Clear-all is guarded.
- **Installable & offline** — installs to the home screen, works offline via a service worker, handles notched safe areas, and deep-links survive hard refresh on GitHub Pages.

## 💻 Tech Stack

- **Framework:** React 19 + Vite
- **Routing:** React Router
- **State:** React Context + `localStorage` (with cross-tab sync)
- **Styling:** Hand-rolled CSS — glassmorphism, a small utility layer, native `<dialog>`, View Transitions
- **Icons:** Lucide React
- **OCR:** Tesseract.js
- **Charts:** Custom CSS/flex bars (no charting dependency)

## 🛠️ Local Development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build (emits dist/ + a 404.html SPA fallback)
npm run lint
```

The dev server runs from `/`; production builds use the `/splurge/` base path for GitHub Pages (see `vite.config.js`).

## 🌐 Deployment

Pushing to `main` triggers a GitHub Actions build that publishes `dist/` to GitHub Pages. A generated `404.html` (a copy of the app shell) lets client-side routes resolve on hard refresh.

## 📐 Architecture notes

- `src/utils/split.js` — single source of truth for the splitting math (used by the store, the New Bill review, and the bill detail view, so the numbers always agree).
- `src/store/AppContext.jsx` — people, groups, bills, payments, derived balances, self-identity, and backup/restore.
- `src/components/` — `Navigation`, `SwipeableItem` (swipe-to-delete), `BillDetailModal`, `SettingsModal`.
