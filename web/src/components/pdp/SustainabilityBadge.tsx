'use client';

/**
 * SustainabilityBadge — the PDP's environmental-impact evidence row.
 * Port of the mobile SustainabilityBadge (detailed variant) +
 * SustainabilityImpact placement: a grade letter with an honest one-line
 * explanation and a link to the methodology page. Fail-closed — renders
 * nothing when the listing carries no sustainabilityGrade.
 */

import Link from 'next/link';
import type { Listing } from '@/lib/contracts/domain';
import { Icon } from '@/components/ui/Icon';

type Grade = NonNullable<Listing['sustainabilityGrade']>;

interface GradeMeta {
  /** Human label — mirrors the mobile gradeMeta labels. */
  label: string;
  /** Chip tint classes for the grade letter. */
  chipClass: string;
}

const GRADE_META: Record<Grade, GradeMeta> = {
  A: { label: 'High avoided emissions', chipClass: 'bg-success-subtle text-success-text' },
  B: { label: 'Medium-high avoided emissions', chipClass: 'bg-success-subtle text-success-text' },
  C: { label: 'Medium avoided emissions', chipClass: 'bg-warning-subtle text-warning-text' },
  D: { label: 'Low avoided emissions', chipClass: 'bg-surface-alt text-text-muted' },
};

interface SustainabilityBadgeProps {
  grade: Listing['sustainabilityGrade'];
}

export function SustainabilityBadge({ grade }: SustainabilityBadgeProps) {
  if (!grade) return null;
  const meta = GRADE_META[grade];

  return (
    <section className="border-t border-border-subtle py-6" aria-labelledby="pdp-impact">
      <h2
        id="pdp-impact"
        className="mb-3 text-section-title font-semibold text-text-primary"
      >
        Environmental impact
      </h2>
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-body-emphasis font-bold ${meta.chipClass}`}
          aria-hidden
        >
          {grade}
        </span>
        <div className="min-w-0">
          <p className="text-body font-medium text-text-primary">
            Grade {grade} · {meta.label}
          </p>
          <p className="mt-0.5 text-caption text-text-secondary">
            Estimated from the item&apos;s category and materials — a guide,
            not a measured footprint.
          </p>
        </div>
      </div>
      <Link
        href="/sustainability"
        className="pressable mt-3 inline-flex items-center gap-1 text-caption font-semibold text-text-secondary hover:text-text-primary"
      >
        How grades are estimated
        <Icon name="forward" size={13} />
      </Link>
    </section>
  );
}
