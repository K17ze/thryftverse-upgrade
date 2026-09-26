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

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
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
import { useCommerceOrders, useOrderActions } from '@/lib/hooks/queries';
import { useSession } from '@/lib/session/SessionProvider';
import { listingById, userById } from '@/lib/data/fixtures';
import { orderEnrichmentFor } from '@/lib/data/fixtures-commerce';
import { getListingCoverUri } from '@/lib/utils/media';
import type { User } from '@/lib/contracts/domain';

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
  const { data: orders, isLoading } = useCommerceOrders();
  const actions = useOrderActions(orderId);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<SubmittedReview | null>(null);

  const order = useMemo(
    () => (orders ?? []).find((o) => o.id === orderId) ?? null,
    [orders, orderId],
  );

  const backToOrder = () => router.push(`/orders/${orderId}`);

  // ── Auth wall — reviews are account-bound ─────────────────────────────
  if (isGuest || !user) {
    return (
      <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-6">
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

  if (!order) {
    return (
      <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-6">
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

  const viewerId = user.id ?? 'me';
  const isBuyer = order.buyerId === viewerId;
  const key = normaliseOrderStatus(order.status);
  const reviewable = key === 'delivered' || key === 'completed';
  const enrichment = orderEnrichmentFor(order.id);
  // A buyer-authored review is terminal; a platform auto-feedback row is a
  // supersedable placeholder — the buyer's review replaces it (mobile rule).
  const hasTerminalReview = enrichment.hasReview === true && enrichment.reviewIsAuto !== true;
  const hasAutoReview = enrichment.hasReview === true && enrichment.reviewIsAuto === true;
  const extras = reviewExtrasFor(order.id);
  const listing = listingById(order.listingId);

  // ── Wrong role — sellers don't review their own sale ──────────────────
  if (!isBuyer) {
    return (
      <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-6">
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
      <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-6">
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
      <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-6">
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
      <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-6">
        <Header onBack={backToOrder} />
        <ReviewPublishedView
          variant="existing"
          rating={enrichment.reviewRating ?? 5}
          text={enrichment.reviewText}
          tags={extras?.tags}
          photoUrls={extras?.photoUrls}
          onBack={backToOrder}
        />
      </div>
    );
  }

  // ── Composer ──────────────────────────────────────────────────────────
  const handleSubmit = (input: ReviewSubmission) => {
    setSubmitting(true);
    void actions
      .leaveReview(input.rating, input.text)
      .then(() => {
        saveReviewExtras(orderId, { tags: input.tags, photoUrls: input.photoUrls });
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
        queryClient.setQueryData<User | null>(['user', order.sellerId], bump);
        const seller = userById(order.sellerId);
        if (seller?.username) {
          queryClient.setQueryData<User | null>(['user-by-username', seller.username], bump);
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
