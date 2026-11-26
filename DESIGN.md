# Splurge — Design System

**World:** Receipt paper. **Mode:** Operate. **Committed:** 2026-11-26.
This file is the contract. Components do not invent values; they consume tokens declared here.

---

## The idea

A bill splitter should feel like the thing it replaces: the paper receipt lying on the table between five people.

Not skeuomorphism — no torn-paper images, no curling drop-shadowed corners, no faux crumple. We take the *grammar* of a printed receipt and use it as interface structure:

- a **narrow column** (receipts are 58–80mm wide — natively mobile)
- **monospaced figures** in a right-aligned money column
- **dotted leaders** running from an item's name to its price
- **hairline rules** that separate, instead of boxes that contain
- **stamps** for status, instead of pills for status
- the quiet authority of a document that has already been printed

### Why this direction and not another

1. **It is product-specific.** No unrelated app could wear it unchanged — which is exactly the test the previous surface failed.
2. **It is structurally opposed to every AI tell.** No glass, no blur, no gradient, no indigo/violet, no three equal cards, no pill badges, no rounded-rect-with-border-and-shadow. Those patterns are not *banned* here; there is simply nowhere for them to sit.
3. **Mono is earned, not worn.** The craft floor refuses monospace as a costume for "technical". Here it carries money — measurement — which is precisely the case it is for.
4. **Paper has tooth.** A receipt is a physical object, which licenses grain, pressure and ink behaviour as real material properties rather than decoration.

### The use scene decides the default

This app opens at a restaurant table, at night, in dim light, on a phone held one-handed while four people watch. **Dark is not an afterthought mode — it is the primary scene.** Light mode is the morning-after scene: settling up, checking balances, at a desk.

So dark is designed first as *ink on carbon*, and light second as *ink on paper*. Neither is a tinted inversion of the other.

---

## Color

One gray family: **warm**. Every neutral carries a trace of yellow-red. No cool grays anywhere. All accents sit below 80% saturation.

### Light — "paper"

| Token | Value | Job |
|---|---|---|
| `--paper` | `#F6F3EC` | base; thermal-paper warm white. Never `#FFFFFF` |
| `--paper-raised` | `#FCFAF5` | the bill sheet, lifted off the base |
| `--paper-sunk` | `#EDE8DD` | inputs, pressed states, table headers |
| `--ink` | `#1C1917` | primary text. Never `#000000` |
| `--ink-2` | `#57534E` | secondary |
| `--ink-3` | `#6F6961` | tertiary — **darkened from the old #8A8178 to clear 4.5:1 on paper** |
| `--rule` | `#DDD6C9` | hairlines |
| `--rule-strong` | `#C4BBAA` | section breaks, the fold |
| `--stamp` | `#A32E25` | the one accent |
| `--ledger` | `#3A6349` | settled |

### Dark — "carbon"

| Token | Value | Job |
|---|---|---|
| `--paper` | `#141310` | base; warm charcoal |
| `--paper-raised` | `#1D1B16` | the sheet |
| `--paper-sunk` | `#0E0D0B` | inputs, wells |
| `--ink` | `#EDE8DD` | primary |
| `--ink-2` | `#B5AEA2` | secondary |
| `--ink-3` | `#8E8778` | tertiary — **clears 4.5:1 on `--paper`** |
| `--rule` | `#332F28` | hairlines |
| `--rule-strong` | `#4A443A` | section breaks |
| `--stamp` | `#E0695C` | the accent, brightened for carbon |
| `--ledger` | `#7FA98B` | settled |

### The two color rules

**Rule 1 — one accent, and it is a stamp.** `--stamp` is the only chromatic accent in the interface. It marks *money you are owed* and *the stamp mark itself*, and nothing else. It is never chrome: not nav, not focus, not brand furniture, not a decorative underline.

**Rule 2 — money is ink until it has a state.** An amount is `--ink` by default. It turns `--stamp` when owed to you and `--ledger` when settled. No other element may use either color. (The previous system's rule — "indigo is chrome and never touches money" — is inverted here: color *only* touches money.)

Chrome is ink and rules. That is the whole palette for every control, nav item and surface.

### Shadows

Receipts rest on a surface; they do not float. Shadows are warm-tinted, offset downward, never a zero-offset halo.

```
--shadow-sheet: 0 1px 2px rgba(60,48,32,.08), 0 8px 24px -12px rgba(60,48,32,.18);
--shadow-lift:  0 2px 4px rgba(60,48,32,.10), 0 16px 40px -16px rgba(60,48,32,.24);
```
In carbon both drop to near-black warm (`rgba(0,0,0,.5)`) and lean on `--rule` for edge definition instead.

---

## Type

Two faces, already loaded, no new dependency.

- **Geist** — interface: names, labels, buttons, body.
- **Geist Mono** — every number, every amount, every quantity, every machine-printed field, the wordmark. Always `font-variant-numeric: tabular-nums`.

A fully-mono interface would be costume. Mono is reserved for what a receipt printer would actually have printed.

### Scale — fixed rem, ratio ≈1.2

Replaces 28 ad-hoc sizes with seven steps. **The floor is 13px, not 11px** — the old 11px `.lab` micro-label was both the smallest type and the worst contrast in the app.

| Token | px | Use |
|---|---|---|
| `--text-micro` | 13 | labels, metadata, stamp text. **Floor.** |
| `--text-sm` | 15 | secondary rows, captions |
| `--text-base` | 17 | body, item names, inputs |
| `--text-md` | 20 | row totals, person names |
| `--text-lg` | 24 | section headings |
| `--text-xl` | 32 | bill total |
| `--text-display` | 44 | the balance figure on Home |

Tracking: `-0.02em` at `--text-xl` and above; `+0.08em` on mono micro-labels (receipts print loose); `0` elsewhere. Weights: 400 / 500 / 600 only — no 700, which reads as shouting on paper.

---

## Structure

### No cards

The sheet of paper is the only container, and it is usually the page itself. Rows are separated by hairlines, never boxed. Where a card seems necessary, the answer is a rule above and generous space below.

### The dotted leader — the signature move

An item row is: name, a dotted leader that absorbs all remaining width, then the price in mono, right-aligned.

```css
.leader { flex: 1; border-bottom: 1px dotted var(--rule-strong); margin: 0 .5rem .34em; }
```

This one detail does more identity work than any color choice, it is instantly legible as a receipt, and it solves the real layout problem of binding a variable-length name to a right-aligned figure.

### Radius — three values, down from thirteen

Receipts are cut, not rounded.

- `0` — sheets, rows, section edges
- `2px` — inputs, buttons, anything you press
- `999px` — avatars only

### Perforation

The top and bottom edge of a bill sheet carry a perforated cut, built with a repeating radial gradient — no image, no asset. Used **once per bill sheet**. The moment it appears on a nav bar or a settings panel it has become decoration and must come out.

### Grain

A single fixed, `pointer-events: none` overlay at ~2.5% opacity, generated from an inline SVG `feTurbulence`. Paper has tooth; this is the cheapest honest way to say so, and it is what keeps large flat fields from reading as sterile vector. One element, whole app.

### Spacing — 4px base, eight steps

`--space-1` … `--space-8` = 4, 8, 12, 16, 24, 32, 48, 64. The old system declared these and then used 41 ad-hoc values instead. Nothing ships a raw pixel value.

---

## Status is a stamp, not a pill

Pill badges are a category default and they are gone. Status is rendered as a rubber stamp: mono caps, `--text-micro`, letter-spaced, a 1.5px border in the status color, rotated `-4deg`, at 85% opacity, with the border very slightly broken so the ink reads as pressed rather than drawn.

`SETTLED` in `--ledger`. `PARTIAL` in `--ink-3`. Owed is not stamped — it is simply the amount in `--stamp`, because an unpaid debt is the default state of this app and does not need a label.

---

## Motion

150–250ms, state only, never decoration. Two authored moments in the whole product and no more:

1. **The stamp lands.** When a balance reaches settled, the `SETTLED` stamp scales from 1.18 → 1 with a slight rotation overshoot in ~220ms, ease-out. It is the emotional peak of the product — the moment a friend's debt closes — and it is the one place delight is spent.
2. **The sheet prints.** The review screen reveals top-to-bottom via `clip-path` over ~380ms, the way a thermal printer feeds. Once per bill, on the review step only.

Everything else: 180ms ease-out on state change. No page-load choreography; users arrive mid-task. Every one of these respects `prefers-reduced-motion`, which collapses both authored moments to an opacity fade.

---

## Icons

Lucide-everywhere is itself a recognised AI tell, and the audit found inconsistent stroke widths. Two-part answer:

- Lucide stays for the utility long tail, standardised at `strokeWidth={1.5}`, `24px`.
- The six identity-carrying glyphs — scan, split, person, settled-stamp, peso, and the nav marks — are **custom inline SVG**, drawn as single-weight ink strokes with squared caps, matching the stamp's pressed-ink logic.

Low cost, and it is the difference between a themed default set and a drawn one.

---

## Accessibility — non-negotiable, and the reason the old system failed

Everything below is a build requirement, not an aspiration. The previous system declared the right intentions and shipped the opposite; these are the specific traps.

- **Cascade order is `@layer tokens, base, components, utilities`.** The old file's a11y adaptation blocks targeted bare `:root` (0,1,0) while the light theme layers were (0,2,0), so *every* light-mode adaptation was dead. Layers make specificity irrelevant and fix six of the seven `!important`s for free.
- **Contrast:** body ≥4.5:1, large ≥3:1, **in both themes**, and `--ink-3` is checked at **4.5**, not 3.0 — it ships on 13px micro-labels, not large text. `scripts/check-contrast.mjs` must test the values components actually use, not the tokens the system wishes they used.
- **No component hardcodes a foreground.** `color: white` on a danger surface is what shipped 2.69:1 last time. Every on-color is a token.
- **Focus is visible on every interactive element, inputs included.** No rule may set `outline: none` without replacing the indicator in the same declaration. Focus ring: 2px `--ink`, 2px offset — ink, not accent, because the accent means money here.
- **Tap targets ≥44×44**, with the hit area extended by padding or a pseudo-element where the visual mark is deliberately smaller.
- **Reduced transparency / reduced motion / forced colors** all handled in the `utilities` layer so they cannot be out-specified.
- Minimum type size in the product is **13px**. There is no 11px.

---

## What this replaces

Prism — translucent glass panes over an ambient color wash, indigo chrome, mint/rose money. It is kept in git history as evidence and anti-reference, not extended. Its two stated rules were sound; its execution leaked (59 dead classes, 17 dead tokens, 28 font sizes, tinted-glass and indigo-on-money violations), and it was the fourth retheme in twenty-five commits. The sediment is not migrated. It is removed.
