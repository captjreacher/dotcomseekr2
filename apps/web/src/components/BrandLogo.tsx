import { useState } from 'react';
import { BRAND_LOGO_SRC, BRAND_NAME } from '../brand';

interface BrandLogoProps {
  className?: string;
  /** Render the plain wordmark if the artwork fails to load. */
  wordmarkFallback?: boolean;
}

/**
 * Renders the compact rectangular DotcomSeekr logo. If the supplied artwork
 * fails to load, it degrades to a plain text wordmark instead of showing a
 * broken image.
 */
export default function BrandLogo({ className = '', wordmarkFallback = true }: BrandLogoProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    if (!wordmarkFallback) return null;

    return <span className={`brand-wordmark ${className}`.trim()}>{BRAND_NAME}</span>;
  }

  return (
    <img
      className={`brand-logo ${className}`.trim()}
      src={BRAND_LOGO_SRC}
      alt={BRAND_NAME}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
