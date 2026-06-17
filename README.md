# Splurge

**Splurge** is a modern, mobile-first bill-splitting progressive web app (PWA) built with React and Vite. It allows you to easily track outings with friends, scan receipts using OCR, split costs proportionally, and log payments over time.

## 🚀 Features

- **Receipt Scanner**: Built-in Tesseract.js OCR engine automatically scans receipts and extracts line items, prices, and fees.
- **Smart Splitting**: Automatically calculates exact proportional dues including shared taxes and tip.
- **Swipe-to-Reveal**: Premium, native-feeling swipe gestures for managing friends, groups, and bill items.
- **Interactive Analytics**: Visual breakdowns of your spending trends and a leaderboard of who owes you the most using Recharts.
- **Fluid Navigation**: Seamless, app-like view transitions between pages.
- **PWA Ready**: Installable to your home screen with offline caching via service workers.

## 💻 Tech Stack

- **Framework:** React + Vite
- **Routing:** React Router v6
- **Styling:** Custom CSS with Glassmorphism UI
- **Icons:** Lucide React
- **Charts:** Recharts
- **OCR Engine:** Tesseract.js

## 🛠️ Local Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

## 🌐 Deployment

This project is configured to automatically deploy to GitHub Pages using GitHub Actions. Any push to the `main` branch will trigger a build and publish the latest version.
