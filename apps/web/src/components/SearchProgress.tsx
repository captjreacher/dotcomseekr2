export type SearchStage = 'creating' | 'searching';

const stageCopy: Record<SearchStage, { label: string; detail: string }> = {
  creating: {
    label: 'Creating your search...',
    detail: 'Saving your words and settings.',
  },
  searching: {
    label: 'Generating names and checking live availability...',
    detail: 'Live availability checks can take up to a minute.',
  },
};

/**
 * Progress is tied to the operation that is actually running, not to a timer.
 * The bar is deliberately indeterminate: the browser cannot know how far the
 * backend has got, so it must not imply a percentage.
 */
export default function SearchProgress({
  stage,
  elapsedSeconds,
  className = '',
}: {
  stage: SearchStage;
  elapsedSeconds: number;
  className?: string;
}) {
  const copy = stageCopy[stage];

  return (
    <div className={`progress-panel ${className}`.trim()} role="status" aria-live="polite">
      <div className="progress-bar indeterminate" aria-hidden="true">
        <span />
      </div>
      <p>{copy.label}</p>
      <p className="progress-detail">
        {copy.detail} {elapsedSeconds}s elapsed
      </p>
    </div>
  );
}
