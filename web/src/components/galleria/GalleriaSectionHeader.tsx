/**
 * GalleriaSectionHeader — eyebrow + title over a hairline, optional right-hand
 * meta slot. Mirrors GalleriaSectionHeader.tsx on mobile; hairlines carry the
 * structure, no surfaces.
 */

import type { ReactNode } from 'react';

interface GalleriaSectionHeaderProps {
  eyebrow: string;
  title: string;
  aside?: ReactNode;
}

export function GalleriaSectionHeader({ eyebrow, title, aside }: GalleriaSectionHeaderProps) {
  return (
    <header className="flex items-baseline justify-between gap-4 border-b border-border-subtle pb-4">
      <div className="flex items-baseline gap-3">
        <span className="text-label font-semibold uppercase tracking-[0.14em] text-text-muted">
          {eyebrow}
        </span>
        <h2 className="text-section-title font-semibold text-text-primary">{title}</h2>
      </div>
      {aside ? <span className="shrink-0 text-meta text-text-muted">{aside}</span> : null}
    </header>
  );
}
