'use client';

import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/ui/EmptyState';
import { PositionsTable, type PositionRow } from '../PositionsTable';
import { PortfolioSectionState } from './PortfolioSectionState';

interface PortfolioPositionsSectionProps {
  rows: PositionRow[];
  hasPositions: boolean;
  isError: boolean;
  isLoading: boolean;
  onRetry: () => void;
}

export function PortfolioPositionsSection({
  rows,
  hasPositions,
  isError,
  isLoading,
  onRetry,
}: PortfolioPositionsSectionProps) {
  const router = useRouter();

  return (
    <section className={hasPositions ? 'mt-10' : 'mt-8'} aria-label="Positions">
      <h2 className="text-section-title font-semibold text-text-primary">Positions</h2>
      {isError ? (
        <PortfolioSectionState
          loading={isLoading}
          error
          onRetry={onRetry}
          hasRows={hasPositions}
        />
      ) : null}
      {hasPositions ? (
        <div className="mt-4">
          <PositionsTable rows={rows} />
        </div>
      ) : isError ? null : (
        <div className="mt-4 border-b border-border-subtle pb-8">
          <EmptyState
            icon="layers"
            title="No positions yet"
            subtitle="Buy units in any Co-Own market and your portfolio builds itself here."
            actionLabel="Browse markets"
            onAction={() => router.push('/co-own')}
          />
        </div>
      )}
    </section>
  );
}
