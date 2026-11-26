/**
 * Settings, on the Sheet primitive.
 *
 * It was one of the five hand-rolled <dialog>s the audit counted, with its
 * own width, its own open/close effect and its own backdrop closer. All of
 * that now lives in <Sheet> and nowhere else.
 *
 * The theme control is a three-way choice — System, Light, Dark — rather than
 * a sun/moon toggle. A toggle is the category default and it cannot express
 * "follow the phone", which is both the default here and what most people
 * actually want; an override exists for the ones who deliberately run one app
 * against the grain.
 */
import { useRef, useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { useAppContext } from '../store/AppContext';
import { CURRENCIES, formatCurrency, symbolFor } from '../utils/format';
import { CADENCES, cadenceOf, nextDueAt } from '../utils/suggestions';
import Sheet from './ui/Sheet';
import Button from './ui/Button';
import Field from './ui/Field';
import Row from './ui/Row';
import './shell.css';

const PAY_METHODS = ['GCash', 'Maya', 'Bank'];

// "due in 3 days" / "due today" / "due 2 days ago" — a calendar date would
// be precise about something that is only ever roughly true, and the whole
// phrase is built here so an overdue split never reads as a future one.
function formatDue(ms, now = Date.now()) {
  const days = Math.round((ms - now) / 86400000);
  if (ms <= now) {
    if (days === 0) return 'due today';
    return days === -1 ? 'due yesterday' : `due ${-days} days ago`;
  }
  if (days === 0) return 'due later today';
  return days === 1 ? 'due tomorrow' : `due in ${days} days`;
}

const APPEARANCE = [
  { id: 'auto', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

// Shrink an uploaded QR image to a compact data URL (localStorage-friendly).
async function imageToDataUrl(file, max = 512) {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.src = url;
  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function SettingsModal({ open, onClose }) {
  const fileRef = useRef(null);
  const qrFileRef = useRef(null);
  const {
    people, groups, meId, setMeId,
    usual, setUsual, usualCrew,
    templates, updateTemplate, removeTemplate,
    payInfo, setPayInfo,
    exportData, importData, clearAll,
    bills, payments,
    currency, setCurrency, totalOwedToYou,
  } = useAppContext();
  const [confirmClear, setConfirmClear] = useState(false);
  const [toast, setToast] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [savingQr, setSavingQr] = useState(false);
  const { theme, resolved, setTheme } = useTheme();

  const handleClose = () => {
    setConfirmClear(false);
    setToast('');
    onClose();
  };

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  };

  const handleExport = () => {
    try {
      const blob = new Blob([exportData()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `splurge-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      flash('Backup downloaded.');
    } catch {
      flash('That backup could not be written. Try again.');
    }
  };

  const handleQrFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSavingQr(true);
    try {
      const qr = await imageToDataUrl(file);
      setPayInfo({ method: 'GCash', ...(payInfo || {}), qr });
      flash('QR saved.');
    } catch {
      flash('That image could not be read.');
    } finally {
      setSavingQr(false);
    }
  };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setRestoring(true);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importData(reader.result);
        flash('Data restored.');
      } catch {
        flash('That file is not a Splurge backup.');
      } finally {
        setRestoring(false);
      }
    };
    reader.onerror = () => {
      setRestoring(false);
      flash('That file could not be read.');
    };
    reader.readAsText(file);
  };

  return (
    <>
      <Sheet open={open} title="Settings" size="md" onClose={handleClose}>
        <section className="setting" aria-labelledby="set-appearance">
          <h3 className="setting__title" id="set-appearance">
            Appearance
          </h3>
          <p className="setting__body">
            {theme === 'auto'
              ? `Following your phone, which is ${resolved} right now.`
              : `Always ${theme}, whatever your phone is set to.`}
          </p>
          <div className="chips" role="radiogroup" aria-labelledby="set-appearance">
            {APPEARANCE.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={theme === opt.id}
                className="chip"
                onClick={() => setTheme(opt.id)}
              >
                {theme === opt.id ? <Check size={16} strokeWidth={1.5} aria-hidden="true" /> : null}
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        <section className="setting" aria-labelledby="set-currency">
          <h3 className="setting__title" id="set-currency">
            Currency
          </h3>
          <p className="setting__body">
            Amounts are written in this currency. Switching it converts nothing — every
            figure keeps the number it already has.
            {totalOwedToYou > 0
              ? ` The ${formatCurrency(totalOwedToYou)} you are owed is that same amount, written a different way.`
              : ''}
          </p>
          <div className="chips" role="radiogroup" aria-labelledby="set-currency">
            {CURRENCIES.map((c) => {
              const active = c.code === currency;
              return (
                <button
                  key={c.code}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className="chip"
                  onClick={() => setCurrency(c.code)}
                >
                  {active ? <Check size={16} strokeWidth={1.5} aria-hidden="true" /> : null}
                  {symbolFor(c.code)} {c.code} · {c.name}
                </button>
              );
            })}
          </div>
        </section>

        <section className="setting" aria-labelledby="set-me">
          <h3 className="setting__title" id="set-me">
            This is me
          </h3>
          <p className="setting__body">
            Tag yourself and your own share stops counting as money owed to you.
          </p>
          {people.length === 0 ? (
            <p className="u-ink-3">
              Add people to a split first, then come back and tag yourself.
            </p>
          ) : (
            <div className="chips" role="radiogroup" aria-labelledby="set-me">
              {people.map((p) => {
                const isMe = p.id === meId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={isMe}
                    className="chip"
                    onClick={() => setMeId(isMe ? null : p.id)}
                  >
                    {isMe ? <Check size={16} strokeWidth={1.5} aria-hidden="true" /> : null}
                    {p.name}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="setting" aria-labelledby="set-usual">
          <h3 className="setting__title" id="set-usual">
            Who you usually split with
          </h3>
          <p className="setting__body">
            {usualCrew.ids.length > 0
              ? `Every new split opens with ${usualCrew.label} already on it, said so on the screen and removable in one tap.`
              : 'Pick a person or a crew and every new split opens with them already on it. If it is nearly always the same person, this is the whole setting.'}
          </p>
          {people.length === 0 ? (
            <p className="u-ink-3">Add people to a split first, then come back and pick.</p>
          ) : (
            <div className="chips" role="radiogroup" aria-labelledby="set-usual">
              <button
                type="button"
                role="radio"
                aria-checked={!usual}
                className="chip"
                onClick={() => setUsual(null)}
              >
                {!usual ? <Check size={16} strokeWidth={1.5} aria-hidden="true" /> : null}
                Nobody
              </button>
              {people.map((p) => {
                const on = usual?.kind === 'person' && usual.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className="chip"
                    onClick={() => setUsual({ kind: 'person', id: p.id })}
                  >
                    {on ? <Check size={16} strokeWidth={1.5} aria-hidden="true" /> : null}
                    {p.name}
                  </button>
                );
              })}
              {groups.map((g) => {
                const on = usual?.kind === 'group' && usual.id === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className="chip"
                    onClick={() => setUsual({ kind: 'group', id: g.id })}
                  >
                    {on ? <Check size={16} strokeWidth={1.5} aria-hidden="true" /> : null}
                    {g.name}
                    <span className="u-sr-only">, a crew</span>
                    <span className="chip__count" aria-hidden="true">{g.peopleIds.length}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="setting" aria-labelledby="set-repeats">
          <h3 className="setting__title" id="set-repeats">
            Splits that come round
          </h3>
          <p className="setting__body">
            Rent monthly, groceries weekly. Home asks you when one falls due and you
            type the amount — it never makes the split on its own.
          </p>
          {templates.length === 0 ? (
            <p className="u-ink-3">
              Nothing saved yet. Log a repeat from the suggestions on Home and say there
              how often it comes round.
            </p>
          ) : (
            templates.map((t) => {
              const due = nextDueAt(t);
              return (
                <div key={t.id} className="section__more">
                  <Row
                    name={t.title}
                    note={`${t.people.length} ${t.people.length === 1 ? 'person' : 'people'}${
                      due ? ` · ${formatDue(due)}` : ' · no reminder'
                    }`}
                    figure={t.amount > 0 ? formatCurrency(t.amount) : '—'}
                  />
                  <div
                    className="chips"
                    role="radiogroup"
                    aria-label={`How often ${t.title} comes round`}
                  >
                    {CADENCES.map((c) => {
                      const on = cadenceOf(t.cadence).id === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          className="chip"
                          onClick={() => updateTemplate(t.id, { cadence: c.id, snoozedUntil: null })}
                        >
                          {on ? <Check size={16} strokeWidth={1.5} aria-hidden="true" /> : null}
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                  <Button
                    variant="quiet"
                    className="section__more"
                    onClick={() => removeTemplate(t.id)}
                  >
                    Forget {t.title}
                  </Button>
                </div>
              );
            })
          )}
        </section>

        <section className="setting" aria-labelledby="set-paid">
          <h3 className="setting__title" id="set-paid">
            Getting paid
          </h3>
          <p className="setting__body">
            Added to every request you send, so friends know where the money goes.
          </p>
          <div className="chips" role="radiogroup" aria-labelledby="set-paid">
            {PAY_METHODS.map((m) => {
              const active = (payInfo?.method || 'GCash') === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className="chip"
                  onClick={() => setPayInfo({ ...(payInfo || {}), method: m })}
                >
                  {active ? <Check size={16} strokeWidth={1.5} aria-hidden="true" /> : null}
                  {m}
                </button>
              );
            })}
          </div>

          <Field
            className="section__more"
            label="Number or account"
            type="tel"
            inputMode="tel"
            placeholder="0917 123 4567"
            value={payInfo?.number || ''}
            onChange={(v) => setPayInfo({ method: 'GCash', ...(payInfo || {}), number: v })}
          />

          <div className="u-row section__more">
            <Button
              variant="quiet"
              block
              loading={savingQr}
              onClick={() => qrFileRef.current?.click()}
            >
              {payInfo?.qr ? 'Replace QR' : 'Add payment QR'}
            </Button>
            {payInfo?.qr ? (
              <>
                <Button variant="quiet" onClick={() => setQrOpen((v) => !v)}>
                  {qrOpen ? 'Hide' : 'Show'}
                </Button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setPayInfo({ ...(payInfo || {}), qr: null })}
                >
                  <Trash2 size={20} strokeWidth={1.5} aria-hidden="true" />
                  <span className="u-sr-only">Remove QR</span>
                </button>
              </>
            ) : null}
            <input
              ref={qrFileRef}
              type="file"
              accept="image/*"
              onChange={handleQrFile}
              className="u-sr-only"
              tabIndex={-1}
              aria-hidden="true"
            />
          </div>
          {qrOpen && payInfo?.qr ? (
            <img className="setting__qr section__more" src={payInfo.qr} alt="Your payment QR code" />
          ) : null}
        </section>

        <section className="setting" aria-labelledby="set-data">
          <h3 className="setting__title" id="set-data">
            Your data
          </h3>
          <p className="setting__body">
            {bills.length} {bills.length === 1 ? 'split' : 'splits'} and {payments.length}{' '}
            {payments.length === 1 ? 'payment' : 'payments'} live on this device only. Back
            them up before you clear your browser or change phones.
          </p>
          <div className="u-row">
            <Button variant="quiet" block onClick={handleExport}>
              Back up
            </Button>
            <Button
              variant="quiet"
              block
              loading={restoring}
              onClick={() => fileRef.current?.click()}
            >
              Restore
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportFile}
              className="u-sr-only"
              tabIndex={-1}
              aria-hidden="true"
            />
          </div>
        </section>

        <section className="setting" aria-labelledby="set-clear">
          <h3 className="setting__title" id="set-clear">
            Clear everything
          </h3>
          {confirmClear ? (
            <>
              <p className="setting__body">
                This deletes every person, split and payment on this device. It cannot be
                undone, and a backup is the only way back.
              </p>
              <div className="u-row">
                <Button variant="quiet" block onClick={() => setConfirmClear(false)}>
                  Keep my data
                </Button>
                <Button
                  variant="danger"
                  block
                  onClick={() => {
                    clearAll();
                    setConfirmClear(false);
                    flash('Everything was cleared.');
                  }}
                >
                  Delete all
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="setting__body">
                Removes every person, split and payment stored here.
              </p>
              <Button variant="quiet" block onClick={() => setConfirmClear(true)}>
                Clear all data
              </Button>
            </>
          )}
        </section>

        {/* Reported inside the sheet, not in the app's toast: a <dialog> is in
            the top layer, so a toast behind it would never be seen. */}
        <p className="setting__status" role="status">
          {toast}
        </p>
      </Sheet>
    </>
  );
}
