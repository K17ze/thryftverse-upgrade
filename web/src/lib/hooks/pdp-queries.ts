'use client';

/**
 * PDP commerce hooks — the reads/writes queries.ts doesn't own.
 *
 *  - Listing Q&A: GET + POST /listings/:id/questions and the seller answer
 *    write (POST .../questions/:id/answer). Live mode only ever renders
 *    persisted rows — a question that fails server-side surfaces an error,
 *    never a fake "posted" state. Fixture mode keeps LISTING_QA as the
 *    session-local truth, same convention as fixtures-commerce writes.
 *  - Active offer: GET /users/me/offers filtered to this listing's live
 *    (pending/countered, unexpired) offer, plus the withdraw write
 *    (POST /offers/:id/cancel). The one-active-offer-per-listing rule the
 *    backend enforces gets an upfront client-side guard here.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import * as commerceService from '@/lib/api/services/commerce';
import * as listingsService from '@/lib/api/services/listings';
import * as sellersService from '@/lib/api/services/sellers';
import type { ListingQuestion } from '@/lib/contracts/domain';
import { CURRENT_USER, LISTING_QA } from '@/lib/data/fixtures';
import { OFFERS, cancelOffer, type CommerceOffer } from '@/lib/data/fixtures-commerce';
import { useSession } from '@/lib/session/SessionProvider';

// ── Listing Q&A ──────────────────────────────────────────────────────────────

const questionsKey = (listingId: string) => ['listing-questions', listingId] as const;

/** Public question threads for a listing — persisted rows only. */
export function useListingQuestions(listingId: string) {
  return useQuery<ListingQuestion[]>({
    queryKey: questionsKey(listingId),
    queryFn: async ({ signal }) => {
      if (DATA_MODE === 'live') {
        return listingsService.fetchListingQuestions(listingId, signal);
      }
      return LISTING_QA.filter((q) => q.listingId === listingId);
    },
    staleTime: 30_000,
  });
}

/** Buyer asks — live: POST /listings/:id/questions; fixture: session-local
 *  append so design mode still demonstrates the posted state. */
export function usePostListingQuestion(listingId: string) {
  const queryClient = useQueryClient();
  const { user } = useSession();
  return useMutation({
    mutationFn: async (text: string): Promise<ListingQuestion> => {
      if (DATA_MODE === 'live') {
        return listingsService.postListingQuestion(listingId, text);
      }
      const question: ListingQuestion = {
        id: `q-local-${Date.now()}`,
        listingId,
        askerId: user?.id ?? CURRENT_USER.id,
        askerName: user?.username ?? 'you',
        askerAvatar: user?.avatar,
        text,
        createdAt: new Date().toISOString(),
        answer: null,
      };
      LISTING_QA.unshift(question);
      return question;
    },
    onSuccess: (question) => {
      queryClient.setQueryData<ListingQuestion[]>(questionsKey(listingId), (prev) => [
        question,
        ...(prev ?? []).filter((q) => q.id !== question.id),
      ]);
    },
  });
}

/** Seller answers — live: POST .../questions/:id/answer; fixture: write the
 *  answer onto the seeded thread. */
export function useAnswerListingQuestion(listingId: string) {
  const queryClient = useQueryClient();
  const { user } = useSession();
  return useMutation({
    mutationFn: async ({
      questionId,
      text,
    }: {
      questionId: string;
      text: string;
    }): Promise<{ questionId: string; answer: NonNullable<ListingQuestion['answer']> }> => {
      if (DATA_MODE === 'live') {
        const answer = await listingsService.answerListingQuestion(listingId, questionId, text);
        return { questionId, answer };
      }
      const answer: NonNullable<ListingQuestion['answer']> = {
        text,
        responderName: user?.username ?? 'Seller',
        createdAt: new Date().toISOString(),
      };
      const seeded = LISTING_QA.find((q) => q.id === questionId);
      if (seeded) seeded.answer = answer;
      return { questionId, answer };
    },
    onSuccess: ({ questionId, answer }) => {
      queryClient.setQueryData<ListingQuestion[]>(questionsKey(listingId), (prev) =>
        (prev ?? []).map((q) => (q.id === questionId ? { ...q, answer } : q)),
      );
    },
  });
}

// ── Seller trust (buyer-side availability) ──────────────────────────────────

/**
 * The PDP seller's authoritative availability — GET /sellers/:id publishes
 * holidayMode / awayMessage / holidayModeUntil / reachState, which the
 * listing payload's seller block never carries (the mobile
 * CommerceActionDock feeds its dock from the same summary). Fixture mode
 * skips the fetch on purpose: applyAwayStateToFixtures already projects
 * the away flag onto `listing.seller.holidayMode`, the field the
 * capability gate reads directly.
 */
export function useSellerTrustSummary(sellerId: string | null | undefined) {
  return useQuery<sellersService.SellerTrustSummary | null>({
    queryKey: ['seller-trust', sellerId ?? 'none'],
    enabled: DATA_MODE === 'live' && !!sellerId,
    staleTime: 60_000,
    queryFn: async ({ signal }) =>
      sellerId ? sellersService.fetchSellerTrustSummary(sellerId, signal) : null,
  });
}

// ── Active offer guard ───────────────────────────────────────────────────────

/** One active offer per buyer per listing — the same 'live' predicate the
 *  backend applies (pending/countered rows still inside their expiry). */
const LIVE_OFFER_STATUSES = new Set(['pending', 'countered']);

export interface ActiveListingOffer {
  id: string;
  amount: number;
  status: string;
  /** Who placed the standing amount — a 'countered' offer authored by the
   *  seller needs the buyer's reply, not a withdrawal nudge alone. */
  offeredByUserId: string;
  expiresAt?: string;
}

function isLiveOffer(status: string, expiresAt: string | undefined, nowMs: number): boolean {
  if (!LIVE_OFFER_STATUSES.has(status)) return false;
  if (!expiresAt) return true;
  const expiry = Date.parse(expiresAt);
  return !Number.isFinite(expiry) || expiry > nowMs;
}

/** The viewer's active offer on this listing, if one exists — null when
 *  they're free to make one. Guests/owners never run the query. */
export function useMyListingOffer(listingId: string, enabled = true) {
  const { user } = useSession();
  return useQuery<ActiveListingOffer | null>({
    queryKey: ['listing-offer', listingId, user?.id ?? 'guest'],
    enabled: enabled && !!user,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const now = Date.now();
      if (DATA_MODE === 'live') {
        const offers = await commerceService.fetchOffers(signal);
        const mine = offers.find(
          (o) =>
            o.listingId === listingId &&
            o.buyerId === user!.id &&
            isLiveOffer(o.status, o.expiresAt, now),
        );
        return mine
          ? {
              id: mine.id,
              amount: mine.offerPriceGbp,
              status: mine.status,
              offeredByUserId: mine.offeredByUserId,
              expiresAt: mine.expiresAt,
            }
          : null;
      }
      const mine: CommerceOffer | undefined = OFFERS.find(
        (o) =>
          o.listingId === listingId &&
          o.buyerId === (user?.id ?? 'me') &&
          isLiveOffer(o.status, o.expiresAt, now),
      );
      return mine
        ? {
            id: mine.id,
            amount: mine.amount,
            status: mine.status,
            offeredByUserId: mine.offeredByUserId,
            expiresAt: mine.expiresAt,
          }
        : null;
    },
  });
}

/** Withdraw the standing offer — POST /offers/:id/cancel live, the fixture
 *  OFFERS mutation in design mode. */
export function useWithdrawListingOffer(listingId: string) {
  const queryClient = useQueryClient();
  const { user } = useSession();
  return useMutation({
    mutationFn: async (offerId: string) => {
      if (DATA_MODE === 'live') {
        await commerceService.respondToOffer(offerId, 'cancel');
        return;
      }
      const fixture = OFFERS.find((o) => o.id === offerId);
      if (fixture) cancelOffer(fixture);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['listing-offer', listingId] });
      void queryClient.invalidateQueries({ queryKey: ['listing-offer', listingId, user?.id ?? 'guest'] });
      void queryClient.invalidateQueries({ queryKey: ['offers'] });
    },
  });
}
