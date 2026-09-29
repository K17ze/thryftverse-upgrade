'use client';

/**
 * /seller-hub/storefront — the seller's own shop-front editor.
 *
 * Web counterpart of the mobile storefront editor (EditProfileScreen's
 * "Shop" fields + storefrontApi's publish/pause/rollback lifecycle):
 * announcement, the three-policy bag, the pinned featured rail (max 8),
 * and the draft → published ⇄ paused → draft state machine.
 *
 * Live mode reads/writes the real /storefronts/me contract — update and
 * publish ride the loaded revision as If-Match, so a stale editor 409s
 * rather than clobbering a newer save. Fixture mode keeps an honest
 * device-local draft: the same gates apply, nothing pretends to publish.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SellerSectionNav } from '@/components/seller/SellerSectionNav';
import { AppImage } from '@/components/ui/AppImage';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { INPUT_CLASS, SellField } from '@/components/sell/SellField';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import {
  useFulfilmentCounts,
  useMyStorefront,
  useSaveStorefront,
  useStorefrontFeatured,
  useStorefrontStatusAction,
  type StorefrontStatusAction,
} from '@/lib/hooks/seller-queries';
import { useMyListings } from '@/lib/hooks/queries';
import { MAX_FEATURED } from '@/components/profile/shopRailData';
import { useSession } from '@/lib/session/SessionProvider';
import { formatDate, formatPrice } from '@/lib/utils/format';
import { getListingCoverUri } from '@/lib/utils/media';

const TEXTAREA_CLASS = `${INPUT_CLASS} h-auto resize-y py-2.5`;

const STATUS_COPY: Record<
  'draft' | 'published' | 'paused',
  { label: string; variant: 'neutral' | 'success' | 'warning'; line: string }
> = {
  draft: {
    label: 'Draft',
    variant: 'neutral',
    line: 'Only you can see this — publish to put it on your shop.',
  },
  published: {
    label: 'Live',
    variant: 'success',
    line: 'Buyers see this on your shop.',
  },
  paused: {
    label: 'Paused',
    variant: 'warning',
    line: 'Hidden from buyers — publish again to bring it back.',
  },
};

function StorefrontSkeleton() {
  return (
    <div aria-busy aria-label="Loading storefront" className="mt-8 space-y-5">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="aspect-square w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export default function StorefrontEditorPage() {
  const router = useRouter();
  const { user, isGuest, sessionLoading } = useSession();
  const { show } = useToast();
  const counts = useFulfilmentCounts();

  const storefront = useMyStorefront();
  const featured = useStorefrontFeatured(user?.id);
  const listings = useMyListings();
  const save = useSaveStorefront();
  const statusAction = useStorefrontStatusAction();

  // Local form state — hydrated once the storefront query resolves so a
  // failed fetch can never overwrite existing copy with blanks (native
  // EditProfileScreen's shopStatus gate).
  const [announcement, setAnnouncement] = useState('');
  const [shipping, setShipping] = useState('');
  const [returnsPolicy, setReturnsPolicy] = useState('');
  const [additional, setAdditional] = useState('');
  const [hydrated, setHydrated] = useState(false);
  // null = untouched → the pinned order follows the query truth.
  const [pickedIds, setPickedIds] = useState<string[] | null>(null);
  const [confirmRollback, setConfirmRollback] = useState(false);

  useEffect(() => {
    if (!storefront.data || hydrated) return;
    setAnnouncement(storefront.data.announcement ?? '');
    setShipping(storefront.data.policies.shipping ?? '');
    setReturnsPolicy(storefront.data.policies.returns ?? '');
    setAdditional(storefront.data.policies.additional ?? '');
    setHydrated(true);
  }, [storefront.data, hydrated]);

  const savedFeatured = featured.data ?? [];
  const picked = pickedIds ?? savedFeatured;

  // Same eligibility set as the profile ShopRail pin sheet — active
  // listings only; removed/deleted additionally excluded (the backend
  // 422s them).
  const featureable = useMemo(
    () =>
      (listings.data ?? []).filter(
        (l) =>
          !l.isSold &&
          l.status !== 'sold' &&
          l.status !== 'removed' &&
          l.status !== 'deleted',
      ),
    [listings.data],
  );

  const sf = storefront.data ?? null;
  const textDirty =
    sf !== null &&
    (announcement !== (sf.announcement ?? '') ||
      shipping !== (sf.policies.shipping ?? '') ||
      returnsPolicy !== (sf.policies.returns ?? '') ||
      additional !== (sf.policies.additional ?? ''));
  const featuredDirty =
    pickedIds !== null && pickedIds.join(',') !== savedFeatured.join(',');
  const dirty = textDirty || featuredDirty;
  const busy = save.isPending || statusAction.isPending;
  const canPublish = picked.length + (sf?.sectionCount ?? 0) > 0;

  const togglePick = (id: string) =>
    setPickedIds((cur) => {
      const base = cur ?? savedFeatured;
      if (base.includes(id)) return base.filter((x) => x !== id);
      return base.length >= MAX_FEATURED ? base : [...base, id];
    });

  const onSave = () => {
    save.mutate(
      {
        announcement: announcement.trim() || null,
        policies: {
          shipping: shipping.trim() || null,
          returns: returnsPolicy.trim() || null,
          additional: additional.trim() || null,
        },
        featuredIds: picked,
      },
      {
        onSuccess: () => {
          setPickedIds(null);
          show('Storefront saved', 'success');
        },
        onError: (err) => {
          const parsed = parseApiError(err, 'Could not save your storefront');
          if (parsed.code === 'STALE_REVISION') {
            void storefront.refetch();
            show(
              'Your storefront changed elsewhere — the latest version is loaded. Save again.',
              'error',
            );
          } else {
            show(parsed.message, 'error');
          }
        },
      },
    );
  };

  const runStatus = (action: StorefrontStatusAction) =>
    statusAction.mutate(action, {
      onSuccess: () =>
        show(
          action === 'publish'
            ? 'Your shop is live'
            : action === 'pause'
              ? 'Shop paused — hidden from buyers'
              : 'Shop reverted to draft',
          'success',
        ),
      onError: (err) => {
        const code =
          parseApiError(err).code ??
          (err instanceof Error ? err.message : null);
        if (code === 'EMPTY_STOREFRONT') {
          show('Pin at least one item to publish — an empty shop can’t go live', 'error');
        } else if (code === 'NOT_PUBLISHED') {
          show('Only a live shop can be paused or reverted', 'error');
        } else if (code === 'STALE_REVISION') {
          void storefront.refetch();
          show('Your storefront changed elsewhere — the latest version is loaded.', 'error');
        } else {
          show(parseApiError(err, 'Could not update the storefront').message, 'error');
        }
      },
    });

  const status = sf?.status ?? 'draft';
  const statusCopy = STATUS_COPY[status];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-6 md:pt-12 lg:max-w-[1440px]">
      <h1 className="text-screen-title text-text-primary">Storefront</h1>
      <SellerSectionNav toPost={counts.toPost} posted={counts.posted} />

      {sessionLoading || storefront.isLoading ? (
        <StorefrontSkeleton />
      ) : isGuest ? (
        <div className="mt-8">
          <EmptyState
            icon="bag"
            title="Sign in to edit your storefront"
            subtitle="Your announcement, policies and pinned items live on your seller account."
            actionLabel="Sign in"
            onAction={() => router.push('/auth')}
          />
        </div>
      ) : storefront.isError || !sf ? (
        <div className="mt-8">
          <EmptyState
            icon="alert"
            title="Couldn't load your storefront"
            subtitle="We couldn't reach your shop details. Try again in a moment."
            actionLabel="Retry"
            onAction={() => void storefront.refetch()}
          />
        </div>
      ) : (
        <>
          {/* ── Publication state — one hairline row, status is the object ── */}
          <section
            aria-label="Publication status"
            className="mt-8 flex flex-wrap items-center justify-between gap-3 border-y border-border-subtle py-3.5"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Badge variant={statusCopy.variant}>{statusCopy.label}</Badge>
              <p className="text-meta text-text-muted">
                {status === 'published' && sf.publishedAt
                  ? `${statusCopy.line} Since ${formatDate(sf.publishedAt ?? undefined)}.`
                  : statusCopy.line}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {status === 'published' ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    icon="pause"
                    disabled={busy}
                    onClick={() => runStatus('pause')}
                  >
                    Pause
                  </Button>
                  <Button
                    variant="quiet"
                    size="sm"
                    disabled={busy}
                    onClick={() => setConfirmRollback(true)}
                  >
                    Revert to draft
                  </Button>
                </>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  icon="eye"
                  disabled={busy || !canPublish}
                  onClick={() => runStatus('publish')}
                >
                  {statusAction.isPending ? 'Publishing…' : 'Publish'}
                </Button>
              )}
            </div>
          </section>
          {status !== 'published' && !canPublish ? (
            <p className="mt-2 flex items-start gap-1.5 text-meta text-text-muted">
              <Icon name="info" size={14} className="mt-px shrink-0" />
              Pin at least one item below to publish — an empty shop can&apos;t go live.
            </p>
          ) : null}

          {/* ── Announcement + policies — the flat field grammar ── */}
          <section aria-label="Shop board" className="mt-10">
            <h2 className="text-section-title font-semibold text-text-primary">Shop board</h2>
            <div className="mt-5 space-y-6">
              <SellField
                id="sf-announcement"
                label="Announcement"
                optional
                hint="Pinned to the top of your shop — drop dates, restock notes, bundle deals."
              >
                <textarea
                  id="sf-announcement"
                  className={TEXTAREA_CLASS}
                  rows={3}
                  maxLength={500}
                  value={announcement}
                  onChange={(e) => setAnnouncement(e.target.value)}
                  disabled={busy}
                  placeholder="A note shown at the top of your shop…"
                />
              </SellField>
              <SellField id="sf-shipping" label="Shipping policy" optional>
                <textarea
                  id="sf-shipping"
                  className={TEXTAREA_CLASS}
                  rows={2}
                  maxLength={500}
                  value={shipping}
                  onChange={(e) => setShipping(e.target.value)}
                  disabled={busy}
                  placeholder="e.g. Dispatches within 2 days, tracked shipping"
                />
              </SellField>
              <SellField id="sf-returns" label="Returns policy" optional>
                <textarea
                  id="sf-returns"
                  className={TEXTAREA_CLASS}
                  rows={2}
                  maxLength={500}
                  value={returnsPolicy}
                  onChange={(e) => setReturnsPolicy(e.target.value)}
                  disabled={busy}
                  placeholder="e.g. Returns accepted within 14 days"
                />
              </SellField>
              <SellField id="sf-additional" label="Additional policies" optional>
                <textarea
                  id="sf-additional"
                  className={TEXTAREA_CLASS}
                  rows={2}
                  maxLength={500}
                  value={additional}
                  onChange={(e) => setAdditional(e.target.value)}
                  disabled={busy}
                  placeholder="Anything else buyers should know…"
                />
              </SellField>
            </div>
          </section>

          {/* ── Featured rail — the pinned shop window (max 8, pick order
              is the published rank) ── */}
          <section aria-label="Featured listings" className="mt-10">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-section-title font-semibold text-text-primary">
                Featured listings
              </h2>
              <span className="tnum text-meta text-text-muted">
                {picked.length}/{MAX_FEATURED}
              </span>
            </div>
            <p className="mt-1 text-meta text-text-muted">
              Pinned to the top of your shop in the order you pick them.
            </p>

            {listings.isLoading ? (
              <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4" aria-busy>
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="aspect-square w-full rounded-lg" />
                ))}
              </div>
            ) : featureable.length === 0 ? (
              <p className="mt-4 text-body text-text-muted">
                Nothing to pin yet —{' '}
                <Link
                  href="/sell"
                  className="pressable font-medium text-text-primary underline-offset-4 hover:underline"
                >
                  list an item
                </Link>{' '}
                first.
              </p>
            ) : (
              <ul className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                {featureable.map((listing) => {
                  const rank = picked.indexOf(listing.id);
                  const selected = rank >= 0;
                  const capped = !selected && picked.length >= MAX_FEATURED;
                  return (
                    <li key={listing.id}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        aria-label={
                          selected
                            ? `Unpin "${listing.title}" (position ${rank + 1})`
                            : `Pin "${listing.title}"`
                        }
                        disabled={busy || capped}
                        onClick={() => togglePick(listing.id)}
                        className={`pressable w-full overflow-hidden rounded-lg border text-left disabled:opacity-40 ${
                          selected ? 'border-text-primary' : 'border-border'
                        }`}
                      >
                        <span className="relative block">
                          <AppImage
                            src={getListingCoverUri(listing.images)}
                            alt={listing.title}
                            aspectRatio={1}
                            sizes="(min-width: 640px) 160px, 33vw"
                          />
                          {selected ? (
                            <span className="tnum absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-text-primary text-meta font-semibold text-text-inverse">
                              {rank + 1}
                            </span>
                          ) : null}
                        </span>
                        <span className="flex flex-col gap-0.5 px-2 py-2">
                          <span className="clamp-1 text-caption font-medium text-text-primary">
                            {listing.title}
                          </span>
                          <span className="tnum text-meta text-text-muted">
                            {formatPrice(listing.price)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ── Commit — the last hairline block; mode honesty rides here ── */}
          <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-5">
            <p className="flex items-start gap-1.5 text-meta text-text-muted">
              <Icon name="info" size={14} className="mt-px shrink-0" />
              {DATA_MODE === 'live'
                ? 'Saved to your account — your shop updates the moment you save.'
                : 'Demo mode — saved on this device; nothing is published to a live shop.'}
            </p>
            <div className="flex items-center gap-2">
              {user?.username ? (
                <Button
                  variant="quiet"
                  size="sm"
                  icon="forward"
                  onClick={() => router.push(`/u/${user.username}`)}
                >
                  View shop
                </Button>
              ) : null}
              <Button
                variant="primary"
                size="sm"
                disabled={!dirty || busy}
                onClick={onSave}
              >
                {save.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
          {save.isError ? (
            <p role="alert" className="mt-2 text-caption text-danger-text">
              We couldn&apos;t save that change — check the highlighted items and try again.
            </p>
          ) : null}
        </>
      )}

      <Sheet
        open={confirmRollback}
        onClose={() => setConfirmRollback(false)}
        title="Revert to draft?"
      >
        <div className="px-4 pb-6 pt-1">
          <p className="text-body text-text-secondary">
            Your shop comes off your profile until you publish it again. Your
            announcement, policies and pins stay saved.
          </p>
          <div className="mt-5 flex gap-2">
            <Button
              variant="danger"
              className="flex-1"
              disabled={busy}
              onClick={() => {
                setConfirmRollback(false);
                runStatus('rollback');
              }}
            >
              Revert to draft
            </Button>
            <Button variant="secondary" onClick={() => setConfirmRollback(false)}>
              Keep live
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
