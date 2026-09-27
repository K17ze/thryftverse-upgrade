/**
 * Canonical offer-status labels — single source for every surface that
 * renders an offer state (/offers rows, in-chat offer cards, order
 * timelines). 'cancelled' is labelled "Withdrawn" everywhere: the actor
 * who cancels is the offer's author, so withdrawal is the truthful word.
 */
import type { OfferStatus } from '@/lib/data/fixtures-commerce';

export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
  countered: 'Countered',
  expired: 'Expired',
  cancelled: 'Withdrawn',
};
