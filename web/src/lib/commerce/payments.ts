/**
 * Payment settlement polling — web port of the native
 * frontend/src/services/checkoutPaymentIntent.ts contract. The payment
 * intent's server-side status is the only authority on whether money
 * moved: 'succeeded' is success, 'failed'/'cancelled' is terminal, and
 * anything still non-terminal after the window is reported 'pending'
 * (never silently upgraded to success).
 *
 * The web has no Stripe PaymentSheet — card confirmation happens on the
 * native surface — so this poll exists for intents the server can settle
 * itself (bound saved methods, wallet rails) and as the recovery read the
 * native app uses. A 'pending' result means exactly that: the order
 * exists, payment is not confirmed.
 */
import { getPaymentIntentStatus } from '@/lib/api/services/commerce';

export type PaymentSettlement = 'succeeded' | 'failed' | 'pending';

const POLL_ATTEMPTS = 6;
const POLL_INTERVAL_MS = 1_500;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function waitForPaymentSettlement(
  intentId: string,
  shouldContinue: () => boolean = () => true,
): Promise<PaymentSettlement> {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    if (!shouldContinue()) return 'pending';
    try {
      const intent = await getPaymentIntentStatus(intentId);
      const status = intent.status.trim().toLowerCase();
      if (status === 'succeeded') return 'succeeded';
      if (status === 'failed' || status === 'cancelled') return 'failed';
    } catch {
      // A read failure isn't a payment failure — keep polling; the last
      // known state stays non-terminal.
    }
    await wait(POLL_INTERVAL_MS);
  }
  return 'pending';
}

/** Normalize a freshly created intent's status to the same vocabulary. */
export function intentSettlement(status: string | null | undefined): PaymentSettlement | 'open' {
  const s = (status ?? '').trim().toLowerCase();
  if (s === 'succeeded') return 'succeeded';
  if (s === 'failed' || s === 'cancelled') return 'failed';
  return 'open';
}
