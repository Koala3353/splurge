import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import Button from './ui/Button.jsx';
import Row from './ui/Row.jsx';
import { variantLabel, variantHint, confidenceBand } from '../utils/ocr';
import './newbill/newbill.css';

/**
 * The standing summary of the scan that produced the lines below it.
 *
 * Which treatment won is genuinely useful — it is the difference between
 * "retake the photo" and "this receipt just prints faintly" — so it stays
 * visible while the lines are being corrected.
 *
 * The labels and bands come from `utils/ocr`; the divergent local copy that
 * used to live here read 75/55 against the dialog's 80/60. Confidence is
 * shown in ink and described as a property of the image: measured against
 * CORD-v2 it does not predict whether the parse is right, so nothing here
 * may imply a high number means correct numbers.
 */
export default function ScanDiagnostics({ info, onRescan }) {
  const [open, setOpen] = useState(false);
  if (!info) return null;

  const confidence = Math.round(info.confidence ?? 0);
  const band = confidenceBand(confidence);
  const facts = [
    info.orientation ? 'turned upright' : 'upright',
    info.cropped ? 'cropped to the receipt' : 'whole photo',
    info.psm === '4' ? 'column mode' : 'block mode',
    ...(info.relaid ? ['prices re-paired from word positions'] : []),
  ];

  return (
    <section className="notice" aria-labelledby="scan-summary">
      <div className="u-row" style={{ alignItems: 'flex-start' }}>
        {info.preview ? (
          <img className="shot shot--thumb" src={info.preview} alt="What the scanner read" />
        ) : null}

        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="notice__title" id="scan-summary">
            {variantLabel(info.variant)}
          </h2>
          <p className="notice__body">
            {facts.join(' · ')}
          </p>
          <p className="notice__body">
            {info.itemCount} {info.itemCount === 1 ? 'line' : 'lines'}
            {info.feeCount > 0 ? `, ${info.feeCount} ${info.feeCount === 1 ? 'fee' : 'fees'}` : ''}
            {info.attempts > 1 ? ` · ${info.attempts} passes` : ''}
            {' · '}
            {band === 'good' ? 'clear photo' : band === 'fair' ? 'mixed photo' : 'difficult photo'}
            {' '}
            <span className="u-mono">{confidence}%</span>
          </p>
        </div>

        <button
          type="button"
          className="icon-btn"
          aria-expanded={open}
          aria-controls="scan-detail"
          onClick={() => setOpen((v) => !v)}
        >
          {open
            ? <ChevronUp size={24} strokeWidth={1.5} aria-hidden="true" />
            : <ChevronDown size={24} strokeWidth={1.5} aria-hidden="true" />}
          <span className="u-sr-only">{open ? 'Hide the scan detail' : 'Show the scan detail'}</span>
        </button>
      </div>

      {open ? (
        <div id="scan-detail" className="u-stack" style={{ marginBlockStart: 'var(--space-4)' }}>
          <p className="notice__body">{variantHint(info.variant)}</p>

          <ul>
            <li>
              <Row
                name="Certainty about the image"
                note="Not a claim about the prices — check those against the paper"
                figure={`${confidence}%`}
              />
            </li>
            <li>
              <Row name="Passes" figure={`${info.attempts} of ${info.tried}`} />
            </li>
          </ul>

          <h3 className="section__label">The raw text it read</h3>
          <pre className="raw">{info.text?.trim() || 'Nothing came back.'}</pre>

          {onRescan ? (
            <Button block onClick={onRescan}>Scan a different photo</Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
