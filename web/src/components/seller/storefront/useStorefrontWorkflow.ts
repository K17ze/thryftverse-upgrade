'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
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
import { STATUS_COPY } from './StorefrontPrimitives';

export function useStorefrontWorkflow() {
  const router = useRouter();
  const { user, isGuest, sessionLoading } = useSession();
  const { show } = useToast();
  const counts = useFulfilmentCounts();

  const storefront = useMyStorefront();
  const featured = useStorefrontFeatured(user?.id);
  const listings = useMyListings();
  const save = useSaveStorefront();
  const statusAction = useStorefrontStatusAction();

  const [announcement, setAnnouncement] = useState('');
  const [shipping, setShipping] = useState('');
  const [returnsPolicy, setReturnsPolicy] = useState('');
  const [additional, setAdditional] = useState('');
  const [hydrated, setHydrated] = useState(false);
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

  return {
    router,
    user,
    isGuest,
    sessionLoading,
    counts,
    storefront,
    listings,
    save,
    statusAction,
    sf,
    announcement,
    setAnnouncement,
    shipping,
    setShipping,
    returnsPolicy,
    setReturnsPolicy,
    additional,
    setAdditional,
    picked,
    featureable,
    dirty,
    busy,
    canPublish,
    togglePick,
    onSave,
    runStatus,
    status,
    statusCopy,
    confirmRollback,
    setConfirmRollback,
  };
}
