'use client';

import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';

interface PortfolioSectionStateProps {
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  /** Honest empty copy — omit where an empty section renders nothing. */
  empty?: string;
  hasRows: boolean;
}

export function PortfolioSectionState({
  loading,
  error,
  onRetry,
  empty,
  hasRows,
}: PortfolioSectionStateProps) {
  if (loading) {
    return (
      <div className="mt-4 space-y-1.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div className="mt-4 flex items-center justify-between gap-4 border-y border-border-subtle py-4">
        <p className="text-body text-text-secondary">Couldn’t load this section.</p>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }
  if (!hasRows) {
    return empty ? <p className="mt-4 text-body text-text-secondary">{empty}</p> : null;
  }
  return null;
}
