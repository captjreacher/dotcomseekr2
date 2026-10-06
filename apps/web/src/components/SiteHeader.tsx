import { ReactNode } from 'react';
import BrandLogo from './BrandLogo';

interface SiteHeaderProps {
  /** Right-hand navigation actions. */
  actions?: ReactNode;
  className?: string;
}

/**
 * Application header. Renders the supplied DotcomSeekr logo (which carries the
 * tagline in the artwork) without letting branding dominate the workbench.
 */
export default function SiteHeader({ actions, className = '' }: SiteHeaderProps) {
  return (
    <header className={`site-header ${className}`.trim()}>
      <div className="site-header-brand">
        <BrandLogo className="header-logo" />
      </div>
      {actions ? (
        <nav className="site-header-actions" aria-label="Primary">
          {actions}
        </nav>
      ) : null}
    </header>
  );
}
