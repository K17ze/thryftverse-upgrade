'use client';

/**
 * DraftsView — the session draft shelf the summary links to. Hairline rows
 * in the seller-hub listing grammar: cover (real image once the composer
 * has synced photos back, empty state until then), title, meta, the
 * "Needs: …" completeness line, Draft badge, Resume + confirmed Delete.
 * Honest scope: drafts live in this client session until published via
 * the sell flow.
 */

import { useState } from 'react';
import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import type { Listing } from '@/lib/contracts/domain';
import { formatPrice } from '@/lib/utils/format';
import { draftMissingFields } from '@/components/seller/listingManagementModel';
import { useImportDraftActions, useImportDrafts } from './useImportDrafts';

interface DraftsViewProps {
  onRestart: () => void;
}

export function DraftsView({ onRestart }: DraftsViewProps) {
  const { data: drafts, isLoading } = useImportDrafts();
  const { removeDraft } = useImportDraftActions();
  const { show } = useToast();
  const [confirmDelete, setConfirmDelete] = useState<Listing | null>(null);
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
        {drafts!.map((draft) => {
          const needs = draftMissingFields(draft);
          return (
            <li key={draft.id} className="flex items-center gap-3.5 py-3">
              <Link
                href={`/sell?draft=${draft.id}`}
                className="pressable flex min-w-0 flex-1 items-center gap-3.5"
                aria-label={`Resume draft ${draft.title}`}
              >
                {draft.images.length ? (
                  <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-surface-alt">
                    <AppImage
                      src={draft.images[0]!}
                      alt={draft.title}
                      fill
                      sizes="56px"
                    />
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-surface-alt text-text-muted"
                  >
                    <Icon name="image" size={20} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="clamp-1 block text-body-emphasis font-medium text-text-primary">
                    {draft.title}
                  </span>
                  <span className="mt-0.5 block truncate text-meta text-text-muted">
                    {[draft.brand, draft.size, draft.condition].filter(Boolean).join(' · ')}
                  </span>
                  {needs.length ? (
                    <span className="mt-0.5 block truncate text-meta text-warning-text">
                      Needs: {needs.join(', ')}
                    </span>
                  ) : null}
                </span>
              </Link>
              <Badge variant="neutral">Draft</Badge>
              <Link
                href={`/sell?draft=${draft.id}`}
                className="pressable inline-flex h-9 shrink-0 items-center rounded-md px-2 text-caption font-medium text-text-primary hover:bg-brand-subtle"
              >
                Resume
              </Link>
              <IconButton
                name="trash"
                size={16}
                aria-label={`Delete draft ${draft.title}`}
                onClick={() => setConfirmDelete(draft)}
                className="shrink-0 text-text-muted hover:text-danger-text"
              />
              <span className="tnum w-16 shrink-0 text-right text-body-emphasis font-semibold text-text-primary">
                {formatPrice(draft.price)}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-6 text-caption text-text-muted">
        Drafts keep to this session for now — resume one to finish and publish it in the
        sell flow. They also appear under Drafts in My listings.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link
          href="/seller-hub/listings"
          className="pressable inline-flex h-11 items-center rounded-md bg-brand px-5 text-body-emphasis font-semibold text-text-inverse hover:bg-brand-pressed"
        >
          Manage listings
        </Link>
        <button
          type="button"
          onClick={onRestart}
          className="pressable text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
        >
          Import more
        </button>
      </div>

      <Sheet
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete draft"
        maxWidth={420}
      >
        {confirmDelete ? (
          <div className="px-4 pb-6 pt-1">
            <p className="text-body text-text-secondary">
              Delete &ldquo;{confirmDelete.title}&rdquo;? It&apos;s removed from this
              session&apos;s drafts and can&apos;t be recovered.
            </p>
            <div className="mt-5 flex gap-2">
              <Button
                variant="danger"
                className="flex-1"
                onClick={() => {
                  removeDraft(confirmDelete.id);
                  setConfirmDelete(null);
                  show('Draft deleted', 'info');
                }}
              >
                Delete
              </Button>
              <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
                Keep
              </Button>
            </div>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
