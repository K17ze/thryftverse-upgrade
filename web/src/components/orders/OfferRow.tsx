'use client';

/**
 * OfferRow — one offer in the lifecycle list. Port of the mobile OfferRow:
 * flat hairline row, standing amount vs asking price, a status word, the
 * ball-in-court made explicit ("Your move" vs "Waiting on @name"), the
 * counter round when one has happened, and the live expiry countdown.
 *
 * Truthfulness rules (mirrors services/listingOffersApi semantics):
 *   - the backend expires offers lazily, so a live row past expiresAt
 *     renders as expired and shows no actions;
 *   - actions follow authorship, not direction — the participant who did
 *     NOT author the standing offer may accept / counter / decline; the
 *     author may only withdraw;
 *   - counterRound is displayed verbatim so a countered negotiation never
 *     masquerades as a fresh offer.
 */

import Link from 'next/link';
import type { CommerceOffer, OfferStatus } from '@/lib/data/fixtures-commerce';
import { AppImage } from '@/components/ui/AppImage';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { DATA_MODE } from '@/lib/api/client';
import { useListingIds, useSellerSummary } from '@/lib/hooks/listing-resolution';
import { listingById, userById } from '@/lib/data/fixtures';
import { offerOrderId } from '@/lib/commerce/offerAcceptance';
import { OFFER_STATUS_LABEL } from '@/lib/commerce/offerLabels';
import { formatPrice, timeAgo } from '@/lib/utils/format';
import { getCategoryFocalPoint, getListingCoverUri } from '@/lib/utils/media';

export type OfferRowAction = 'accept' | 'counter' | 'decline' | 'cancel';

/**
 * Actions derived from the server's actual authorization rules — the
 * mobile role/state matrix (components/offers/OfferRow.resolveOfferActions):
 *   - the participant who did NOT author the standing offer may respond —
 *     a seller accepts/counters/declines a buyer's offer; a buyer
 *     accepts/counters/cancels against a seller's standing counter
 *     (`offeredByUserId !== viewer` is the server's own check);
 *   - only the seller can decline; only the buyer can cancel — cancel is
 *     the buyer's exit whether or not the standing offer is theirs;
 *   - a seller declining their OWN standing counter retracts it — rendered
 *     as "Withdraw", never as a rejection.
 *
 * Web fixture note: the fixture model keeps the standing counter on the
 * same row as status 'countered' (the backend supersedes via a new
 * pending row), so the live/actionable set is pending OR countered.
 */
export function resolveOfferActions(
  offer: CommerceOffer,
  viewerId: string,
  nowMs: number,
): OfferRowAction[] {
  const effective = effectiveOfferStatus(offer, nowMs);
  if (effective !== 'pending' && effective !== 'countered') return [];
  const isSeller = offer.sellerId === viewerId;
  const isBuyer = offer.buyerId === viewerId;
  const ownMove = offer.offeredByUserId === viewerId;
  if (isSeller && !ownMove) return ['accept', 'counter', 'decline'];
  if (isBuyer && !ownMove) return ['accept', 'counter', 'cancel'];
  if (isBuyer && ownMove) return ['cancel'];
  if (isSeller && ownMove) return ['decline'];
  return [];
}

/** Badge tone per status — labels come from the canonical OFFER_STATUS_LABEL
 *  map so every surface says the same word for the same state. */
const STATUS_VARIANT: Record<
  OfferStatus,
  'neutral' | 'success' | 'warning' | 'danger' | 'trust' | 'brand'
> = {
  pending: 'warning',
  accepted: 'success',
  declined: 'danger',
  countered: 'brand',
  expired: 'neutral',
  cancelled: 'neutral',
};

/**
 * Effective display status. Expiry is lazy — a pending/countered row whose
 * expiresAt has passed renders as expired rather than offering actions the
 * server would reject.
 */
export function effectiveOfferStatus(offer: CommerceOffer, nowMs: number): OfferStatus {
  if (
    (offer.status === 'pending' || offer.status === 'countered') &&
    offer.expiresAt != null &&
    Date.parse(offer.expiresAt) <= nowMs
  ) {
    return 'expired';
  }
  return offer.status;
}

function formatTimeLeft(expiresAt: string, nowMs: number): string {
  const ms = Date.parse(expiresAt) - nowMs;
  if (!Number.isFinite(ms) || ms <= 0) return 'Expired';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m left`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m left`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h left`;
}

function expiryToneClass(expiresAt: string, nowMs: number): string {
  const ms = Date.parse(expiresAt) - nowMs;
  if (!Number.isFinite(ms) || ms <= 0) return 'text-text-muted';
  if (ms <= 3_600_000) return 'text-danger-text';
  if (ms <= 12 * 3_600_000) return 'text-warning-text';
  return 'text-text-muted';
}

/**
 * CounterLadder — the negotiation so far, from real offer fields: the
 * listing's asking price, then the standing move attributed to its author
 * (counterRound > 0 means the standing amount is a counter, not a first
 * offer). The ball-in-court row is the emphasised one — the reader should
 * never have to reconstruct who moved last from the price block alone.
 * The intermediate round amounts aren't in the contract, so the ladder
 * never invents them: asking → standing is everything the record knows.
 */
function CounterLadder({
  offer,
  ownMove,
  awaitingMe,
}: {
  offer: CommerceOffer;
  ownMove: boolean;
  awaitingMe: boolean;
}) {
  return (
    <div className="mt-1.5 flex flex-col gap-1" aria-label={`Counter round ${offer.counterRound}`}>
      <p className="flex items-baseline justify-between gap-3 text-caption text-text-muted">
        <span>Asking price</span>
        <span className="tnum">{formatPrice(offer.originalPrice)}</span>
      </p>
      <p
        className={`flex items-baseline justify-between gap-3 text-caption ${
          awaitingMe ? 'font-semibold text-text-primary' : 'text-text-secondary'
        }`}
      >
        <span>
          {ownMove ? 'Your counter' : 'Their counter'}
          <span className="tnum ml-1.5 text-text-muted">· R{offer.counterRound}</span>
        </span>
        <span className="tnum font-semibold text-text-primary">{formatPrice(offer.amount)}</span>
      </p>
    </div>
  );
}

interface OfferRowProps {
  offer: CommerceOffer;
  direction: 'received' | 'sent';
  viewerId: string;
  /** Shared clock from the parent so every row's expiry ticks together. */
  nowMs: number;
  onAction: (offer: CommerceOffer, action: OfferRowAction) => void;
}

export function OfferRow({ offer, direction, viewerId, nowMs, onAction }: OfferRowProps) {
  const LIVE = DATA_MODE === 'live';
  // Live rows resolve the real listing + counterparty (GET /listings/:id,
  // GET /sellers/:id); fixture rows read the catalogue. A live id that
  // fails to resolve renders the honest placeholder — never a fixture
  // ghost standing in for the member's actual negotiation.
  const { byId } = useListingIds([offer.listingId]);
  const counterpartyId = direction === 'received' ? offer.buyerId : offer.sellerId;
  const seller = useSellerSummary(LIVE ? counterpartyId : null);
  const listing = LIVE
    ? byId.get(offer.listingId) ?? null
    : listingById(offer.listingId);
  const counterpartyName = LIVE
    ? seller.data?.username ?? 'member'
    : userById(counterpartyId)?.username ?? 'member';

  const effective = effectiveOfferStatus(offer, nowMs);
  const live = effective === 'pending' || effective === 'countered';
  const status = { label: OFFER_STATUS_LABEL[effective], variant: STATUS_VARIANT[effective] };
  const actions = resolveOfferActions(offer, viewerId, nowMs);
  // Whose move is it? The standing offer's author is waiting; the other
  // side owes a response.
  const ownMove = offer.offeredByUserId === viewerId;
  const awaitingMe = live && !ownMove;
  const waitingOnThem = live && ownMove;

  const timeLeft = live && offer.expiresAt ? formatTimeLeft(offer.expiresAt, nowMs) : null;

  return (
    <li className="py-4">
      <div className="flex items-center gap-3 lg:grid lg:grid-cols-[3.5rem_minmax(0,1.3fr)_minmax(0,0.8fr)_9.5rem_7rem] lg:gap-x-5">
        <Link
          href={`/item/${offer.listingId}`}
          className="pressable w-14 shrink-0 overflow-hidden rounded-md"
          aria-label={listing?.title ?? 'Listing'}
        >
          <AppImage
            src={getListingCoverUri(listing?.images)}
            alt={listing?.title ?? 'Listing'}
            aspectRatio={0.8}
            focalPoint={getCategoryFocalPoint(listing?.category)}
            sizes="56px"
            className="w-full"
          />
        </Link>

        <div className="min-w-0 flex-1">
          <Link href={`/item/${offer.listingId}`} className="clamp-1 text-body font-medium text-text-primary hover:underline">
            {listing?.title ?? 'Listing'}
          </Link>
          {/* Compact counterparty line — mobile only; at lg the same
              facts render as their own table cell. */}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-caption text-text-secondary lg:hidden">
            <span>
              {direction === 'received' ? 'From' : 'To'}{' '}
              <span className="font-medium text-text-primary">
                @{counterpartyName}
              </span>
            </span>
            <span className="flex items-center gap-1 text-text-muted">
              <Icon name="clock" size={11} />
              {timeAgo(offer.updatedAt)}
            </span>
          </p>
          {/* Counter history — a compact ladder once a round has happened;
              a fresh offer stays a fresh offer. */}
          {offer.counterRound > 0 ? (
            <CounterLadder offer={offer} ownMove={ownMove} awaitingMe={awaitingMe} />
          ) : null}
          {/* Ball-in-court — the negotiation never leaves the reader
              guessing who owes the next move. */}
          {awaitingMe ? (
            <p className="mt-1 text-caption font-medium text-commerce-trust">Your move</p>
          ) : waitingOnThem ? (
            <p className="mt-1 text-caption text-text-muted">Waiting on @{counterpartyName}</p>
          ) : null}
          {/* Conversation threading — when the offer is bound to a DM
              (listing_offers.conversation_id), the row deep-links into that
              thread instead of leaving the negotiation stranded. */}
          {offer.conversationId ? (
            <Link
              href={`/inbox/${offer.conversationId}`}
              className="pressable mt-1.5 inline-flex items-center gap-1 text-caption text-text-secondary hover:text-text-primary"
            >
              <Icon name="chat" size={13} />
              View conversation
            </Link>
          ) : null}
        </div>

        {/* Desktop cell — counterparty + last move, the column the mobile
            meta line collapses into the title block. */}
        <div className="hidden min-w-0 lg:block">
          <p className="clamp-1 text-body text-text-secondary">
            {direction === 'received' ? 'From' : 'To'}{' '}
            <span className="font-medium text-text-primary">@{counterpartyName}</span>
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-caption text-text-muted">
            <Icon name="clock" size={11} />
            {timeAgo(offer.updatedAt)}
          </p>
        </div>

        <div className="shrink-0 text-right lg:justify-self-end">
          <p className="tnum text-body-large font-bold text-text-primary">
            {formatPrice(offer.amount)}
          </p>
          <p className="tnum text-caption text-text-muted line-through">
            {formatPrice(offer.originalPrice)}
          </p>
          {timeLeft ? (
            <p className={`tnum mt-0.5 text-caption ${expiryToneClass(offer.expiresAt!, nowMs)}`}>
              {timeLeft}
            </p>
          ) : null}
        </div>

        <span className="hidden w-24 shrink-0 justify-end sm:flex">
          <Badge variant={status.variant}>{status.label}</Badge>
        </span>
      </div>

      {/* Actions — the resolved role/state set, nothing more: the other
          side's standing offer gets the full response grammar (seller
          declines, buyer cancels); your own standing move gets only its
          legal exit — Withdraw for a seller, Cancel for a buyer. */}
      {actions.length > 0 ? (
        <div className="mt-3 flex gap-2 pl-[68px] lg:mt-2.5 lg:justify-end lg:pl-0">
          {actions.includes('accept') ? (
            <Button variant="primary" size="sm" onClick={() => onAction(offer, 'accept')}>
              Accept <span className="tnum">{formatPrice(offer.amount)}</span>
            </Button>
          ) : null}
          {actions.includes('counter') ? (
            <Button variant="secondary" size="sm" onClick={() => onAction(offer, 'counter')}>
              Counter
            </Button>
          ) : null}
          {actions.includes('decline') ? (
            <Button variant="quiet" size="sm" onClick={() => onAction(offer, 'decline')}>
              {ownMove ? 'Withdraw' : 'Decline'}
            </Button>
          ) : null}
          {actions.includes('cancel') ? (
            <Button variant="quiet" size="sm" onClick={() => onAction(offer, 'cancel')}>
              Cancel
            </Button>
          ) : null}
        </div>
      ) : offer.status === 'accepted' ? (
        <p className="mt-2.5 flex items-center gap-1.5 pl-[68px] text-caption text-success-text lg:justify-end lg:pl-0">
          <Icon name="check" size={13} filled />
          Deal made —{' '}
          {offerOrderId(offer) ? (
            <Link
              href={`/orders/${offerOrderId(offer)}`}
              className="pressable font-semibold underline underline-offset-2"
            >
              view the order
            </Link>
          ) : (
            'see your orders for dispatch updates.'
          )}
        </p>
      ) : null}
    </li>
  );
}
