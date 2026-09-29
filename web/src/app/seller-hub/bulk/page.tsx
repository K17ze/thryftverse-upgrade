'use client';

/**
 * /seller-hub/bulk — multi-item bulk listing (mobile BulkListingScreen
 * parity). A flat draft grid: each row owns its validation state, publish
 * runs item-by-item with per-row progress — a partial batch is a truthful
 * outcome, never silently rolled back.
 */

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SellerSectionNav } from '@/components/seller/SellerSectionNav';
import { BulkDraftGrid } from '@/components/seller/bulk/BulkDraftGrid';
import { BulkDraftSheet } from '@/components/seller/bulk/BulkDraftSheet';
import {
  newBulkDraft,
  validateBulkDraft,
  type BulkDraftItem,
} from '@/components/seller/bulk/bulkListingModel';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { useSignupWall } from '@/components/auth/SignupWall';
import { useSession } from '@/lib/session/SessionProvider';
import { useFulfilmentCounts } from '@/lib/hooks/seller-queries';
import { DATA_MODE } from '@/lib/api/client';
import * as listingsService from '@/lib/api/services/listings';
import { uploadImageFile } from '@/lib/api/services/uploads';
import { recordListing } from '@/lib/data/fixtures-commerce';
import { CURRENT_USER, MY_LISTINGS } from '@/lib/data/fixtures';
import type { Listing, ListingCondition } from '@/lib/contracts/domain';

const tick = (ms = 380) => new Promise((r) => setTimeout(r, ms));

export default function BulkListPage() {
  const qc = useQueryClient();
  const { show } = useToast();
  const { user } = useSession();
  const seller = user ?? CURRENT_USER;
  const { requireAuth, wall } = useSignupWall();
  const counts = useFulfilmentCounts();

  const [items, setItems] = useState<BulkDraftItem[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<BulkDraftItem | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const readyCount = useMemo(
    () => items.filter((i) => i.status === 'ready').length,
    [items],
  );
  const publishedCount = useMemo(
    () => items.filter((i) => i.status === 'published').length,
    [items],
  );

  const openAdd = () => {
    // The temp row is minted on open — a stable identity the sheet can
    // hold across re-renders instead of a fresh object per render.
    setEditing(newBulkDraft());
    setSheetOpen(true);
  };

  const saveDraft = (draft: BulkDraftItem) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.tempId === draft.tempId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = draft;
        return next;
      }
      return [...prev, draft];
    });
  };

  const removeDraft = (item: BulkDraftItem) =>
    setItems((prev) => prev.filter((i) => i.tempId !== item.tempId));

  const validateAll = () => {
    const validated = items.map((it) => {
      const r = validateBulkDraft(it);
      return { ...it, status: (r.valid ? 'ready' : 'error') as BulkDraftItem['status'], errors: r.errors };
    });
    setItems(validated);
    const ready = validated.filter((i) => i.status === 'ready').length;
    show(
      ready === validated.length
        ? `All ${ready} item${ready === 1 ? '' : 's'} ready to publish`
        : `${ready} ready · ${validated.length - ready} need${validated.length - ready === 1 ? 's' : ''} attention`,
      ready ? 'success' : 'info',
    );
  };

  /** One publish path — live POSTs /listings per row (blob photos upload
   *  through the presign flow first); fixture commits to MY_LISTINGS so the
   *  shelf, PDP and management surfaces all resolve the new rows. */
  const publishOne = async (item: BulkDraftItem): Promise<string> => {
    if (DATA_MODE === 'live' && user) {
      // The verified upload pipeline — each staged photo presigns, PUTs
      // and finalizes; remote URIs can't be re-verified here, so they're
      // not sent (bulk drafts only stage local file picks anyway).
      const uploads: { publicUrl: string; finalizationId: string; kind: 'image' | 'video' }[] = [];
      for (const photo of item.images) {
        if (!photo.startsWith('blob:')) continue;
        const blob = await (await fetch(photo)).blob();
        const contentType = blob.type || 'image/jpeg';
        const file = new File([blob], `photo-${uploads.length}.jpg`, {
          type: contentType,
        });
        const media = await uploadImageFile(file, 'listing');
        uploads.push({
          publicUrl: media.publicUrl,
          finalizationId: media.finalizationId,
          kind: media.mediaKind === 'video' ? 'video' : 'image',
        });
      }
      const cover = uploads.find((u) => u.kind === 'image');
      if (!cover) {
        throw new Error('A verified cover photo is required to publish.');
      }
      // tempId is the draft row's stable identity — reusing it as the
      // listing id makes a retried row an idempotent upsert, never a
      // duplicate listing.
      const { listingId, status } = await listingsService.createListing({
        id: item.tempId,
        sellerId: user.id,
        title: item.title.trim(),
        description: item.description.trim(),
        priceGbp: item.price,
        category: item.category,
        brand: item.brand.trim() || undefined,
        size: item.size.trim() || undefined,
        condition: item.condition,
        imageUrl: cover.publicUrl,
        coverFinalizationId: cover.finalizationId,
        status: 'active',
      });
      // Media writes only land on draft/active rows — a gate-held listing
      // keeps its cover and reports its held status truthfully.
      if (status !== 'risk_pending') {
        for (let i = 0; i < uploads.length; i++) {
          await listingsService.attachListingImage({
            id: `${listingId}_att_${i}`,
            listingId,
            imageUrl: uploads[i].publicUrl,
            sortOrder: i,
            mediaType: uploads[i].kind,
            finalizationId: uploads[i].finalizationId,
          });
        }
      }
      return listingId;
    }
    await tick();
    const listing: Listing = recordListing(
      {
        title: item.title.trim(),
        brand: item.brand.trim() || null,
        size: item.size.trim() || null,
        condition: item.condition as ListingCondition,
        price: item.price,
        images: [...item.images],
        category: item.category,
        subcategory: null,
        description: item.description.trim(),
      },
      seller,
    );
    return listing.id;
  };

  const publishAll = async () => {
    if (!requireAuth('create_listing')) return;
    // Validation is the gate — the button offers "Publish ready", but a
    // stale 'ready' badge after an edit is re-earned here before a single
    // item is committed.
    const validated = items.map((it) => {
      if (it.status === 'published' || it.status === 'publishing') return it;
      const r = validateBulkDraft(it);
      return { ...it, status: (r.valid ? 'ready' : 'error') as BulkDraftItem['status'], errors: r.errors };
    });
    setItems(validated);
    const queue = validated.filter((i) => i.status === 'ready');
    if (!queue.length) {
      show('Nothing is ready to publish yet', 'info');
      return;
    }

    setPublishing(true);
    setProgress({ done: 0, total: queue.length });
    let succeeded = 0;
    let failed = 0;
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i]!;
      setItems((prev) =>
        prev.map((it) => (it.tempId === item.tempId ? { ...it, status: 'publishing' } : it)),
      );
      try {
        const listingId = await publishOne(item);
        succeeded += 1;
        setItems((prev) =>
          prev.map((it) =>
            it.tempId === item.tempId
              ? { ...it, status: 'published', listingId, errors: [] }
              : it,
          ),
        );
      } catch (err) {
        failed += 1;
        setItems((prev) =>
          prev.map((it) =>
            it.tempId === item.tempId
              ? {
                  ...it,
                  status: 'failed',
                  publishError:
                    err instanceof Error && err.message
                      ? err.message
                      : 'Could not publish — try again',
                }
              : it,
          ),
        );
      }
      setProgress({ done: i + 1, total: queue.length });
    }
    setPublishing(false);
    // Fixture commits are in-place — refresh readers (same posture as the
    // batch command's settled handler).
    qc.setQueryData(['my-listings'], [...MY_LISTINGS]);
    void qc.invalidateQueries({ queryKey: ['my-listings'] });
    void qc.invalidateQueries({ queryKey: ['seller'] });
    show(
      failed
        ? `Published ${succeeded} · ${failed} failed — fix and retry`
        : `Published ${succeeded} item${succeeded === 1 ? '' : 's'}`,
      failed ? 'info' : 'success',
    );
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-6 md:pt-12 lg:max-w-[1440px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-screen-title text-text-primary">Bulk list</h1>
        {items.length ? (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            disabled={publishing}
            className="pressable inline-flex h-11 items-center rounded-md px-3 text-caption font-medium text-danger-text hover:bg-danger-subtle disabled:opacity-50"
          >
            Clear all
          </button>
        ) : null}
      </div>
      <SellerSectionNav toPost={counts.toPost} posted={counts.posted} />

      {items.length === 0 ? (
        <EmptyState
          icon="layers"
          title="Batch your items"
          subtitle="Add pieces one by one, check them all, publish in a single run."
          actionLabel="Add first item"
          onAction={openAdd}
        />
      ) : (
        <>
          {/* Run bar — counts are the grid's truth; publish only touches
              rows whose validation earned 'ready'. */}
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="tnum text-meta text-text-secondary">
              {items.length} item{items.length === 1 ? '' : 's'} · {readyCount} ready
              {publishedCount ? ` · ${publishedCount} published` : ''}
            </p>
            <span className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={openAdd} disabled={publishing}>
                Add item
              </Button>
              <Button
                variant="quiet"
                size="sm"
                onClick={validateAll}
                disabled={publishing || !items.some((i) => i.status !== 'published')}
              >
                Check all
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void publishAll()}
                disabled={publishing || !items.some((i) => i.status !== 'published' && i.status !== 'publishing')}
                aria-busy={publishing}
              >
                {publishing ? 'Publishing…' : 'Publish all ready'}
              </Button>
            </span>
          </div>

          {/* Per-run progress — real items completed, not a spinner. */}
          {progress ? (
            <div className="mt-3" role="status" aria-live="polite">
              <p className="tnum text-meta text-text-muted">
                {progress.done === progress.total
                  ? `Done — ${progress.total} processed`
                  : `Publishing ${progress.done + 1 > progress.total ? progress.total : progress.done + 1} of ${progress.total}…`}
              </p>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-alt">
                <div
                  className="h-full rounded-full bg-brand transition-[width]"
                  style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
                />
              </div>
            </div>
          ) : null}

          <div className="mt-3">
            <BulkDraftGrid
              items={items}
              publishing={publishing}
              onEdit={(item) => {
                setEditing(item);
                setSheetOpen(true);
              }}
              onRemove={removeDraft}
            />
          </div>

          <p className="mt-3 text-meta text-text-muted">
            {DATA_MODE === 'live'
              ? 'Each item publishes through the same endpoint as the single-item flow.'
              : 'Demo mode — published items land on your shelf on this device.'}
          </p>
        </>
      )}

      <BulkDraftSheet
        open={sheetOpen}
        draft={editing}
        onSave={saveDraft}
        onClose={() => setSheetOpen(false)}
      />

      <Sheet
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear all items?"
        maxWidth={420}
      >
        <div className="px-5 py-5">
          <p className="text-body text-text-secondary">
            {items.filter((i) => i.status !== 'published').length} unpublished item
            {items.filter((i) => i.status !== 'published').length === 1 ? '' : 's'} will be
            discarded. Published listings stay on your shelf.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="quiet" size="md" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="md"
              onClick={() => {
                setItems((prev) => prev.filter((i) => i.status === 'published'));
                setProgress(null);
                setConfirmClear(false);
              }}
            >
              Clear items
            </Button>
          </div>
        </div>
      </Sheet>
      {wall}
    </div>
  );
}
