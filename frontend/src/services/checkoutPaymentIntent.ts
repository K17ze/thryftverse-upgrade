import { Linking } from 'react-native';
import { getPaymentIntentStatus } from './commerceApi';

const PAYMENT_INTENT_POLL_ATTEMPTS = 12;
const PAYMENT_INTENT_POLL_INTERVAL_MS = 1_500;
// Extended polling for 3DS/SCA re-authentication: up to 5 minutes.
const PAYMENT_INTENT_SCA_POLL_ATTEMPTS = 100;
const PAYMENT_INTENT_SCA_POLL_INTERVAL_MS = 3_000;

export type CheckoutPaymentSettlementStatus = 'succeeded' | 'failed' | 'pending' | 'aborted';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function waitForPaymentIntentSettlement(
  intentId: string,
  shouldContinue: () => boolean
): Promise<CheckoutPaymentSettlementStatus> {
  let maxAttempts = PAYMENT_INTENT_POLL_ATTEMPTS;
  let intervalMs = PAYMENT_INTENT_POLL_INTERVAL_MS;
  let openedActionUrl: string | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!shouldContinue()) {
      return 'aborted';
    }

    try {
      const latestIntent = await getPaymentIntentStatus(intentId);
      const normalizedStatus = latestIntent.status.trim().toLowerCase();

      if (normalizedStatus === 'succeeded') {
        return 'succeeded';
      }

      if (normalizedStatus === 'failed' || normalizedStatus === 'cancelled') {
        return 'failed';
      }

      // ── 3DS/SCA re-authentication ─────────────────────────────────────
      // When the intent requires action (e.g., 3DS challenge), extend the
      // polling window and open the next_action_url for the user to
      // authenticate with their bank.
      if (normalizedStatus === 'requires_action' || normalizedStatus === 'requires_confirmation') {
        const nextActionUrl = (latestIntent as { nextActionUrl?: string | null }).nextActionUrl;
        if (nextActionUrl && openedActionUrl !== nextActionUrl && shouldContinue()) {
          // Open the bank's 3DS authentication page in the device browser.
          try {
            await Linking.openURL(nextActionUrl);
            openedActionUrl = nextActionUrl;
          } catch {
            // Linking may fail on some platforms; the user can also
            // complete auth in the PaymentSheet.
          }
        }
        // Switch to extended polling (5 min) to allow time for 3DS.
        maxAttempts = PAYMENT_INTENT_SCA_POLL_ATTEMPTS;
        intervalMs = PAYMENT_INTENT_SCA_POLL_INTERVAL_MS;
      }
    } catch {
      // Continue polling until timeout to absorb transient API/network failures.
    }

    if (!shouldContinue()) {
      return 'aborted';
    }

    if (attempt < maxAttempts - 1) {
      await wait(intervalMs);
    }
  }

  return 'pending';
}
