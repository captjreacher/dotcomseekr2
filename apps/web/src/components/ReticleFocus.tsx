export type ReticleState = 'idle' | 'broad' | 'focused';

interface ReticleFocusProps {
  /** Drives the broad -> focused CSS progression (no animation in Phase 0). */
  state?: ReticleState;
  className?: string;
  /** Larger, lower-contrast variant for hero backgrounds. */
  watermark?: boolean;
  /** Optional accessible label; the reticle is decorative by default. */
  label?: string;
}

/**
 * Reusable search/focus motif derived from the reticle inside the DotcomSeekr
 * logo. It reads as a telescopic lens focusing on a name, not a target to be
 * hit. Colour, size, opacity and scale are all driven by CSS custom properties,
 * so future broad -> focused transitions need no markup changes.
 */
export default function ReticleFocus({
  state = 'idle',
  className = '',
  watermark = false,
  label,
}: ReticleFocusProps) {
  const classes = ['reticle', `reticle--${state}`, watermark ? 'reticle--watermark' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      className={classes}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg
        className="reticle-svg"
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        focusable="false"
      >
        <circle cx="100" cy="100" r="92" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="100" cy="100" r="66" stroke="currentColor" strokeWidth="1.4" />
        <circle
          className="reticle-core"
          cx="100"
          cy="100"
          r="34"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M10 100h52M138 100h52M100 10v52M100 138v52"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <path
          d="M100 66V54M100 134v12M66 100H54M134 100h12"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <circle cx="100" cy="100" r="3" fill="currentColor" />
      </svg>
    </span>
  );
}
