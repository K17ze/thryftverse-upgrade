'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { useSignupWall } from '@/components/auth/SignupWall';
import {
  useBuyoutActions,
  useBuyoutOffers,
  useCoOwnAsset,
  useCoOwnPositions,
} from '@/lib/hooks/coown-queries';
import { useSession } from '@/lib/session/SessionProvider';
import { gbp } from '../format';

export function useBuyoutWorkflow(id: string) {
  const router = useRouter();
  const { user } = useSession();
  const { requireAuth, wall } = useSignupWall();
  const { show } = useToast();
  const assetQ = useCoOwnAsset(id);
  const positionsQ = useCoOwnPositions();
  const offersQ = useBuyoutOffers(id);
  const { createOffer, acceptOffer } = useBuyoutActions();

  const [priceRaw, setPriceRaw] = useState('');
  const [unitsRaw, setUnitsRaw] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const asset = assetQ.data ?? null;
  const viewerUnits = useMemo(
    () => positionsQ.data?.find((p) => p.assetId === id)?.units ?? 0,
    [positionsQ.data, id],
  );

  const offers = useMemo(
    () =>
      [...(offersQ.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [offersQ.data],
  );

  const ownsAll = asset ? asset.totalUnits > 0 && viewerUnits >= asset.totalUnits : false;
  const remainingUnits = asset ? Math.max(0, asset.totalUnits - viewerUnits) : 0;
  const ownershipPct =
    asset && asset.totalUnits > 0 ? (viewerUnits / asset.totalUnits) * 100 : null;

  // Form math — mirrors mobile: blank target = all remaining units,
  // +24h expiry. Settlement runs through the 1ZE ledger, priced in GBP.
  const priceNum = Number.parseFloat(priceRaw);
  const priceValid = Number.isFinite(priceNum) && priceNum > 0;
  const unitsParsed = unitsRaw.trim() ? Math.floor(Number(unitsRaw)) : null;
  const unitsProvidedValid =
    unitsParsed == null || (Number.isFinite(unitsParsed) && unitsParsed >= 1);
  const effectiveUnits = unitsParsed ?? remainingUnits;
  const totalGbp = priceValid && effectiveUnits > 0 ? priceNum * effectiveUnits : null;
  const expiresAt = new Date(Date.now() + 24 * 3_600_000);

  const canSubmit = priceValid && unitsProvidedValid && effectiveUnits > 0;

  // The offer is money-moving — success is claimed only after the
  // server commits; failures surface the server's own error text.
  const submitOffer = async () => {
    if (!canSubmit || !user || submitting) return;
    setSubmitting(true);
    try {
      await createOffer(id, {
        bidderUsername: user.username,
        offerPriceGbp: priceNum,
        targetUnits: effectiveUnits,
      });
      setConfirmOpen(false);
      setPriceRaw('');
      setUnitsRaw('');
      show('Buyout offer submitted', 'success');
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not submit this offer', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAccept = async (offerId: string, units: number) => {
    if (!requireAuth('purchase') || !user || acceptingId != null) return;
    setAcceptingId(offerId);
    try {
      const result = await acceptOffer(offerId, id, units);
      if (result) {
        const offer = offers.find((o) => o.id === offerId);
        // Live mode returns the server's post-acceptance tally — the real
        // units that committed, which the backend may have clamped.
        const committed = typeof result === 'object' ? result.acceptedUnits : units;
        show(
          `Accepted ${committed} ${committed === 1 ? 'unit' : 'units'} at ${gbp(offer?.offerPriceGbp)} per unit`,
          'success',
        );
      } else {
        show('Could not accept this offer', 'error');
      }
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not accept this offer', 'error');
    } finally {
      setAcceptingId(null);
    }
  };

  return {
    router,
    assetQ,
    positionsQ,
    offersQ,
    asset,
    viewerUnits,
    offers,
    ownsAll,
    remainingUnits,
    ownershipPct,
    priceRaw,
    setPriceRaw,
    unitsRaw,
    setUnitsRaw,
    confirmOpen,
    setConfirmOpen,
    submitting,
    acceptingId,
    priceNum,
    priceValid,
    effectiveUnits,
    totalGbp,
    expiresAt,
    canSubmit,
    submitOffer,
    handleAccept,
    requireAuth,
    wall,
  };
}
