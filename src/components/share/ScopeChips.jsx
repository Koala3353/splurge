/**
 * ScopeChips — who the message is addressed to.
 *
 *   <ScopeChips scopes={scopes} activeId="" onPick={setScope} />
 *
 * The count used to be a bare <span> dropped inside the button's label span,
 * which is a single flex item, so it printed as "Everyone who owes you3". A
 * count is a figure: it is mono, it is set apart from the words, and it is
 * boxed so it reads as a quantity rather than the last character of a name.
 *
 * The visible figure is decorative; the chip carries the whole thing in its
 * accessible name, so it is announced as "Barkada, 4 people" and never as a
 * name with a digit stuck to it.
 */
export default function ScopeChips({ scopes, activeId, onPick, label }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {scopes.map((scope) => {
        const active = (activeId ?? '') === scope.id;
        const empty = scope.count === 0;
        return (
          <button
            key={scope.id || 'everyone'}
            type="button"
            className="chip"
            aria-pressed={active}
            aria-label={`${scope.label}, ${scope.count} ${scope.count === 1 ? 'person' : 'people'}`}
            disabled={empty}
            onClick={() => onPick?.(scope)}
          >
            <span className="chip__label">{scope.label}</span>
            <span className="chip__count u-mono" aria-hidden="true">
              {scope.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
