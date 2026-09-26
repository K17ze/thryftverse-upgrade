'use client';

/**
 * VisualSearchResults — status machine for the results column.
 * analyzing → staged progress label + skeleton grid (the label names real
 * work, never "AI"); populated → honest-match note + masonry grid;
 * empty → recovery actions; error → retry. Mirrors mobile's
 * VisualSearchResults grammar.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { MasonryGrid, useMasonryColumns } from '@/components/feed/MasonryGrid';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { MasonrySkeleton } from '@/components/ui/Skeleton';
import { mapListingToDiscoverySummary, type DiscoveryFeedUnit, type Listing } from '@/lib/contracts/domain';
import {
  ANALYSIS_PHASE_LABEL,
  type AnalysisPhase,
  type VisualSearchStatus,
} from './visualSearchTypes';

interface VisualSearchResultsProps {
  status: VisualSearchStatus;
  phase: AnalysisPhase;
  results: Listing[];
  honestNote: string;
  hasRemovedAttributes: boolean;
  onRestoreAttributes: () => void;
  onChooseAnother: () => void;
  onRetry: () => void;
}

function ResultsHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1.5 pb-3 sm:px-2">
      {children}
    </div>
  );
}

export function VisualSearchResults({
  status,
  phase,
  results,
  honestNote,
  hasRemovedAttributes,
  onRestoreAttributes,
  onChooseAnother,
  onRetry,
}: VisualSearchResultsProps) {
  const columns = useMasonryColumns();

  const units = useMemo<DiscoveryFeedUnit[]>(
    () =>
      results.map((listing) => ({
        type: 'listing',
        id: `vs-${listing.id}`,
        listing: mapListingToDiscoverySummary(listing),
      })),
    [results],
  );

  if (status === 'analyzing') {
    return (
      <div>
        <ResultsHeader>
          <h2 className="text-item-title font-semibold text-text-primary">Matches</h2>
          <p className="flex items-center gap-2 text-caption text-text-muted" role="status">
            <span className="skeleton h-2 w-2 rounded-full" aria-hidden />
            {ANALYSIS_PHASE_LABEL[phase]}…
          </p>
        </ResultsHeader>
        <MasonrySkeleton columns={columns} />
      </div>
    );
  }

  if (status === 'empty') {
    return (
      <div>
        <ResultsHeader>
          <h2 className="text-item-title font-semibold text-text-primary">Matches</h2>
          <p className="text-caption text-text-muted">No matches</p>
        </ResultsHeader>
        <EmptyState
          icon="eye"
          title="No visual matches"
          subtitle="The catalogue has nothing close to that — widen the detected attributes or try another photo."
          actionLabel={hasRemovedAttributes ? 'Restore attributes' : 'Choose another photo'}
          onAction={hasRemovedAttributes ? onRestoreAttributes : onChooseAnother}
        />
        <p className="mt-2 text-center text-caption text-text-muted">
          or{' '}
          <Link href="/search" className="font-medium text-text-secondary underline underline-offset-2 hover:text-text-primary">
            search with text instead
          </Link>
        </p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div>
        <ResultsHeader>
          <h2 className="text-item-title font-semibold text-text-primary">Matches</h2>
        </ResultsHeader>
        <EmptyState
          icon="warning"
          title="Couldn't analyse that photo"
          subtitle="Something went wrong reading the image — try again or pick another."
          actionLabel="Try again"
          onAction={onRetry}
        />
      </div>
    );
  }

  if (status !== 'populated') return null;

  return (
    <div>
      <ResultsHeader>
        <h2 className="text-item-title font-semibold text-text-primary">
          <span className="tnum">{results.length}</span> match{results.length === 1 ? '' : 'es'}
        </h2>
      </ResultsHeader>
      <p className="mb-3 flex items-start gap-1.5 px-1.5 text-caption text-text-muted sm:px-2">
        <Icon name="info" size={14} className="mt-px shrink-0" />
        {honestNote}
      </p>
      <MasonryGrid units={units} columns={columns} />
    </div>
  );
}
