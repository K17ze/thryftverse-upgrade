'use client';

/**
 * OfferConfirmSheet — the confirmation ceremony every money/exit verb on
 * /offers passes through. Port of the native OffersScreen's
 * ConfirmationSheet: amount, item and consequence copy are stated before
 * the mutation fires, and the sheet locks while the write is in flight so
 * the request can't double-fire or be dismissed mid-flight.
 *
 * Copy is role-aware, matching the same authorship rules OfferRow
 * resolves its labels by:
 *   - accept creates the order — the copy states the charge, never just
 *     "are you sure";
 *   - a seller declining their OWN standing counter reads as a
 *     withdrawal, never a rejection;
 *   - cancel is the buyer's exit — withdrawing their own offer, or
 *     collapsing the negotiation against a seller's standing counter.
 */

import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import type { CommerceOffer } from '@/lib/data/fixtures-commerce';
import type { OfferRowAction } from '@/components/orders/OfferRow';
import { formatPrice } from '@/lib/utils/format';

/** Counter opens its own composer — the sheet covers the three writes
 *  that mutate the standing offer in place. */
export type OfferConfirmAction = Exclude<OfferRowAction, 'counter'>;

export interface OfferConfirm {
  offer: CommerceOffer;
  action: OfferConfirmAction;
}

interface OfferConfirmSheetProps {
  /** The pending confirmation — null closes the sheet. */
  confirm: OfferConfirm | null;
  viewerId: string;
  /** Resolved listing title — the consequence copy names the item. */
  listingTitle?: string;
  /** True while the confirmed write is in flight. */
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

function copyFor(
  confirm: OfferConfirm,
  viewerId: string,
): { title: string; body: string; action: string } {
  const { offer, action } = confirm;
  const amount = formatPrice(offer.amount);
  const ownMove = offer.offeredByUserId === viewerId;
  const isSeller = offer.sellerId === viewerId;
  if (action === 'accept') {
    return {
      title: `Accept ${amount}?`,
      // The accept POST creates the order server-side — first accept wins
      // and sibling pending offers on the listing are declined.
      body: isSeller
        ? 'The buyer is charged and the order is created — the listing is marked sold and other pending offers on it are declined.'
        : 'Your payment method is charged and the order is created — the item is yours once payment settles.',
      action: 'Accept offer',
    };
  }
  if (action === 'decline') {
    return ownMove
      ? {
          title: `Withdraw your counter of ${amount}?`,
          body: 'Your counter-offer is closed — the negotiation ends and the buyer can send a new offer.',
          action: 'Withdraw counter',
        }
      : {
          title: `Decline ${amount}?`,
          body: 'The offer is closed and the negotiation ends — the buyer can send a new offer.',
          action: 'Decline offer',
        };
  }
  return ownMove
    ? {
        title: `Cancel your offer of ${amount}?`,
        body: 'Your offer is withdrawn — you can send a new one while the listing is available.',
        action: 'Cancel offer',
      }
    : {
        title: `Cancel ${amount}?`,
        body: 'The offer is cancelled and the negotiation ends — no order is created.',
        action: 'Cancel offer',
      };
}

export function OfferConfirmSheet({
  confirm,
  viewerId,
  listingTitle,
  busy = false,
  onConfirm,
  onClose,
}: OfferConfirmSheetProps) {
  const copy = confirm ? copyFor(confirm, viewerId) : null;
  return (
    <Sheet
      open={confirm != null}
      onClose={busy ? () => {} : onClose}
      title={copy?.title}
      ariaLabel="Confirm offer action"
      maxWidth={420}
    >
      <div className="px-5 py-5">
        {confirm && copy ? (
          <>
            <p className="clamp-2 text-body font-medium text-text-primary">
              {listingTitle ?? 'This item'}
            </p>
            <p className="mt-2 text-body text-text-secondary">{copy.body}</p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="quiet" size="md" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={onConfirm}
                disabled={busy}
                aria-busy={busy}
              >
                {copy.action}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </Sheet>
  );
}
