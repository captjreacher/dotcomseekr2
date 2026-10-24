import { labelForStatus, toneForStatus } from '../../lib/discovery/results';
import type { CheckStatus } from '../../lib/discovery/types';

/**
 * Availability badge for one checked name.
 *
 * The label always comes from the canonical four-state module: an unverified
 * name reads "Unable to verify" and never borrows the success styling.
 */
export default function AvailabilityBadge({ status }: { status: CheckStatus }) {
  return (
    <span className={`availability-badge ${toneForStatus(status)}`}>{labelForStatus(status)}</span>
  );
}
