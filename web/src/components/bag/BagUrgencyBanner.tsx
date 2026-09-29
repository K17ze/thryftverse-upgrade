'use client';

import { Icon } from '@/components/ui/Icon';

interface BagUrgencyBannerProps {
  itemCount: number;
}

export function BagUrgencyBanner({ itemCount }: BagUrgencyBannerProps) {
  if (itemCount === 0) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface-alt/70 px-3.5 py-2.5 text-caption sm:px-4">
      <div className="flex items-center gap-2 text-text-secondary">
        <Icon name="clock" size={15} className="shrink-0 text-brand" />
        <span>
          <strong className="font-semibold text-text-primary">Items are not reserved.</strong>{' '}
          Vintage pieces sell fast — complete checkout to secure your order.
        </span>
      </div>
      <div className="hidden shrink-0 items-center gap-1.5 font-medium text-brand sm:flex">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
        </span>
        <span className="text-meta text-text-muted">High demand</span>
      </div>
    </div>
  );
}
