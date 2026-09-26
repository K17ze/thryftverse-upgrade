'use client';

/**
 * SummaryStep — the completion receipt. Factual, not a celebration: flat
 * hairline rows report what happened, skipped rows carry their reasons.
 * The obvious next action is reviewing the drafts; starting over recedes.
 */

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import type { ImportOutcome } from './core';

interface SummaryStepProps {
  outcome: ImportOutcome;
  onReviewDrafts: () => void;
  onRestart: () => void;
}

const MAX_SHOWN_SKIPS = 8;

export function SummaryStep({ outcome, onReviewDrafts, onRestart }: SummaryStepProps) {
  const nothingImported = outcome.importedCount === 0;
  const origin = outcome.fileName ?? 'your pasted listings';

  return (
    <div>
      <h1 className="text-screen-title font-bold text-text-primary">
        {nothingImported ? 'Nothing was imported' : 'Import complete'}
      </h1>
      <p className="mt-2 max-w-md text-body text-text-secondary">
        {nothingImported
          ? 'Every row was skipped — fix the file and try again.'
          : `${outcome.importedCount} draft${outcome.importedCount === 1 ? '' : 's'} created from ${origin} — private until you publish.`}
      </p>

      {/* ── Receipt — flat canvas, hairline separators ── */}
      <ul className="mt-8 divide-y divide-border-subtle border-y border-border-subtle">
        <li className="flex items-center justify-between gap-4 py-3.5">
          <span className="flex items-center gap-2.5 text-body-emphasis font-medium text-text-primary">
            <span
              aria-hidden
              className={`h-2 w-2 rounded-full ${nothingImported ? 'bg-border' : 'bg-success'}`}
            />
            Drafts created
          </span>
          <span className="tnum text-body-emphasis font-semibold text-text-primary">
            {outcome.importedCount}
          </span>
        </li>
        <li className="flex items-center justify-between gap-4 py-3.5">
          <span className="flex items-center gap-2.5 text-body-emphasis text-text-secondary">
            <span aria-hidden className="h-2 w-2 rounded-full bg-border" />
            Skipped
          </span>
          <span className="tnum text-body-emphasis font-semibold text-text-primary">
            {outcome.skipped.length}
          </span>
        </li>
      </ul>

      {/* ── Skip reasons — the seller sees exactly what didn't make it ── */}
      {outcome.skipped.length > 0 ? (
        <section className="mt-8" aria-label="Skipped rows">
          <h2 className="text-label font-semibold uppercase tracking-wider text-text-muted">
            Skipped
          </h2>
          <ul className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
            {outcome.skipped.slice(0, MAX_SHOWN_SKIPS).map((skip, i) => (
              <li key={`${skip.label}-${i}`} className="flex items-baseline justify-between gap-4 py-3">
                <span className="min-w-0 flex-1 truncate text-body text-text-primary">
                  {skip.label}
                </span>
                <span className="shrink-0 text-meta text-text-muted">{skip.reason}</span>
              </li>
            ))}
          </ul>
          {outcome.skipped.length > MAX_SHOWN_SKIPS ? (
            <p className="mt-2 text-meta text-text-muted">
              + {outcome.skipped.length - MAX_SHOWN_SKIPS} more
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ── Actions ── */}
      <div className="mt-8 flex flex-col gap-3">
        {outcome.importedCount > 0 ? (
          <Button size="lg" fullWidth onClick={onReviewDrafts}>
            Review drafts
          </Button>
        ) : null}
        <Button
          variant={outcome.importedCount > 0 ? 'secondary' : 'primary'}
          size="lg"
          fullWidth
          onClick={onRestart}
        >
          Start another import
        </Button>
        <Link
          href="/seller-hub"
          className="pressable mt-1 text-center text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
        >
          Back to seller hub
        </Link>
      </div>
    </div>
  );
}
