'use client';

/**
 * SellFeedPreviewAside — sticky feed preview rail displayed at lg breakpoints.
 * Renders the draft in real-time as its discovery tile with an action to open
 * the full buyer preview.
 */

import type { User } from '@/lib/contracts/domain';
import { Button } from '@/components/ui/Button';
import { SellPreviewCard } from './SellPreviewCard';
import type { SellDraft } from './constants';
import type { PhotoMediaEntry } from '@/lib/hooks/sell/useSellMediaUpload';

interface SellFeedPreviewAsideProps {
  draft: SellDraft;
  seller: User;
  mediaOf: (src: string) => PhotoMediaEntry | undefined;
  onPreview: () => void;
}

export function SellFeedPreviewAside({
  draft,
  seller,
  mediaOf,
  onPreview,
}: SellFeedPreviewAsideProps) {
  return (
    <aside className="sticky top-20 hidden lg:block" aria-label="Listing preview">
      <p className="text-label text-text-muted">In the feed</p>
      <div className="mt-3">
        <SellPreviewCard draft={draft} seller={seller} mediaOf={mediaOf} />
      </div>
      <p className="mt-3 max-w-[300px] text-caption leading-relaxed text-text-muted">
        Updates as you edit — this is the tile buyers see in discovery.
      </p>
      <Button
        variant="secondary"
        size="md"
        className="mt-4 w-full max-w-[300px]"
        onClick={onPreview}
      >
        Preview the full listing
      </Button>
    </aside>
  );
}
