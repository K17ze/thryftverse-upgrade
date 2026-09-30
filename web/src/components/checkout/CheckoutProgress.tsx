'use client';

import { Spinner } from '@/components/ui/Spinner';

/**
 * Checkout progress — ports of the mobile pair:
 *
 *  - CheckoutProgressDots: three logical sections as a thin dot row
 *    (Delivery / Payment / Review) — a dot fills when its section is
 *    complete. Informational only; not a stepper.
 *  - CheckoutProgressOverlay: non-blocking pill shown while an order is
 *    being created/payment processed — the checkout stays visible behind
 *    it (mirrors the mobile overlay's accessibilityRole="alert").
 */

/**
 * Non-blocking progress overlay — keeps the checkout visible while order
 * creation/payment runs (mirrors the mobile overlay pinned below the
 * header). Pointer-events stay off it; the Pay button is separately
 * disabled while submitting.
 */
export function CheckoutProgressOverlay({ label }: { label: string }) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 top-16 z-overlay mx-auto max-w-md rounded-xl border border-border-subtle bg-surface px-4 py-2.5 shadow-floating"
    >
      <style>{`
        @keyframes checkout-progress-slide {
          0% { transform: translateX(-110%); }
          100% { transform: translateX(260%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .checkout-progress-fill { animation: none; }
        }
      `}</style>
      <div className="flex items-center gap-2">
        <Spinner size={16} />
        <p className="clamp-1 flex-1 text-body font-medium text-text-primary">{label}</p>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-border" aria-hidden>
        <span
          className="checkout-progress-fill block h-full w-2/5 rounded-full bg-brand"
          style={{ animation: 'checkout-progress-slide 1.2s ease-in-out infinite' }}
        />
      </div>
    </div>
  );
}

export type CheckoutPayStage = 'creating_order' | 'opening_payment';

export const CHECKOUT_STAGE_LABELS: Record<CheckoutPayStage, string> = {
  creating_order: 'Reviewing your order',
  opening_payment: 'Processing payment',
};

function Dot({ complete, label }: { complete: boolean; label: string }) {
  return (
    <span className="flex flex-col items-center gap-1">
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full border ${
          complete ? 'border-brand bg-brand' : 'border-border bg-surface-alt'
        }`}
      />
      <span
        className={`text-meta font-medium ${
          complete ? 'text-text-primary' : 'text-text-muted'
        }`}
      >
        {label}
      </span>
    </span>
  );
}

export function CheckoutProgressDots({
  deliveryComplete,
  paymentComplete,
  reviewComplete,
}: {
  deliveryComplete: boolean;
  paymentComplete: boolean;
  reviewComplete: boolean;
}) {
  return (
    <div
      role="status"
      aria-label={`Checkout progress: Delivery ${deliveryComplete ? 'complete' : 'pending'}, Payment ${paymentComplete ? 'complete' : 'pending'}, Review ${reviewComplete ? 'ready' : 'pending'}`}
      className="flex items-center justify-center gap-1 py-2"
    >
      <Dot complete={deliveryComplete} label="Delivery" />
      <span
        aria-hidden
        className={`mb-4 h-px w-8 ${deliveryComplete ? 'bg-brand' : 'bg-border'}`}
      />
      <Dot complete={paymentComplete} label="Payment" />
      <span
        aria-hidden
        className={`mb-4 h-px w-8 ${paymentComplete ? 'bg-brand' : 'bg-border'}`}
      />
      <Dot complete={reviewComplete} label="Review" />
    </div>
  );
}
