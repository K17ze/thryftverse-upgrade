'use client';

import { Button } from '@/components/ui/Button';

interface AuctionCommitSectionProps {
  creating: boolean;
  canSubmit: boolean;
  schedule: 'now' | 'later';
  liveMode: boolean;
}

export function AuctionCommitSection({
  creating,
  canSubmit,
  schedule,
  liveMode,
}: AuctionCommitSectionProps) {
  return (
    <div className="flex flex-col gap-2 border-t border-border-subtle pt-6">
      <Button type="submit" size="lg" fullWidth disabled={creating || !canSubmit}>
        {creating
          ? 'Creating…'
          : schedule === 'later'
            ? 'Schedule the auction'
            : 'Start the auction'}
      </Button>
      <p className="text-meta text-text-muted">
        {liveMode
          ? 'The auction is created on the live marketplace — the listing pauses while it runs.'
          : 'Fixture mode — the auction joins this session board and clears on reload.'}
      </p>
    </div>
  );
}
