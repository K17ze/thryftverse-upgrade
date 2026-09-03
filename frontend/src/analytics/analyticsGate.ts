/**
 * Analytics gate — the single source of truth for the analytics opt-out flag.
 *
 * Every PostHog call path (track, identify, capture, session replay) must
 * consult `isAnalyticsEnabled()` before reaching the PostHog client. When
 * the user has opted out, no call reaches PostHog, no events are queued,
 * and session replay does not start.
 *
 * The flag is checked at call time, not just at app startup, so toggling
 * the preference takes effect immediately without a restart.
 *
 * Subscribers are notified whenever the flag changes so that long-lived
 * consumers (e.g. the PostHog provider's session replay controller) can
 * react immediately.
 */

type OptOutListener = (optOut: boolean) => void;

let analyticsOptOut = false;
const listeners = new Set<OptOutListener>();

export function setAnalyticsOptOut(optOut: boolean): void {
  if (analyticsOptOut === optOut) return;
  analyticsOptOut = optOut;
  for (const listener of listeners) {
    try {
      listener(optOut);
    } catch {
      // Listener errors must never crash the gate.
    }
  }
}

export function isAnalyticsOptOut(): boolean {
  return analyticsOptOut;
}

export function isAnalyticsEnabled(): boolean {
  return !analyticsOptOut;
}

export function subscribeToAnalyticsOptOut(listener: OptOutListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
