'use client';

/**
 * DraftsView — the session draft shelf the summary links to. Hairline rows
 * in the seller-hub listing grammar: empty cover (imports carry no photos),
 * title, brand · size · condition meta, Draft badge, price. Honest scope:
 * drafts live in this client session until published via the sell flow.
 */

import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatPrice } from '@/lib/utils/format';
import { useImportDrafts } from './useImportDrafts';

interface DraftsViewProps {
  onRestart: () => void;
}

export function DraftsView({ onRestart }: DraftsViewProps) {
  const { data: drafts, isLoading } = useImportDrafts();
  const count = drafts?.length ?? 0;

  if (isLoading) {
    return (
      <div aria-busy aria-label="Loading drafts">
        <Skeleton className="h-8 w-48" />
        <div className="mt-8 space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3.5">
              <Skeleton className="h-14 w-14 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (count === 0) {
    return (
      <EmptyState
        icon="inventory"
        title="No drafts yet"
        subtitle="Imported rows land here as private drafts you can review before publishing."
        actionLabel="Start an import"
        onAction={onRestart}
      />
    );
  }

  return (
    <div>
      <h1 className="text-screen-title font-bold text-text-primary">Imported drafts</h1>
      <p className="mt-2 text-body text-text-secondary">
        {count} draft{count === 1 ? '' : 's'} this session — private until you publish.
      </p>

      <ul className="mt-6 divide-y divide-border-subtle border-y border-border-subtle">
        {drafts!.map((draft) => (
          <li key={draft.id} className="flex items-center gap-3.5 py-3">
            <span
              aria-hidden
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-surface-alt text-text-muted"
            >
              <Icon name="image" size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="clamp-1 block text-body-emphasis font-medium text-text-primary">
                {draft.title}
              </span>
              <span className="mt-0.5 block truncate text-meta text-text-muted">
                {[draft.brand, draft.size, draft.condition].filter(Boolean).join(' · ')}
              </span>
            </span>
            <Badge variant="neutral">Draft</Badge>
            <span className="tnum w-16 shrink-0 text-right text-body-emphasis font-semibold text-text-primary">
              {formatPrice(draft.price)}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-caption text-text-muted">
        Drafts keep to this session for now — publish each piece from the sell flow when
        it&apos;s ready.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link
          href="/sell"
          className="pressable inline-flex h-11 items-center rounded-md bg-brand px-5 text-body-emphasis font-semibold text-text-inverse hover:bg-brand-pressed"
        >
          List an item
        </Link>
        <button
          type="button"
          onClick={onRestart}
          className="pressable text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
        >
          Import more
        </button>
      </div>
    </div>
  );
}
