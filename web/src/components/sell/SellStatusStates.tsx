'use client';

/**
 * SellStatusStates — loading skeleton and not-found fallback states for
 * target hydration (?edit=<id> and ?draft=<id>) in SellFlow.
 */

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';

export function SellLoadingSkeleton({ label }: { label: string }) {
  return (
    <div
      className="mx-auto w-full max-w-[720px] px-4 pb-24 sm:px-6"
      aria-busy
      aria-label={label}
    >
      <Skeleton className="mt-8 h-9 w-56" />
      <Skeleton className="mt-8 h-44 w-full rounded-lg" />
      <div className="mt-10 space-y-4">
        <Skeleton className="h-11 w-full rounded-md" />
        <Skeleton className="h-11 w-full rounded-md" />
      </div>
    </div>
  );
}

interface SellTargetNotFoundProps {
  title: string;
  description: string;
}

export function SellTargetNotFound({ title, description }: SellTargetNotFoundProps) {
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col items-center px-4 py-24 text-center sm:px-6">
      <span className="flex h-14 w-14 items-center justify-center rounded-full border border-border text-text-muted">
        <Icon name="edit" size={22} />
      </span>
      <h1 className="mt-5 text-screen-title text-text-primary">{title}</h1>
      <p className="mt-2 max-w-sm text-body text-text-secondary">{description}</p>
      <Link
        href="/sell"
        className="pressable mt-6 text-body font-semibold text-text-primary underline-offset-4 hover:underline"
      >
        Start a new listing
      </Link>
    </div>
  );
}

interface SellLostPhotosAlertProps {
  lostPhotos: number;
  onDismiss: () => void;
}

export function SellLostPhotosAlert({ lostPhotos, onDismiss }: SellLostPhotosAlertProps) {
  if (lostPhotos <= 0) return null;
  return (
    <div
      role="status"
      className="mb-6 flex items-start gap-3 rounded-lg border border-warning-border bg-warning-subtle px-4 py-3"
    >
      <Icon name="warning" size={16} className="mt-0.5 shrink-0 text-warning-text" />
      <p className="min-w-0 flex-1 text-caption text-text-secondary">
        {lostPhotos} photo{lostPhotos === 1 ? '' : 's'} couldn&apos;t be restored —
        photos added from this device don&apos;t survive a reload. Add them again
        before publishing.
      </p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="pressable -mr-2 -my-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-text-muted hover:text-text-primary"
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
