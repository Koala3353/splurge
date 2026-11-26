import Sheet from './ui/Sheet.jsx';
import Button from './ui/Button.jsx';
import Row from './ui/Row.jsx';
import {
  variantLabel, variantHint, sourceLabel, confidenceBand, confidenceVerdict,
} from '../utils/ocr';
import './newbill/newbill.css';

/**
 * What the scan did, said plainly, and the cheapest way on from it.
 *
 * Two deliberate departures from what shipped here before:
 *
 * 1. **The labels and the confidence bands come from `utils/ocr`.** This file
 *    carried its own copy of both, with thresholds at 80/60 against the
 *    engine's 75/55, so a 78% scan rendered green on one screen and amber on
 *    the next. There is one source now and this is a consumer of it.
 *
 * 2. **Confidence is not coloured, and does not claim the numbers are right.**
 *    Measured against CORD-v2, engine confidence does not predict whether the
 *    parse is correct — a confident read of a clear photo can still attach
 *    the wrong price. So it is presented as a fact about the *image*, in ink,
 *    and the headline action is to go and check the lines. (`confidenceTone`
 *    exists in utils/ocr but resolves to --success / --accent-color /
 *    --danger, none of which exist in this palette; colour here would also
 *    break the rule that only money is chromatic.)
 */
export default function ScanResultDialog({ open, info, onClose, onRescan }) {
  const confidence = Math.round(info?.confidence ?? 0);
  const itemCount = info?.itemCount ?? 0;
  const verdict = info ? confidenceVerdict(confidence, itemCount) : null;
  const band = confidenceBand(confidence);

  return (
    <Sheet
      open={open && !!info}
      title="What the scan got"
      onClose={onClose}
      footer={
        <Button variant="solid" onClick={onClose}>
          Check the lines
        </Button>
      }
    >
      {info && verdict ? (
        <div className="u-stack-loose">
          <section>
            <h3 className="section__label">{verdict.head}</h3>
            <p className="u-ink-2">{verdict.body}</p>
            <p className="u-ink-3" style={{ fontSize: 'var(--text-sm)', marginBlockStart: 'var(--space-3)' }}>
              Across 60 photographed receipts this scanner found about 4 in 10
              lines, and put the right price on about 8 of every 10 it found.
              Correcting a few is the normal way through, not a sign anything
              went wrong.
            </p>
          </section>

          <section>
            <h3 className="section__label">What came back</h3>
            <ul>
              <li>
                <Row
                  name="Lines found"
                  figure={`${itemCount}`}
                  note={info.feeCount ? `plus ${info.feeCount} ${info.feeCount === 1 ? 'fee' : 'fees'}` : undefined}
                />
              </li>
              <li>
                <Row
                  name="Certainty about the image"
                  note={`${band === 'good' ? 'Clear photo' : band === 'fair' ? 'Mixed photo' : 'Difficult photo'} — it says nothing about whether the prices are right`}
                  figure={`${confidence}%`}
                />
              </li>
              <li>
                <Row name="Read as" figure={variantLabel(info.variant)} />
              </li>
              <li>
                <Row
                  name="Image used"
                  figure={sourceLabel(info.source || (info.cropped ? 'crop' : 'full'))}
                />
              </li>
              {info.orientation ? (
                <li>
                  <Row
                    name="Orientation"
                    figure={`Turned ${info.orientation > 0 ? '90°' : '-90°'}`}
                  />
                </li>
              ) : null}
              <li>
                <Row name="Passes" figure={`${info.attempts} of ${info.tried}`} />
              </li>
            </ul>
            <p className="u-ink-3" style={{ fontSize: 'var(--text-micro)', marginBlockStart: 'var(--space-2)' }}>
              {variantHint(info.variant)}
            </p>
          </section>

          {info.preview ? (
            <section>
              <h3 className="section__label">What the scanner saw</h3>
              <img className="shot" src={info.preview} alt="The receipt as the recogniser received it" />
              <p className="u-ink-2" style={{ fontSize: 'var(--text-sm)', marginBlockStart: 'var(--space-2)' }}>
                If that looks cut off, skewed or washed out, the photo is the
                problem rather than the reading — a flatter, better-lit retake
                beats editing the lines by hand.
              </p>
            </section>
          ) : null}

          <Button block onClick={onRescan}>Scan a different photo</Button>
        </div>
      ) : null}
    </Sheet>
  );
}
