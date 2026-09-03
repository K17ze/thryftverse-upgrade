import { useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import { useStore } from '../store/useStore';
import { trackRaw } from '../analytics/track';

/**
 * Deep-link routes that require an authenticated session.
 *
 * When an unauthenticated user opens one of these via a Universal Link /
 * App Link / custom scheme, the hook stores the intended destination and
 * redirects to `AuthLanding`. After a successful login the stored
 * destination is replayed so the user lands where the link pointed.
 *
 * Routes NOT in this set are public — they navigate directly even for
 * guests (e.g. product detail, user profile, explore, live shopping).
 */
const AUTH_REQUIRED_DEEP_LINK_ROUTES: ReadonlySet<string> = new Set([
  // Chat / messaging
  'chat',
  'inbox',
  // Seller tools
  'seller-hub',
  'seller-analytics',
  'creator-analytics',
  'inventory',
  // Orders & wallet
  'orders',
  'order',
  'wallet',
  'wallet/balance',
  'wallet/withdraw',
  'wallet/earnings',
  'wallet/history',
  'wallet/convert',
  'wallet/bank-account',
  // Co-Own trading (account-bound)
  'portfolio',
  'co-own/orders',
  // Auctions (account-bound)
  'auctions/my-bids',
  // Settings & account
  'me/edit',
  'settings',
  'personalisation',
  'closet',
  'notifications',
  'addresses',
  'payments',
  'verification',
  'account-security',
  'account-security/recovery',
  // Profile
  'me',
  // Support
  'resolution-centre',
  'support/conversation',
  'support/case',
  'support/order',
  // Agent ledger
  'agent-ledger',
  // Moodboard editor (requires account)
  // MoodboardHome is public; editor is account-bound.
  // Saved searches
  'saved-searches',
  // Checkout
  'checkout',
]);

/**
 * Prefixes that this hook considers as app deep links. Matches the
 * `DEEP_LINK_PREFIXES` in `linking.ts` so we only intercept our own URLs.
 */
const APP_LINK_PREFIXES: readonly string[] = [
  'thryftverse://',
  'https://thryftverse.com',
  'https://www.thryftverse.com',
];

/**
 * Determine whether a parsed deep-link path requires authentication.
 *
 * We match against the first 1–3 path segments because some routes have
 * parameter segments (e.g. `chat/:conversationId`, `order/:orderId`,
 * `account-security/recovery/:caseId`). The longest matching prefix wins.
 */
function isAuthRequiredPath(path: string): boolean {
  // Normalise: strip leading slash, strip query string.
  const cleanPath = path.replace(/^\//, '').split('?')[0].replace(/\/$/, '');

  // Try exact match first (e.g. "seller-hub", "orders").
  if (AUTH_REQUIRED_DEEP_LINK_ROUTES.has(cleanPath)) {
    return true;
  }

  // Try progressively shorter prefixes for parameterised routes.
  const segments = cleanPath.split('/');
  for (let i = segments.length; i >= 1; i--) {
    const prefix = segments.slice(0, i).join('/');
    if (AUTH_REQUIRED_DEEP_LINK_ROUTES.has(prefix)) {
      return true;
    }
  }

  return false;
}

/**
 * Check whether a URL belongs to the app (our scheme or our domains).
 */
function isAppDeepLink(url: string): boolean {
  const lower = url.toLowerCase();
  return APP_LINK_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/**
 * The stored deep-link destination, kept in a module-level ref so it
 * survives re-renders and is accessible from the post-login replay effect.
 */
interface PendingDeepLink {
  url: string;
  path: string;
}

let pendingDeepLink: PendingDeepLink | null = null;

/**
 * Get the current pending deep-link destination (if any).
 *
 * Exposed so the login flow can check whether a redirect is queued after
 * authentication succeeds.
 */
export function getPendingDeepLink(): PendingDeepLink | null {
  return pendingDeepLink;
}

/**
 * Clear the pending deep-link destination. Called after the destination
 * has been replayed or when the user manually navigates elsewhere.
 */
export function clearPendingDeepLink(): void {
  pendingDeepLink = null;
}

/**
 * Authentication-aware deep-link redirect hook.
 *
 * Mount this once at the app root (inside the NavigationContainer tree).
 * It listens for incoming deep links and, when the user is not
 * authenticated and the target route requires auth:
 *
 *   1. Stores the intended destination URL + path.
 *   2. Lets React Navigation's linking config resolve the URL to a
 *      navigation state — but the AppNavigator's `initialRoute` will be
 *      `AuthLanding` for unauthenticated users, so the deep-linked screen
 *      is never actually shown.
 *   3. After the user logs in, the replay effect navigates to the stored
 *      destination and clears the pending entry.
 *
 * For public routes (product detail, user profile, explore, live), the
 * hook does nothing — React Navigation resolves the link directly.
 *
 * Group-invite URLs are excluded here because they are already handled
 * manually in `App.tsx` (join + navigate to Chat). The `linking.ts`
 * `filter` function also excludes them from React Navigation's parser.
 */
export function useDeepLinkAuth(): void {
  const isAuthenticated = useStore((state) => state.isAuthenticated);
  // Track whether we've already captured the initial URL so we don't
  // double-process it via the `url` event listener.
  const initialUrlProcessedRef = useRef(false);

  // ── Capture: intercept incoming deep links when unauthenticated ──────
  useEffect(() => {
    const captureIfAuthRequired = (url: string | null) => {
      if (!url || !isAppDeepLink(url)) return;
      // Group invites are handled separately in App.tsx.
      if (/group-invite/i.test(url)) return;

      // If already authenticated, nothing to do — React Navigation
      // resolves the link directly.
      if (useStore.getState().isAuthenticated) return;

      const parsed = Linking.parse(url);
      const path = parsed.path ?? '';

      if (!isAuthRequiredPath(path)) return;

      // Store the intended destination for post-login replay.
      pendingDeepLink = { url, path };

      if (!__DEV__) {
        trackRaw('deep_link_auth_redirect', {
          path,
          reason: 'unauthenticated',
        });
      }
    };

    // Process the initial URL (cold start) once.
    if (!initialUrlProcessedRef.current) {
      initialUrlProcessedRef.current = true;
      void Linking.getInitialURL().then((initialUrl) => {
        captureIfAuthRequired(initialUrl);
      });
    }

    const subscription = Linking.addEventListener('url', ({ url }) => {
      captureIfAuthRequired(url);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // ── Replay: navigate to the stored destination after login ───────────
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!pendingDeepLink) return;

    const destination = pendingDeepLink;
    pendingDeepLink = null;

    // Defer to the next tick so the navigator has time to switch from
    // AuthLanding to MainTabs before we push the deep-linked screen.
    const timer = setTimeout(() => {
      // Use the openURL approach so React Navigation's linking config
      // parses the stored URL and navigates to the correct screen with
      // the correct params. This reuses the same parsing + legacy-rewrite
      // pipeline as the initial deep link.
      void Linking.openURL(destination.url).catch(() => {
        // If openURL fails (e.g. the URL format isn't recognised by the
        // OS as an app-internal link), the pending destination is lost.
        // This is acceptable — the user is already authenticated and on
        // the main app surface.
      });
    }, 100);

    return () => clearTimeout(timer);
  }, [isAuthenticated]);
}
