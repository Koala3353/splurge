/**
 * Button — the whole button vocabulary.
 *
 *   <Button variant="solid" onClick={save}>Save the split</Button>
 *   <Button variant="danger" loading={deleting}>Delete Ana</Button>
 *
 * Variants: solid (the one primary action on a screen), quiet (everything
 * else), danger (destructive). Destructive is carried by a heavier border and
 * copy that names what goes — not by colour, because --stamp marks money and
 * only money. No foreground is written here: `color: white` on a danger fill
 * is what shipped at 2.69:1 last time, and there is nowhere in this component
 * for a literal colour to live.
 *
 * Loading keeps the label and adds a printer-feed ellipsis, so the button
 * does not change width or lose its name mid-action. It is reduced-motion
 * safe (the dots stop; the label stays).
 */
const VARIANTS = { solid: 'btn--solid', quiet: 'btn--quiet', danger: 'btn--danger' };

export default function Button({
  variant = 'quiet',
  type = 'button',
  block = false,
  loading = false,
  disabled = false,
  className = '',
  children,
  ...rest
}) {
  return (
    <button
      type={type}
      className={['btn', VARIANTS[variant] ?? VARIANTS.quiet, block && 'btn--block', className]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      <span>{children}</span>
      {loading ? (
        <span className="btn__feed" aria-hidden="true">
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      ) : null}
    </button>
  );
}
