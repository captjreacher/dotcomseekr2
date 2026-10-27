import { useEffect } from 'react';
import { checkedLabel, labelForStatus, priceLabel } from '../../lib/discovery/results';
import { TECHNIQUE_LABELS } from '../../lib/discovery/techniques';
import type { ShortlistEntry } from '../../lib/discovery/types';

interface ShortlistPanelProps {
  entries: ShortlistEntry[];
  onRemove: (domain: string) => void;
  onClose: () => void;
}

/**
 * Names saved in this browser-tab session.
 *
 * Registration links are handoffs to a registrar, not proof of a purchase.
 */
export default function ShortlistPanel({ entries, onRemove, onClose }: ShortlistPanelProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="shortlist-overlay" role="presentation" onClick={onClose}>
      <aside
        className="shortlist-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortlist-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shortlist-head">
          <h2 id="shortlist-title">Saved names</h2>
          <button className="nav-link" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        {entries.length === 0 ? (
          <p className="field-hint">
            Nothing saved yet. Save an available or premium name from a checked round.
          </p>
        ) : (
          <ul className="shortlist-items">
            {entries.map((entry) => (
              <li className="shortlist-item" key={entry.domain}>
                <div className="shortlist-item-head">
                  <span className="result-domain">{entry.domain}</span>
                  <span className={`availability-badge ${entry.status}`}>
                    {labelForStatus(entry.status)}
                  </span>
                </div>
                <p className="shortlist-reason">
                  {entry.reason}{' '}
                  <span className="field-hint">
                    · {TECHNIQUE_LABELS[entry.technique]} · {checkedLabel(entry.checkedAt)}
                  </span>
                </p>
                <div className="shortlist-actions">
                  {entry.price !== null && (
                    <span className="variation-price">
                      {priceLabel(entry.price, entry.currency)}
                    </span>
                  )}
                  {entry.registrationUrl && (
                    <a
                      className="result-link"
                      href={entry.registrationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Registration options
                    </a>
                  )}
                  <button
                    className="link-button"
                    type="button"
                    onClick={() => onRemove(entry.domain)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="field-hint">
          Saved names are kept in this browser tab only, and registration links open a registrar in
          a new tab. They do not complete a purchase.
        </p>
      </aside>
    </div>
  );
}
