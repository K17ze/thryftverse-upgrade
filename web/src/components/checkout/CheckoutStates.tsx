'use client';

/**
 * Checkout state surfaces — the loading skeleton matching the two-column
 * layout, and the post-payment success screen (check, copyable order id,
 * two exits).
 */

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';

export function CheckoutSkeleton() {
  return (
    <div className="mx-auto max-w-[1000px] px-4 py-8 sm:px-6" aria-busy aria-label="Loading checkout">
      <Skeleton className="h-8 w-36" />
      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-8">
          {Array.from({ length: 2 }).map((_, s) => (
            <div key={s}>
              <Skeleton className="h-5 w-40" />
              <div className="mt-3 flex flex-col gap-3">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-5 w-5 rounded-full" />
                    <Skeleton className="h-10 w-10 rounded-md" />
                    <Skeleton className="h-4 flex-1" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {/* Order summary — seller parcels + flat fee ledger, as rendered */}
        <div>
          <Skeleton className="h-5 w-32" />
          <div className="mt-3 border-b border-border-subtle pb-4">
            <Skeleton className="h-3.5 w-40" />
            <div className="mt-2.5 flex flex-col gap-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-15 w-12 rounded-md" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="mt-1.5 h-3 w-1/2" />
                  </div>
                  <Skeleton className="h-4 w-12" />
                </div>
              ))}
              <div className="flex justify-between">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-10" />
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-14" />
              </div>
            ))}
            <div className="mt-1 flex justify-between border-t border-border-subtle pt-3">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-6 w-20" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CheckoutSuccess({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { show } = useToast();

  const copyOrderId = async () => {
    try {
      await navigator.clipboard.writeText(orderId);
      show('Order number copied', 'success');
    } catch {
      show(orderId, 'info');
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center" role="status">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success-subtle text-success-text">
        <Icon name="check" size={30} filled />
      </span>
      <h1 className="mt-5 text-screen-title font-bold text-text-primary">Order placed</h1>
      <p className="mt-2 text-body text-text-secondary">
        Your payment was successful. The seller has been asked to ship within 3 working days.
      </p>
      <button
        type="button"
        onClick={copyOrderId}
        aria-label={`Copy order number ${orderId}`}
        className="pressable mt-3 flex items-center gap-1.5 rounded-sm text-caption text-text-muted hover:text-text-secondary"
      >
        Order <span className="tnum font-semibold text-text-secondary">{orderId}</span>
        <Icon name="document" size={13} />
      </button>
      <div className="mt-7 flex w-full flex-col gap-2">
        <Button variant="primary" size="lg" fullWidth onClick={() => router.push(`/orders/${orderId}`)}>
          View order
        </Button>
        <Button variant="secondary" size="md" fullWidth onClick={() => router.push('/explore')}>
          Continue shopping
        </Button>
      </div>
    </div>
  );
}
