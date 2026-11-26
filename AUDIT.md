# Splurge — Full Audit

**Method:** five isolated assessments (design critique · detector + live browser · correctness · friction/duplication · CSS/a11y), every load-bearing claim re-verified against source before inclusion.
**Date:** 2026-11-26 · **Commit:** `db173c4`
**Baseline:** `npm test` 54 pass / 0 fail · `npm run lint` 2 errors · `node scripts/check-contrast.mjs` 34 pairs, exit 0.

---

## Verdict

The craft here is real and unusually consistent in the places most apps are sloppy: zero console errors on every route, zero horizontal overflow at 375px, native `<dialog>` with verified focus trapping, a genuine three-layer token system, pure and well-tested utils. The README is mostly honest.

The problem is the opposite of neglect. **Every guard this project built is pointed slightly away from the thing it was built to catch**, and the money math — the one part that cannot be wrong — is the least defended code in the repo.

Three examples of the same pattern:

- `scripts/check-contrast.mjs` exists *because* a 2.28:1 CTA shipped. It tests `--on-danger-fill` against `--danger-fill` at 4.5:1 and passes. `.btn-danger` doesn't use `--on-danger-fill` — it hardcodes `color: white`, which measures **2.69:1** in dark mode. The token is declared three times (`index.css:89, 236, 299`) and used **zero** times. The script is green because it measures the design system's intent, not the stylesheet's reality.
- `HomePage.jsx:25-27` carries a comment warning that a list can "silently" stop being sorted by date — then `HistoryPage.jsx:14` does `[...bills].reverse()` and shows the same bills in a different order.
- `AppContext.jsx:13` and `receipt.js:5` both guard `crypto.randomUUID()`. `NewBillPage.jsx:17,193` calls it bare — so "Add item" throws on the normal phone-over-LAN test path.

**`src/utils/split.js` — the single source of truth for every peso in the app — has no test file at all.** That is where the P0s live.

### Design Health Score — 24/40 (*Fair, with structural gaps*)

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | OCR reports its verdict well; no progress during the N×M assignment grind |
| 2 | Match System / Real World | 4 | Copy is genuinely well-written; `shareText.js` sounds human |
| 3 | User Control and Freedom | **1** | Person/group delete is instant and irreversible; wizard back-chevron silently discards |
| 4 | Consistency and Standards | 2 | History vs Home sort differently; confidence thresholds differ per screen (75/55 vs 80/60) |
| 5 | Error Prevention | **1** | Items assignable to nobody; totals stop summing with no warning |
| 6 | Recognition Rather Than Recall | 3 | "This is me" is never taught and must be remembered |
| 7 | Flexibility and Efficiency | 2 | No fast path for "just split this evenly, now" |
| 8 | Aesthetic and Minimalist Design | 3 | Coherent, but generic at the surface; 28 font sizes |
| 9 | Error Recovery | 3 | Payment undo is good; deletion has none |
| 10 | Help and Documentation | 2 | No first-run teaching of the core loop |

---

## What is genuinely working

1. **The copy.** `shareText.js` is tested against a list of machine-written tells and it shows — the outbound messages read like a person wrote them. This is the most distinctive thing about the product and it is doing real work.
2. **The OCR honesty.** The scan reports *which mode it used* and how confident it is, rather than silently handing over bad data. Showing the user the machine's uncertainty is the correct call for a tool that will be wrong sometimes.
3. **The accessibility fundamentals that are usually missing.** Native `<dialog>` + `showModal()` (verified `:modal === true`, background refused focus), real `:focus-visible` with a 2px offset ring, zero layout overflow at 375px, and a contrast script that composites translucent layers rather than guessing. The instincts are right; the aim is off.

---

## P0 — Fix before anything else

### 1. Money silently vanishes when an item has no assignees
`src/utils/split.js:34-39` · *confirmed by two independent assessments and re-verified*

```js
const itemsTotal = items.reduce((sum, it) => sum + num(it.price), 0);  // counts every item
items.forEach((item) => {
  const sharers = (item.people || []).filter((pId) => dues[pId] !== undefined);
  if (sharers.length === 0) return;   // ← but this one owes nothing to anyone
```

The item counts toward the total and toward nobody's dues. `NewBillPage.jsx:665` only gates on `items.length === 0`, so this saves silently.

**Verified:** `participants:['a','b']`, `items:[{price:500,people:[]}]` → dues sum ₱0 against a ₱500 total. With `[{price:300,people:['c']},{price:100,people:['a','b']}]`, ₱300 of ₱400 disappears. Reachable in one tap via `toggleEveryoneForItem`, or by deselecting a person when editing a saved bill (step 1 never scrubs them from `items[].people`).

**Fix:** return unassigned items from `computeBillDues` as an `unassigned[]` array; block step 2 on it with a named list ("Nobody is on: Sisig, Rice"). Add the invariant test: `Σ dues === total` to the centavo.

### 2. Shares don't sum to the total — no cent reconciliation anywhere
`src/utils/split.js:37` and every display site

₱10.00 three ways renders **₱3.33 + ₱3.33 + ₱3.33 = ₱9.99** under a ₱10.00 headline, and the share message sends the same three figures to three friends.

**Fix:** largest-remainder allocation *inside* `computeBillDues`, so the store, the review screen and the share text agree by construction rather than by coincidence. Distribute the odd centavo to the payer. This and finding 1 are both killed by one property test.

### 3. Every quick split records `total: 0`
`src/store/AppContext.jsx:283-297` · *verified*

`logQuickSplit` builds `{title, participants, fees, items}` and never passes `total`. Home, History and the bill detail headline all render **₱0.00**, and the outbound message reads literally `"Grab came to ₱0."` above `Ana: ₱250`.

This is the output of the "Split again" feature — the newest headline feature in the repo (`1cbd574`) produces broken bills every time it is used.

**Fix:** `total: amt` in the `addBill` call, and have `addBill` derive `total` from items when it isn't supplied so no future caller can reintroduce this.

### 4. `crypto.randomUUID()` unguarded in the wizard
`src/pages/NewBillPage.jsx:17, 193` · *verified*

`randomUUID` is secure-context-only. `AppContext.jsx:13` and `receipt.js:5` both guard it; the wizard does not. On the normal PWA test path — `vite --host`, phone at `http://192.168.1.x:5173` — "Add item" and "Add fee" throw `TypeError` and the wizard dies.

**Fix:** export the existing `uid()` helper and use it in all three places. One import.

### 5. Deleting a person is instant, unconfirmed and destroys balance history
`src/pages/PeoplePage.jsx:267-269` → `AppContext.jsx:43-47` · *flagged independently by two assessments*

A swipe wires straight to `removePerson`, which strips group membership, clears `meId` if it was them, orphans their shares in every past bill, and drops their outstanding balance. Deleting a *bill* confirms (`BillDetailModal.jsx:175-182`). Deleting a *person who owes you money* does not. Same for `removeGroup` (`:359`).

**Fix:** one `useUndoableAction` hook feeding the existing `.toast` — a 5-second undo window is better here than a confirm dialog, and it is the same primitive the payment undo already proves works.

### 6. Deleting a bill orphans its payments into the next bill
`src/store/AppContext.jsx:80-82, 140-154` · *verified scenario*

`removeBill` leaves payments made against it in the per-person FIFO pool. Delete a duplicate ₱500 bill Ana already paid, and her ₱500 silently credits her *next* bill: she owes ₱400, her row shows "Settled ₱0.00", `totalOwedToYou` drops her, and `collectionRate` reports **100% collected while you are ₱400 down**.

**Fix:** cascade payment removal in `removeBill`, or refuse deletion of a bill with payments against it and offer "void" instead.

### 7. Light mode has no accessibility adaptations at all
`src/index.css:344, 352, 719, 726` · *verified by specificity*

All four adaptation blocks — `prefers-reduced-transparency`, `prefers-contrast: more`, and the `@supports not (backdrop-filter)` fallback — target bare `:root` **(0,1,0)**. The light layers at `:219` (`:root:not([data-theme='dark'])`) and `:282` (`:root[data-theme='light']`) are **(0,2,0)** and win regardless of source order.

The README's claim that both glass failure modes are handled is true **only in dark mode** (measured there: primary 14.60:1, tertiary 5.72:1 on `--glass-opaque` — genuinely fine). In light mode, a user with reduced transparency enabled, or a browser without `backdrop-filter`, gets translucent panes and no fallback.

**Fix:** `@layer tokens, base, components, utilities` and move the adaptation blocks into a later layer. This fixes two of the three specificity bugs and six of the seven `!important`s **without editing a single declaration**.

---

## P1 — Serious

### 8. No focus indicator on any text input
`src/index.css:601-605` · *verified*

```css
.input-ghost:focus { box-shadow: none; border: none; outline: none; }
```

At (0,2,0) this out-specifies the global `:focus-visible` (0,1,0), leaving **zero** focus indicator on the split-name field, every item name and price field, every fee field, and both search boxes. `input:focus` (0,1,1) does the same elsewhere, leaving a 3px ring measured at **1.53:1** dark / 1.64:1 light. WCAG 2.2 SC 2.4.11.

### 9. Destructive buttons ship white-on-rose at 2.69:1
`src/index.css:497` (`.btn-danger`) and `:959` (`.SwipeableList-action`) · *verified*

Both hardcode `color: white` over a rose gradient: **2.69:1** in dark mode, 3.68:1 at the gradient start. The correct token `--on-danger-fill` resolves to 7.35:1, is declared at `:89, :236, :299` and is **used nowhere**. These are the delete buttons.

### 10. The contrast script's thresholds are set below the text it guards
`scripts/check-contrast.mjs:85-86` · *verified*

```js
[t.tertiary, washed, 3.0, 'tertiary / mono labels on the wash'],
[t.tertiary, glass,  3.0, 'tertiary / mono labels on glass'],
```

3.0 is the *large-text* threshold. `--text-tertiary` ships on the **11px** `.lab` micro-label (`index.css:1916-1934`), the 12px nav label, `.pager-count` and `.month-label` — all 4.5:1 territory. Measured: **3.72:1** on dark glass, **3.44:1** for nav labels, 4.32:1 for `.lab` on the light wash.

**Fix:** change those two numbers to `4.5`. The existing script goes red immediately and tells you the rest.

> **On the contrast disagreement:** the live-browser pass measured no failures (lowest real pair 6.63:1) and the static pass computed 16. They are not contradictory — the live pass sampled rendered text in default state and could not resolve gradient backgrounds; the failures cluster in states it never opened (danger buttons, swipe actions, focus rings) and in light-mode paths. The static findings are the ones with line numbers and reproducible math, and I verified five of them by hand. Treat 16 as the real number.

### 11. Pinch-zoom is disabled
`index.html:8` — `maximum-scale=1.0, user-scalable=no`. Direct WCAG SC 1.4.4 failure. Remove both; `viewport-fit=cover` is the part you actually need.

### 12. Tap targets
44 rendered controls below 44×44; 14 below even the WCAG 2.2 AA 24×24 floor. Measured worst offenders: **"+ New" on Home at 40.7 × 13.8px**, "Remind" on People at 59.7 × 16px (the primary action for chasing money), settings gear at 29.8 × 29.8px, nav items 36px, pills 32.6px.

### 13. History and Home sort the same bills differently
`src/pages/HistoryPage.jsx:14` — `[...bills].reverse()` (insertion order) vs `HomePage.jsx:29` — sorted by date. Observed rendering as 1d / 21d / 14d / 6d / 2d. `HomePage.jsx:25` carries a comment warning against exactly this.

### 14. "This is me" is never taught, and silently inflates every balance
`meId` defaults to `null` (`AppContext.jsx:26`). The only ways to set it are an opt-in "Add me" button (`NewBillPage.jsx:99-116`), a text link buried under the payment history (`PeoplePage.jsx:1051-1059`), and Settings. A new user who types their own name like any other friend **gets invoiced for their own dinner in every share message**.

**Fix:** a dismissible "Which one is you?" banner on Home and People while `meId === null`.

### 15. A hung scan traps the user and loses the bill
`src/utils/ocr.js:94`, `NewBillPage.jsx:388`. No timeout, no cancel. The full-screen overlay has no exit and the in-progress bill goes with it. Add a 45s timeout, a Cancel button, and `worker.terminate()` on both paths.

### 16. Two lint errors
`SuggestionRow.jsx:27` — impure `Date.now()` in render. `useTheme.js:50` — setState in effect.

---

## The repetition tax

**Code.** The duplication here is the kind that makes every future change cost three edits:

| What | Count | Where |
|---|---|---|
| The `0.005` settled-epsilon literal | **32 occurrences, 7 files** | should be `const SETTLED_EPSILON` in `split.js` |
| Hand-rolled `<dialog>` implementations | **5** | identical open/close effect ×5, backdrop-click closer ×9, shell style ×5 (drifted to 440/460/500px and 85vh/86vh), header block ×6 |
| Scan-variant label maps | **3 divergent copies** | `ocr.js:434`, `ScanResultDialog.jsx:4-13`, `ScanDiagnostics.jsx:9-12` — **confidence thresholds disagree (75/55 vs 80/60), so a 78% scan is green on one screen and amber on the next** |
| `format.js` bypassed | 4 sites | literal `'₱'` at `NewBillPage.jsx:450,555`; `shareText.js:38-41` re-implements currency trimming by string surgery; `toLocaleDateString('en-PH')` at `shareText.js:61`, `stats.js:33` |
| `borderRadius: 'var(--radius-full)'` inline | 12× | should be a `.btn-pill` class |
| Dead CSS classes (grep-confirmed) | **59 of 241** | includes `.balance-hero`, a 20-line signature surface whose markup was deleted from HomePage, and the entire 24-line `[popover]` block |
| Dead tokens | 17 declared, 0 uses | incl. `--on-danger-fill`; `--space-1`…`--space-8` 100% dead against 41 ad-hoc spacing values |

**The two big files are each several modules.** `PeoplePage.jsx` (1073 lines) holds four units — `PersonDetail` alone is 310 lines taking **13 drilled props** (`:462-476`) that are all already on the context it could read itself. `ocr.js` (972) splits cleanly on seams that already exist; the perspective block (`:451-684`) is pure geometry that is currently untestable in isolation.

**Scale is an accumulation, not a scale:** 28 distinct font sizes (11 of them between 11px and 15px), 13 radii, 20 shadows (5 of the 7 shadow tokens resolve to `none`), 11 transition durations (200ms used 14× against a declared 150/250/400 scale).

**User effort.** A realistic 6-item, 4-person dinner costs **~30 taps**, 12 of them (40%) on item assignment alone; 34 if you also share it, because saving dead-ends on Home and sharing costs 4 more taps through a 3-deep modal stack.

The repetition relief the README advertises doesn't reach the core flow: "Split again" chips work, but `logQuickSplit` can only create a *single evenly-split item*, so it can never repeat an itemized bill or hand off to the wizard. Groups do preload the wizard correctly — but you can only create one from an unlabelled FAB on the People tab, never from step 1 where the need is actually felt.

Also absent despite README claims: **no tip or percentage control exists anywhere**, and **currency is hardcoded PHP in three places** with no setting.

---

## Project-level

- **CI runs neither tests nor lint nor the contrast check.** `.github/workflows/deploy.yml` goes checkout → `npm install` → build → deploy. The contrast script was written because a regression shipped, and nothing runs it. **Highest leverage fix in this document: four lines of YAML.**
- Use `npm ci`, not `npm install` — there is a committed lockfile and the build is currently non-reproducible.
- `public/icon-original.png` is **530KB**, referenced by nothing, and ships to `dist/` on every deploy.
- `sw.js` `CACHE_NAME` is a manual `splurge-v9` bump — a human must remember it every deploy.
- No route-level code splitting (no `React.lazy` anywhere). Tesseract *is* correctly lazy-loaded; the 111KB-gzipped main chunk carries all five pages and every modal.
- Google Fonts loads from a third-party CDN in a personal-finance app, and the SW cannot cache opaque cross-origin responses — so the "offline-ready" claim ships fallback fonts offline.

---

## Suggested order

**1 — Stop the bleeding (half a day).** Findings 1–4 and 6, then write `split.test.js` with the property `Σ dues === total` to the centavo over generated assignments. That one test file is the highest-value artifact in this list: it kills findings 1 and 2 together and prevents their return. Then wire `npm test`, `npm run lint` and `check-contrast.mjs` into `deploy.yml`.

**2 — Stop the data loss (half a day).** Finding 5 — build `useUndoableAction` once and route person delete, group delete and wizard-discard through it.

**3 — Accessibility (one day).** Change the two thresholds in `check-contrast.mjs` to 4.5 and let the now-red script drive the work. Introduce `@layer` (finding 7, fixes six `!important`s for free), restore focus rings, use `--on-danger-fill`, remove `user-scalable=no`, raise tap targets.

**4 — Cut the repetition (two days).** The `<Sheet>` primitive (~140 duplicated lines → ~60), one `SETTLED_EPSILON`, one scan-variant map, split `PeoplePage.jsx` and `ocr.js`.

**5 — Then the flow.** Teach "this is me" on first run; let `logQuickSplit` repeat an itemized bill and hand off to the wizard; add group creation to wizard step 1; add tip; make currency a setting.

---

## One thing worth naming

The git history contains **four complete rethemes in 25 commits** — graphite & platinum → warm bronze on charcoal → glass → the portfolio's desk lamp → glass rebuilt. `index.css` has been touched 18 times, `NewBillPage.jsx` 24.

The visual direction keeps being *replaced* rather than *refined*, and each replacement leaves sediment: 59 dead classes, 17 dead tokens, 28 font sizes, a dead signature surface (`.balance-hero`) still sitting in the stylesheet. Meanwhile the money math underneath has never been given a test file.

The surface has been redesigned four times. The thing a bill-splitter is actually for has been rewritten zero times. **The next pass is worth spending below the surface.**
