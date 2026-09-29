'use client';

/**
 * /review/[orderId] — the review composer for a completed order, ported
 * from the mobile WriteReviewScreen. One surface, the full state machine:
 * auth wall → loading → invalid order → non-buyer → not-yet-reviewable →
 * already-published (read-only) → composer → published receipt.
 *
 * Submission writes the session review through the fixture mutation
 * (order enrichment + the seller's REVIEWS records) and mirrors the
 * mobile cache fan-out: order queries invalidate, the seller's user
 * aggregate is updated in the react-query cache so their profile rating
 * and review count reflect the new review.
 */

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/Toast';
import {
  ReviewComposer,
  ReviewPublishedView,
  ReviewSkeleton,
  reviewExtrasFor,
  saveReviewExtras,
  type ReviewSubmission,
} from '@/components/review';
import { normaliseOrderStatus } from '@/components/orders/orderCapabilities';
import { useOrderActions } from '@/lib/hooks/queries';
import { useOrder } from '@/lib/hooks/order-queries';
import { useSession } from '@/lib/session/SessionProvider';
import { listingById, userById } from '@/lib/data/fixtures';
import { orderEnrichmentFor } from '@/lib/data/fixtures-commerce';
import { DATA_MODE } from '@/lib/api/client';
import { fetchOrderReview } from '@/lib/api/services/commerce';
import { fetchListingById } from '@/lib/api/services/listings';
import { uploadImageFile } from '@/lib/api/services/uploads';
import { getListingCoverUri } from '@/lib/utils/media';
import type { User } from '@/lib/contracts/domain';

const LIVE = DATA_MODE === 'live';

interface SubmittedReview extends ReviewSubmission {
  date: string;
}

export default function ReviewPage() {
  const params = useParams<{ orderId: string }>();
  const router = useRouter();
  const { show } = useToast();
  const { user, isGuest } = useSession();
  const queryClient = useQueryClient();

  const orderId = params?.orderId ?? '';
  // Resolve the order by id — GET /orders/:id — never by list-find: the
  // orders list is keyset-paginated (50/page), so a deep link to an order
  // past page one would render "Order not found" for a real order.
  const { data: order, isLoading, isError, refetch } = useOrder(orderId);
  const actions = useOrderActions(orderId);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<SubmittedReview | null>(null);

  // Live: the persisted review row is the source of truth — a returned
  // row renders read-only (isAuto rows are superseded, not terminal), and
  // the item context resolves against the real listing id.
  const reviewQuery = useQuery({
    queryKey: ['order', orderId, 'review'],
    queryFn: ({ signal }) => fetchOrderReview(orderId, signal),
    enabled: LIVE && Boolean(order),
    staleTime: 60_000,
  });
  const listingQuery = useQuery({
    queryKey: ['review-listing', order?.listingId],
    queryFn: ({ signal }) => fetchListingById(order!.listingId, signal),
    enabled: LIVE && Boolean(order?.listingId),
    staleTime: 5 * 60_000,
  });

  const backToOrder = () => router.push(`/orders/${orderId}`);

  // ── Auth wall — reviews are account-bound ─────────────────────────────
  if (isGuest || !user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <IconButton
          name="back"
          aria-label="Back"
          onClick={() => router.back()}
          className="-ml-2"
        />
        <EmptyState
          icon="lock"
          title="Log in to review this purchase"
          subtitle="Reviews are tied to your orders — sign in to share how it went."
          actionLabel="Log in"
          onAction={() => router.push('/auth/login')}
        />
      </div>
    );
  }

  if (isLoading) {
    return <ReviewSkeleton />;
  }

  // Error is not absence — a failed fetch gets a retry, not a gravestone.
  if (isError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <IconButton
          name="back"
          aria-label="Back"
          onClick={() => router.back()}
          className="-ml-2"
        />
        <EmptyState
          icon="warning"
          title="Couldn't load this order"
          subtitle="Check your connection and try again — the order is safe."
          actionLabel="Try again"
          onAction={() => void refetch()}
        />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <IconButton
          name="back"
          aria-label="Back"
          onClick={() => router.back()}
          className="-ml-2"
        />
        <EmptyState
          icon="receipt"
          title="Order not found"
          subtitle="This order may have been removed, or the link is incomplete."
          actionLabel="View all orders"
          onAction={() => router.push('/orders')}
        />
      </div>
    );
  }

  const viewerId = user.id;
  const isBuyer = order.buyerId === viewerId;
  const key = normaliseOrderStatus(order.status);
  const reviewable = key === 'delivered' || key === 'completed';
  const liveReview = reviewQuery.data ?? null;
  const enrichment = LIVE ? null : orderEnrichmentFor(order.id);
  // A buyer-authored review is terminal; a platform auto-feedback row is a
  // supersedable placeholder — the buyer's review replaces it (mobile rule).
  const hasTerminalReview = LIVE
    ? liveReview != null && !liveReview.isAuto
    : enrichment?.hasReview === true && enrichment.reviewIsAuto !== true;
  const hasAutoReview = LIVE
    ? liveReview?.isAuto === true
    : enrichment?.hasReview === true && enrichment.reviewIsAuto === true;
  const extras = LIVE ? null : reviewExtrasFor(order.id);
  const listing = LIVE ? (listingQuery.data ?? null) : listingById(order.listingId);

  // ── Wrong role — sellers don't review their own sale ──────────────────
  if (!isBuyer) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <IconButton name="back" aria-label="Back to the order" onClick={backToOrder} className="-ml-2" />
        <EmptyState
          icon="profile"
          title="Only the buyer can review"
          subtitle="This order belongs to a sale — buyers review purchases they received."
          actionLabel="Back to the order"
          onAction={backToOrder}
        />
      </div>
    );
  }

  // ── Not reviewable yet — pre-delivery orders have nothing to rate ─────
  if (!hasTerminalReview && !reviewable) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <IconButton name="back" aria-label="Back to the order" onClick={backToOrder} className="-ml-2" />
        <EmptyState
          icon="clock"
          title="Not reviewable yet"
          subtitle="You can review this purchase once the order has been delivered."
          actionLabel="Back to the order"
          onAction={backToOrder}
        />
      </div>
    );
  }

  // ── Published receipt — the review the session just wrote ─────────────
  if (submitted) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <Header onBack={backToOrder} />
        <ReviewPublishedView
          variant="published"
          rating={submitted.rating}
          text={submitted.text}
          date={submitted.date}
          tags={submitted.tags}
          photoUrls={submitted.photoUrls}
          onBack={backToOrder}
        />
      </div>
    );
  }

  // ── Already reviewed — terminal reviews render read-only ──────────────
  if (hasTerminalReview) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <Header onBack={backToOrder} />
        <ReviewPublishedView
          variant="existing"
          rating={LIVE ? (liveReview?.rating ?? 5) : (enrichment?.reviewRating ?? 5)}
          text={LIVE ? (liveReview?.comment ?? '') : enrichment?.reviewText}
          tags={extras?.tags}
          photoUrls={LIVE ? liveReview?.photoUrls : extras?.photoUrls}
          onBack={backToOrder}
        />
      </div>
    );
  }

  // ── Composer ──────────────────────────────────────────────────────────
  const handleSubmit = (input: ReviewSubmission) => {
    setSubmitting(true);
    void (async () => {
      // Live reviews persist media server-side — attached files upload
      // through presign→finalize first; the review POST only accepts URLs
      // the requester owns.
      let photoUrls: string[] | undefined;
      if (LIVE && input.files?.length) {
        photoUrls = await Promise.all(
          input.files.map(async (f) => (await uploadImageFile(f, 'review')).publicUrl),
        );
      }
      return actions
        .leaveReview(input.rating, input.text, photoUrls)
        .then(() => photoUrls);
    })()
      .then((persistedPhotoUrls) => {
        if (persistedPhotoUrls) input = { ...input, photoUrls: persistedPhotoUrls };
        if (!LIVE) {
          saveReviewExtras(orderId, { tags: input.tags, photoUrls: input.photoUrls });
        } else {
          void queryClient.invalidateQueries({ queryKey: ['order', orderId, 'review'] });
        }
        // Propagate the review to every surface that shows the seller's
        // ratings — the same fan-out mobile performs (reviews list is
        // invalidated by the mutation; the profile aggregate is updated
        // in-cache since the fixture user record can't be rewritten).
        const bump = (u: User | null | undefined): User | null | undefined =>
          u
            ? {
                ...u,
                reviewCount: u.reviewCount + 1,
                rating:
                  Math.round(
                    ((u.rating * u.reviewCount + input.rating) / (u.reviewCount + 1)) * 10,
                  ) / 10,
              }
            : u;
        if (LIVE) {
          // The server owns the seller aggregate — invalidate rather than
          // fake-bump a real profile's rating.
          void queryClient.invalidateQueries({ queryKey: ['user', order.sellerId] });
        } else {
          queryClient.setQueryData<User | null>(['user', order.sellerId], bump);
          const seller = userById(order.sellerId);
          if (seller?.username) {
            queryClient.setQueryData<User | null>(['user-by-username', seller.username], bump);
          }
        }
        setSubmitted({ ...input, date: new Date().toISOString() });
        show('Review published', 'success');
      })
      .catch(() => {
        show('Could not publish your review. Try again.', 'error');
      })
      .finally(() => {
        setSubmitting(false);
      });
  };

  return (
    <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-6">
      <Header onBack={backToOrder} />
      <ReviewComposer
        itemTitle={listing?.title ?? null}
        itemImage={listing ? getListingCoverUri(listing.images) : null}
        orderRef={`Order #${order.id.slice(-8).toUpperCase()}`}
        autoReview={hasAutoReview}
        submitting={submitting}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <div className="mb-5 flex items-center gap-2">
      <IconButton name="back" aria-label="Back to the order" onClick={onBack} className="-ml-2" />
      <h1 className="text-section-title font-semibold text-text-primary">Review</h1>
    </div>
  );
}
