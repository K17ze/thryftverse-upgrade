'use client';

/**
 * LiveLotDock — the in-show auction lot surface for the web viewer.
 * Mirrors the mobile lot dock grammar: the lot on the table (image,
 * standing bid, honest auto-close countdown only when the server sets
 * one), a one-tap increment bid against the real minIncrement, and the
 * "Up next" card from the actual scheduled queue. Live backend only —
 * fixture and demo sessions have no lot engine, so the dock renders
 * nothing for them rather than simulating one.
 */

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { LiveSession } from '@/lib/data/fixtures-media';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useSignupWall } from '@/components/auth/SignupWall';
import { useSession } from '@/lib/session/SessionProvider';
import { DATA_MODE } from '@/lib/api/client';
import * as liveService from '@/lib/api/services/live';
import { useLiveLots } from './useLiveLots';
import { formatPrice } from '@/lib/utils/format';

/** The bid the server will accept next — high bid + the enforced
 *  increment, or the opening price when nobody has bid. */
function nextBid(lot: liveService.LiveLot): number {
  if (lot.highBid > 0) return lot.highBid + lot.minIncrement;
  return Math.max(lot.startPrice, lot.minIncrement);
}

/** Honest close countdown — only rendered while the server has set an
 *  auto-close deadline. A host-closed lot shows no clock. */
function LotCountdown({ closesAt }: { closesAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const leftMs = Date.parse(closesAt) - now;
  if (leftMs <= 0) return null;
  const total = Math.floor(leftMs / 1000);
  const mm = Math.floor(total / 60);
  const ss = String(total % 60).padStart(2, '0');
  return (
    <span
      className={`tnum inline-flex items-center gap-1 text-meta font-semibold ${
        leftMs < 30_000 ? 'text-danger-text' : 'text-scrim-text-secondary'
      }`}
    >
      <Icon name="clock" size={11} />
      {mm}:{ss}
    </span>
  );
}

export function LiveLotDock({ session }: { session: LiveSession }) {
  const realShow =
    DATA_MODE === 'live' && session.status === 'live' && session.isDemo !== true;
  const { currentLot, queue } = useLiveLots(realShow ? session.id : null, realShow);
  const qc = useQueryClient();
  const { show } = useToast();
  const { user } = useSession();
  const { requireAuth, wall } = useSignupWall();
  const [bidding, setBidding] = useState(false);

  if (!realShow) return null;
  if (currentLot == null && queue.length === 0) return null;

  const upNext = queue[0] ?? null;

  const bid = async (lot: liveService.LiveLot) => {
    if (bidding || !requireAuth('place_bid')) return;
    const amount = nextBid(lot);
    setBidding(true);
    try {
      const result = await liveService.placeStreamBid(
        session.id,
        amount,
        `web-${session.id}-${Date.now().toString(36)}`,
      );
      if (!result.success) {
        // The server's reason lands verbatim — "below increment",
        // "lot closed", self-bid — never flattened.
        show(result.error ?? 'Bid was not accepted', 'error');
        return;
      }
      show(`Bid placed — ${formatPrice(amount)}`, 'success');
      void qc.invalidateQueries({ queryKey: ['live-current-lot', session.id] });
      void qc.invalidateQueries({ queryKey: ['live-lots', session.id] });
    } finally {
      setBidding(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      {/* Flat grammar — solid scrim backing + hairline, no blur chrome. */}
      {currentLot != null ? (
        <div className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-media-overlay-scrim p-2.5 sm:max-w-[360px]">
          {currentLot.imageUrl ? (
            <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-white/10">
              <AppImage
                src={currentLot.imageUrl}
                alt={currentLot.title || `Lot ${currentLot.lotNumber}`}
                fill
                sizes="56px"
                className="h-full w-full"
              />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-meta font-semibold uppercase tracking-wide text-scrim-text-secondary">
              Lot {currentLot.lotNumber}
              {currentLot.status === 'open' || currentLot.status === 'closing' ? (
                <>
                  <span className="text-danger-text">
                    {currentLot.status === 'closing' ? 'Closing' : 'On the table'}
                  </span>
                  {currentLot.closesAt != null ? (
                    <LotCountdown closesAt={currentLot.closesAt} />
                  ) : null}
                </>
              ) : null}
            </p>
            <p className="clamp-1 mt-0.5 text-caption font-medium text-scrim-text-primary">
              {currentLot.title || `Lot ${currentLot.lotNumber}`}
            </p>
            <p className="tnum mt-0.5 text-caption font-semibold text-scrim-text-primary">
              {currentLot.status === 'sold'
                ? `Sold · ${formatPrice(currentLot.highBid)}`
                : currentLot.status === 'passed' || currentLot.status === 'cancelled'
                  ? 'Passed'
                  : currentLot.highBid > 0
                    ? `${formatPrice(currentLot.highBid)}${
                        currentLot.bidCount != null
                          ? ` · ${currentLot.bidCount} ${
                              currentLot.bidCount === 1 ? 'bid' : 'bids'
                            }`
                          : ''
                      }`
                    : `Opens at ${formatPrice(currentLot.startPrice)}`}
              {user != null &&
              currentLot.highBidderId === user.id &&
              (currentLot.status === 'open' || currentLot.status === 'closing')
                ? ' · You’re winning'
                : ''}
            </p>
            {currentLot.reservePrice != null &&
            currentLot.highBid > 0 &&
            currentLot.highBid < currentLot.reservePrice &&
            (currentLot.status === 'open' || currentLot.status === 'closing') ? (
              <p className="text-meta font-semibold text-warning-text">Reserve not met</p>
            ) : null}
          </div>
          {currentLot.status === 'open' || currentLot.status === 'closing' ? (
            <button
              type="button"
              disabled={bidding}
              onClick={() => void bid(currentLot)}
              aria-label={`Bid ${formatPrice(nextBid(currentLot))} on lot ${currentLot.lotNumber}`}
              className="pressable h-9 shrink-0 rounded-md bg-scrim-text-primary px-3.5 text-caption font-semibold text-black disabled:opacity-50"
            >
              {bidding ? 'Bidding…' : `Bid ${formatPrice(nextBid(currentLot))}`}
            </button>
          ) : null}
        </div>
      ) : null}

      {upNext != null ? (
        <div className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-media-overlay-scrim px-2.5 py-2 sm:max-w-[280px]">
          {upNext.imageUrl ? (
            <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-white/10">
              <AppImage
                src={upNext.imageUrl}
                alt={upNext.title || `Lot ${upNext.lotNumber}`}
                fill
                sizes="40px"
                className="h-full w-full"
              />
            </span>
          ) : null}
          <div className="min-w-0">
            <p className="text-meta font-semibold uppercase tracking-wide text-scrim-text-secondary">
              Up next · Lot {upNext.lotNumber}
            </p>
            <p className="clamp-1 mt-0.5 text-caption font-medium text-scrim-text-primary">
              {upNext.title || `Lot ${upNext.lotNumber}`}
            </p>
            <p className="tnum text-meta text-scrim-text-secondary">
              Opens at {formatPrice(upNext.startPrice)}
            </p>
          </div>
        </div>
      ) : null}

      {wall}
    </div>
  );
}
