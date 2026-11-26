# ocr-eval — measuring the receipt pipeline against real photos

The README's "Known gaps" used to say that all OCR validation was synthetic.
This is the thing that closes that gap: a scored harness that runs the **real**
`src/utils/ocr.js` + `src/utils/receipt.js` over photographed receipts with
ground-truth annotations, and prints numbers you can diff between runs.

## The corpus

**CORD-v2** — `naver-clova-ix/cord-v2` on Hugging Face (Clova OCR Receipt
Dataset, Park et al. 2019), **licensed CC BY 4.0**. ~1,000 photographed
Indonesian restaurant receipts with per-line-item annotations (`menu.nm`,
`menu.price`, `menu.cnt`) plus `sub_total` (subtotal / tax / service charge /
discount) and `total.total_price` — exactly the fields this parser outputs.

Two caveats worth knowing before reading any number out of this harness:

- **Indonesian number formatting.** CORD writes rupiah as `60.000` meaning
  sixty thousand; this parser, built for peso receipts, reads the dot as a
  decimal point and returns `60.00`. The scorer therefore treats prices as
  equal up to a power-of-ten factor. It is measuring *"did the right number
  land on the right item"*, not *"did we get the currency convention right"*.
- **Indonesian item names.** Recall is measured with fuzzy name matching
  (normalised edit similarity ≥ 0.6), because OCR of thermal print is never
  character-exact. The absolute numbers would be higher on an English corpus;
  the *relative* numbers between runs are what the harness is for.

## Getting the data

The dataset is **not** committed and must not live inside the repo. Put it in
its own empty directory outside the project and pass the path in. Anything
downloaded is untrusted data: this harness only ever *reads* it, never
executes it, and never runs with it as the working directory.

```sh
DATA=/some/empty/dir/receipt-data
node scripts/ocr-eval/fetch-cord.mjs "$DATA" test 100
node scripts/ocr-eval/fetch-cord.mjs "$DATA" validation 100
```

That writes `$DATA/images/*.jpg` and `$DATA/<split>-gt.jsonl`.

## Running it

`@napi-rs/canvas` supplies the canvas the pipeline draws on under Node. It is
deliberately not an app dependency (prebuilt native binary; the app never runs
in Node), so either add it as a devDependency or point the harness at a
directory that has it:

```sh
npm i -D @napi-rs/canvas          # or: --canvas-dir /path/with/node_modules

node scripts/ocr-eval/run.mjs --data "$DATA" --limit 50
node scripts/ocr-eval/run.mjs --data "$DATA" --limit 50 --legacy --label baseline
node scripts/ocr-eval/run.mjs --data "$DATA" --limit 50 --label candidate \
  --compare scripts/ocr-eval/results/baseline.json
```

Set `OCR_EVAL_DATA` / `OCR_EVAL_CANVAS_DIR` to drop the flags.

Suggested `package.json` script (not added here — package.json is owned
elsewhere):

```json
"ocr-eval": "node scripts/ocr-eval/run.mjs --limit 50"
```

Per-receipt results land in `scripts/ocr-eval/results/<label>.json`, so runs
are diffable and a regression can be traced to the receipt that caused it.
`debug.mjs <image> --raw` dumps the recognised text, the chosen variant and the
parse for a single photo — the fastest way to tell "preprocessing destroyed
it" from "the parser dropped it".

## What is scored

| metric | meaning |
|---|---|
| line-item recall / precision / F1 | did each printed item become a row, and was each row a real item |
| price-attachment accuracy | of the items we found, how often the **right price** is bound to the **right name** — this is where two-column receipts break |
| strict (name+price) F1 | both at once; the metric that actually matters for splitting money |
| bill total agrees | parsed items + fees sum to the printed total |
| service-charge / discount recall | fee lines the parser promotes to shared adjustments |
| summary rows leaked | totals/tax/change lines that slipped into the item list |
| mean / median / p90 time | wall-clock per receipt (Node; a browser is faster — this path PNG-encodes every candidate) |

The run also prints a **confidence calibration** table: strict F1 bucketed by
the engine confidence the UI shows the user. If those two stop correlating,
the confidence badge is lying and the thresholds in `src/utils/ocr/labels.js`
need re-deriving.

## A dev slice and a holdout slice

Receipts are sorted by id, so `--limit 60` and `--offset 60 --limit 60` are two
disjoint, reproducible slices. Everything is tuned against the first and
confirmed on the second; a number that only moves on the dev slice is a number
that was fitted, and the second pass says so wherever that applies.

```sh
node scripts/ocr-eval/run.mjs --data "$DATA" --limit 60 --label dev
node scripts/ocr-eval/run.mjs --data "$DATA" --offset 60 --limit 60 --label holdout
```

## What the corpus cannot tell you

CORD-v2 is photographed, but it is photographed **well**. Measured over the 60
scored receipts, per-receipt strict F1 correlates with:

| image measure | r vs strict F1 |
|---|---|
| illumination non-uniformity (6×6 tile-mean std) | 0.03 |
| tile-mean range (worst-to-best lit) | 0.06 |
| Laplacian variance (sharpness) | 0.15 |
| blown highlights | 0.11 |
| crushed blacks | −0.00 |
| mean luminance | −0.02 |

Whatever makes these receipts hard, **it is not the lighting**. So a change
aimed at shadow, hard-edged shade, steep angle or thermal fade cannot be
credited — or refuted — by this harness, and anyone who quotes a CORD delta as
evidence about shadows is quoting noise.

`synthetic.mjs` exists for that. It degrades receipts the pipeline already
reads well by a known, repeatable amount and re-scores them:

```sh
node scripts/ocr-eval/synthetic.mjs --data "$DATA" \
  --from scripts/ocr-eval/results/holdout.json --take 8
```

Its numbers are **synthetic and must never be quoted beside the CORD table**.
What they measure is how much of a good read survives a named insult.

## Measured results

Node 24 on an M-series Mac. Two disjoint 60-receipt slices (152 and 134
annotated line items). `control` is the pipeline as the first pass left it,
re-measured rather than quoted — see the staleness note below.

| metric | control | **now** (dev) | **now** (holdout) |
|---|---|---|---|
| line-item recall | 42.8% / 40.3% | **56.6%** | **56.7%** |
| line-item precision | 57.0% / 58.7% | **63.2%** | **63.9%** |
| line-item F1 | 48.9% / 47.8% | **59.7%** | **60.1%** |
| price-attachment accuracy | 78.5% / 88.9% | **84.9%** | 86.8% |
| strict (name+price) F1 | 38.3% / 42.5% | **50.7%** | **52.2%** |
| bill total agrees | 15.0% / 26.7% | **26.7%** | 26.7% |
| summary rows leaked | 17 / 13 | **13** | 14 |
| receipts yielding nothing | 7 / 15 | **5** | **4** |
| mean / median time | 3.14s / 1.97s | 3.48s / **1.35s** | 3.04s / 1.45s |

(control column is dev / holdout.) The two slices move together, which is the
point of having two: +10.8pp and +12.3pp item F1, +12.4pp and +9.7pp strict F1.

### Re-measure before you compare

`results/revamp.json` is **stale**. The pipeline is deterministic — two runs
over the same eight receipts produced byte-identical text — yet it reproduces
*none* of revamp.json's texts, so that file was written by code that no longer
matches the tree. Numbers in it, and the ones derived from it in the repo
README, describe a pipeline nobody can run any more.

Rule, therefore: **re-run the control in the same session as the candidate.**
A stored summary is a record, not a baseline.

### Which change did the work

Four changes, measured one at a time. The three parser changes were A/B'd by
replaying the *same frozen OCR text* through old and new parsers, so they are
exact comparisons rather than two noisy runs.

| run (dev slice) | item F1 | strict F1 |
|---|---|---|
| control | 48.9% | 38.3% |
| + price-column detection | 50.2% | 39.9% |
| + garbled summary-label guard | 51.7% | 41.1% |
| + next-line amount join | 53.2% | 42.7% |
| **+ illumination flattening** | **59.7%** | **50.7%** |

Those parser rows are in-sample. The bundle is not: on the untouched holdout
slice the same three changes moved item F1 47.8% → 53.3% and strict 42.5% →
46.3%, and illumination flattening then took them to 60.1% / 52.2%.

**Look at the failures before theorising.** For every ground-truth item the
parser missed, the harness asks a single question: *is its name present in the
recognised text?* That one split names the bucket.

| bucket (control, dev slice, 84 misses) | n |
|---|---|
| name WAS in the text — parser lost it | 44 |
| ·· amount detected, row rejected | 22 |
| ·· digits present, no trailing amount matched | 9 |
| ·· name-only line, amount on the next line | 5 |
| ·· name-only line, no amount anywhere near | 7 |
| name was NOT in the text — the image lost it | 40 |

1. **Amounts are printed in a column, and the parser was reading them one line
   at a time.** The bare-integer path caps values at 9,999 to reject ZIP codes,
   table numbers and order IDs. On receipts that print undecimalised,
   ungrouped prices (`J.STB PROMO       17500`) that cap silently discarded
   every item on the bill. `detectPriceColumn` finds the right-aligned column
   by clustering the position of each amount's **last digit** — the only part
   of a match that survives both the differences between the patterns in
   `detectTrailingAmount` and the OCR junk that trails a garbled column — and
   lifts the cap for lines that sit in it. A number that lines up with four
   other amounts is not a table number, so the protection is not reopened:
   without a column, five-figure bare integers are still refused.
2. **Garbled summary labels were being sold as dishes.** `TOVAL`, `lotal`,
   `Totals`, `CRANDTOTAL`, `ASH` — each reached the item list carrying the
   bill's **total** as its price, which is the most expensive kind of wrong row
   because it looks plausible and it is the largest number on the receipt.
   These are short words, so the existing ≥5-char fuzzy pass could not see
   them. `looksLikeSummaryLabel` matches them within one edit, but only when
   the garble is essentially the whole label (one or two tokens), so
   "Totchos" and "Taho" survive.
3. **Some receipts don't print the amount beside the name at all.** The name
   takes a full-width line and the money sits underneath, usually with a
   quantity breakdown. A following line that carries an amount and nothing
   else nameable — short alpha tokens are currency marks and OCR crumbs — is
   that continuation, and is now joined to the name above it.
4. **Three structural steps were still global, and a shadow is what they
   split on.** The per-pixel binarization is already local and copes with
   uneven light. But the crop, the paper-quad detection and the sideways probe
   each run a *global* Otsu split to separate paper from table. Put half the
   receipt in shade and that split lands between the lit half and the shaded
   half: the crop keeps only the bright part of the receipt and the quad is
   built from the wrong corners. `flattenIllumination` divides the analysis
   probe by a heavily blurred copy of itself — an O(pixels) box blur over an
   integral image — which removes the low-frequency lighting and leaves
   reflectance, which is what "is this paper?" was asking all along. **This
   single change is worth more than all three parser changes together.**

### What it cost

Illumination flattening runs twice per scan, on the ~1000px analysis probe,
never on the full photo. Mean time 3.14s → 3.48s on dev (+11%) and 2.70s →
3.04s on holdout (+13%). The **median improved** on dev (1.97s → 1.35s),
because a correct crop ends the candidate race sooner; the p90 got worse on
the holdout (7.00s → 10.46s). For +12pp strict F1 that is a trade worth making,
and the mean is still inside half the 45s scan timeout.

### Robustness to the things CORD cannot show

Synthetic degradations of 8 holdout receipts the pipeline already reads well.
**These are not CORD numbers and must not be quoted as if they were.**
Strict F1, illumination flattening off / on:

| insult | off | on |
|---|---|---|
| none (control) | 88.2% | **100.0%** |
| smooth lighting gradient | 66.7% | **94.4%** |
| hard-edged shade line | 41.4% | 32.3% *(worse)* |
| steep perspective | 58.8% | 52.9% *(worse)* |
| defocus blur | 57.1% | 45.7% *(worse)* |
| thermal fade | 70.6% | **83.3%** |

Read that honestly. Flattening wins on a clean shot, on a smooth gradient and
on faded print, and **loses on a hard shade line, on a steep angle and on
blur**. The mechanism is visible in the failure: a box blur across a hard
shadow edge leaves a halo, dividing by it over- and under-corrects either side
of the edge, and the paper/table split then lands on the halo rather than on
the paper.

It ships anyway, because the evidence is not symmetric: the regressions are
8 receipts and ~30 items — two or three items each — while the CORD gain is
120 real receipts across two disjoint slices moving together by +12pp strict
F1. The hard-shadow case is the **next thing to attack**, with an
edge-preserving illumination estimate (a large-radius median, or a bilateral
pass) instead of a box blur.

The hard shade line is also the single worst insult in the table either way,
which is worth knowing on its own: it costs more than a steep angle, more than
blur and far more than faded print.

See `results/synthetic-flatten.json` and `results/pass2-ablation.json`.

### What the first pass found (kept for the record)

The first revamp moved item F1 17.4% → 45.1% against the pre-revamp pipeline
(`--legacy`). Three findings, still true:

1. **The orientation detector was wrong on a third of the corpus and the race
   could not tell.** 21 of 60 receipts were read at ±90°, and every one of them
   returned zero correct items. `orientationPhotoGuard` and
   `rotationNeedsStrongEvidence` cut that to 2 of 60.
2. **The parser threw away every five-figure price.** Thousands-grouped amounts
   fell through to a bare-integer path capped at 9,999. That one rule was most
   of the first pass's gain — and the second pass found the same cap costing
   items again, in the layouts that group nothing at all (see
   price-column detection above).
3. **The perspective unwarp fired on blobs that were not receipts.**
   `quadIsPlausible` rejects collapsed and lopsided quads.

Its numbers are **not reproducible** from this tree — see "Re-measure before
you compare". Treat them as narrative, not as a baseline.

### Honest caveats

- CORD is Indonesian. Rupiah amounts frequently exceed the parser's ₱100,000
  implausible-price ceiling, so some ground-truth items are unreachable by
  construction. That ceiling is right for the app's market and was left alone.
- The fee keyword list is English/Filipino, so service-charge and discount
  recall are close to unmeasurable here. The 0/8 → 2/8 move is real but tiny.
- Node PNG-encodes every candidate before recognition; the browser hands the
  canvas straight over. Treat the times as comparable to each other, not as
  device timings.
- **Engine confidence still does not predict accuracy**, and nothing in the
  pipeline branches on it. Second pass, dev slice: strict F1 47.1% below 58%
  confidence and 82.8% from 58–77 — which looks like separation until you
  notice n=7 in the upper band and that the holdout shows nothing of the kind.
  Leave `src/utils/ocr/labels.js` presentational.
- The `flattenIllumination` knob is in `DEFAULT_TUNING`, so the whole
  illumination change can be ablated with
  `--tuning flattenIllumination=false` on `synthetic.mjs`, or by flipping it
  in `src/utils/ocr/candidates.js` for a `run.mjs` pass. `LEGACY_TUNING` has
  it off.
- `results/` now holds `control.json` / `holdout-control.json` (before) and
  `flatten-dev.json` / `flatten-holdout.json` (after), plus
  `pass2-ablation.json` and `synthetic-flatten.json` as the written-up record.
