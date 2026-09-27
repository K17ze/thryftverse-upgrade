/**
 * SellSection — one flat flow section: step index, heading, hairline above.
 * Sections stack on the canvas; spacing and hairlines do the separating.
 */

import type { ReactNode } from 'react';

interface SellSectionProps {
  id: string;
  step: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function SellSection({ id, step, title, subtitle, children }: SellSectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-24 border-t border-border-subtle pt-8 pb-10 first:border-t-0 first:pt-0">
      <div className="mb-6 flex items-baseline gap-3">
        <span className="tnum text-caption font-semibold text-text-muted">
          {String(step).padStart(2, '0')}
        </span>
        <div>
          <h2 id={`${id}-heading`} className="text-section-title font-semibold text-text-primary">
            {title}
          </h2>
          {subtitle ? <p className="mt-0.5 text-caption text-text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}
