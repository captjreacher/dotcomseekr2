import { brandSummary, joinLabel } from '../../lib/discovery/domains';
import type { BrandContext } from '../../lib/discovery/types';

interface BrandSummaryBarProps {
  brand: BrandContext;
  workingName: string;
  onEdit: () => void;
}

/**
 * Compact brand summary, visible on every step after the brand is established so
 * the original meaning and extensions are never out of sight.
 */
export default function BrandSummaryBar({ brand, workingName, onEdit }: BrandSummaryBarProps) {
  const branched = joinLabel(workingName) !== joinLabel(brand.original);

  return (
    <section className="brand-summary" aria-label="Your brand">
      <div className="brand-summary-main">
        <p className="brand-summary-title">{brandSummary({ ...brand, workingName })}</p>
        <p className="brand-summary-meaning" title={brand.meaning}>
          {brand.meaning}
          {brand.meaningSource ? (
            <span className="brand-summary-source"> · {brand.meaningSource}</span>
          ) : (
            <span className="brand-summary-source"> · your own description</span>
          )}
        </p>
        {brand.commentary && (
          <p className="brand-summary-commentary" title={brand.commentary}>
            “{brand.commentary}”
          </p>
        )}
        {branched && (
          <p className="field-hint">
            Exploring “{workingName}”. The original “{brand.original}” stays the anchor.
          </p>
        )}
      </div>
      <button className="link-button" type="button" onClick={onEdit}>
        Edit brand
      </button>
    </section>
  );
}
