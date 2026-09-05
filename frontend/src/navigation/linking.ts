import type { LinkingOptions } from '@react-navigation/native';
import { getStateFromPath as defaultGetStateFromPath } from '@react-navigation/core';
import type { RootStackParamList } from './types';

/**
 * Legacy deep-link path → converged path rewrites.
 *
 * Routes removed during IA convergence (item-26) are kept reachable via
 * their original public URLs. React Navigation v7's dynamic linking config
 * maps one path per screen, so we rewrite legacy paths before the default
 * parser sees them. This preserves external bookmarks, push-notification
 * URLs, and shared links without keeping dead routes in the navigator.
 *
 * | Legacy path       | Converged path  | Reason                          |
 * |-------------------|-----------------|---------------------------------|
 * | wallet/activity   | wallet/history  | WalletActivity → WalletHistory  |
 * | auctions/all      | auctions        | Auctions → AuctionHome          |
 *
 * Deep-link paths for Galleria ('galleria'), PulseFeed ('pulse'), and
 * ConversationalSearch ('ai-search') were moved from the Home tab to the
 * Explore tab during IA convergence (item-26 Phase 3). The paths themselves
 * are unchanged — only the tab resolution changed — so no rewrite is needed.
 */
const LEGACY_PATH_REWRITES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^wallet\/activity$/, 'wallet/history'],
  [/^auctions\/all$/, 'auctions'],
];

function rewriteLegacyPath(path: string): string {
  for (const [pattern, replacement] of LEGACY_PATH_REWRITES) {
    if (pattern.test(path)) return replacement;
  }
  return path;
}

/**
 * URL prefixes that the navigation container will accept as deep links.
 *
 * 1. `thryftverse://` — the custom app scheme declared in `app.json` (`expo.scheme`).
 * 2. `https://thryftverse.com` — iOS Universal Links / Android App Links apex domain.
 * 3. `https://www.thryftverse.com` — the `www` variant so both hosts verify.
 *
 * The corresponding domain verification files must be served from the domains:
 *  - iOS:   `https://thryftverse.com/.well-known/apple-app-site-association`
 *  - Android: `https://thryftverse.com/.well-known/assetlinks.json`
 *
 * See `frontend/docs/DEEP_LINKS.md` for the full setup guide.
 */
export const DEEP_LINK_PREFIXES: readonly string[] = [
  'thryftverse://',
  'https://thryftverse.com',
  'https://www.thryftverse.com',
];

/**
 * React Navigation deep-linking configuration.
 *
 * Every screen name below MUST match a key in `RootStackParamList`
 * (or `TabParamList` for nested tab screens). The path parameter names
 * match the route parameter names declared in `types.ts` so that parsed
 * params are passed straight through to the screen without renaming.
 *
 * Screens that are intentionally omitted from this map (auth, creation
 * flows, settings sub-screens, etc.) are not reachable via public deep
 * links — they are internal navigation destinations only.
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [...DEEP_LINK_PREFIXES],

  // Group-invite URLs are handled manually in `App.tsx` (join + navigate
  // to Chat). Excluding them here prevents React Navigation from trying
  // to resolve them to a screen and keeps the existing invite flow intact.
  filter: (url: string) => !/group-invite/i.test(url),

  // Rewrite legacy deep-link paths before parsing so external URLs that
  // reference removed routes still land on their converged destination.
  getStateFromPath: (path, options) =>
    defaultGetStateFromPath(rewriteLegacyPath(path), options),

  config: {
    screens: {
      // Root stack — tab navigator. Each tab wraps a native-stack
      // navigator, so deep-linkable screens nested inside a tab stack
      // are addressable via their own path segments under the tab's
      // `screens` config (e.g. `thryftverse://category/123` resolves to
      // MainTabs > Explore > CategoryDetail).
      MainTabs: {
        screens: {
          Home: {
            screens: {
              Home: 'home',
              LookDetail: 'looks/:lookId',
              GalleriaCollectionDetail: 'galleria/collections/:collectionId',
              MoodboardHome: 'moodboards',
              YourAlgorithm: 'algorithm',
              StyleQuiz: 'style-quiz',
            },
          },
          Explore: {
            screens: {
              Explore: 'explore',
              CategoryDetail: 'category/:categoryId',
              CollectionDetail: 'collection/:collectionId',
              SavedSearches: 'saved-searches',
              // Discovery surfaces — moved from HomeStack during IA convergence (item-26 Phase 3).
              // Backward-compat: old deep-link paths (pulse, galleria, ai-search)
              // are preserved so external URLs continue to resolve.
              PulseFeed: 'pulse',
              Galleria: 'galleria',
              ConversationalSearch: 'ai-search',
            },
          },
          Inbox: 'inbox',
          Profile: {
            screens: {
              Profile: 'me',
            },
          },
        },
      },

      // Marketplace / product surfaces (root stack — cross-tab)
      ItemDetail: 'product/:itemId',
      Checkout: 'checkout/:itemId',
      Browse: 'browse/:categoryId',

      // Discovery (root stack — cross-tab)
      UnifiedDiscovery: 'search',

      // Settings & account (root stack — cross-tab)
      EditProfile: 'me/edit',
      Settings: 'settings',
      Personalisation: 'personalisation',
      Closet: 'closet',
      NotificationsList: 'notifications',
      SavedAddresses: 'addresses',
      Payments: 'payments',
      HelpSupport: 'help',
      Verification: 'verification',
      AccountSecurity: 'account-security',
      AccountSecurityRecovery: 'account-security/recovery/:caseId',

      // Auth — password reset deep link (thryftverse://auth/reset-password?token=…)
      ResetPassword: 'auth/reset-password',

      // Auctions
      AuctionHome: 'auctions',
      AuctionDetail: 'auction/:auctionId',
      MyBids: 'auctions/my-bids',

      // Co-Own / syndicate
      CoOwnHub: 'co-own',
      AssetDetail: 'asset/:assetId',
      AssetDueDiligence: 'asset/:assetId/due-diligence',
      Portfolio: 'portfolio',
      CoOwnOrderHistory: 'co-own/orders',
      MarketLedger: 'market',
      AssetLeaderboard: 'leaderboard',

      // Chat / social
      Chat: 'chat/:conversationId',
      UserProfile: 'user/:userId',
      BotDirectory: 'bots',
      BotDetail: 'bot/:botId',

      // Orders & wallet
      OrderDetail: 'order/:orderId',
      Wallet: 'wallet',
      MyOrders: 'orders',
      BalanceHistory: 'wallet/balance',
      Withdraw: 'wallet/withdraw',
      SellerEarnings: 'wallet/earnings',
      WalletHistory: 'wallet/history',
      WalletConvert: 'wallet/convert',
      AddBankAccount: 'wallet/bank-account',

      // Agent ledger — transparent record of agent actions and approvals
      AgentLedger: 'agent-ledger',

      // Seller tools
      SellerHub: 'seller-hub',
      SellerAnalytics: 'seller-analytics',
      CreatorAnalyticsDashboard: 'creator-analytics',
      InventoryManagement: 'inventory',

      // Support & help
      ResolutionCentre: 'resolution-centre',
      SupportConversation: 'support/conversation/:conversationId',
      SupportCaseDetail: 'support/case/:caseId',
      OrderSupport: 'support/order/:orderId',
      InviteFriends: 'invite',
      Postage: 'postage',

      // Moodboards
      MoodboardEditor: 'moodboards/:moodboardId',

      // Live shopping — live stream viewer is deep-linkable from push
      // notifications ("Seller is live now") and shared stream URLs.
      LiveShopping: 'live',
      LiveStreamViewer: 'live/:sessionId',
    },
  },
};
