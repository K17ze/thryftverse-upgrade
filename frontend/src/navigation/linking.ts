import type { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from './types';

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
              PulseFeed: 'pulse',
              LookDetail: 'looks/:lookId',
              Galleria: 'galleria',
              GalleriaCollectionDetail: 'galleria/collections/:collectionId',
              MoodboardHome: 'moodboards',
              YourAlgorithm: 'algorithm',
              StyleQuiz: 'style-quiz',
              ConversationalSearch: 'ai-search',
            },
          },
          Explore: {
            screens: {
              Explore: 'explore',
              CategoryDetail: 'category/:categoryId',
              CollectionDetail: 'collection/:collectionId',
              SavedSearches: 'saved-searches',
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

      // Discovery (root stack — cross-tab)
      GlobalSearch: 'search',

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
      Auctions: 'auctions/all',
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
      WalletActivity: 'wallet/activity',
      WalletConvert: 'wallet/convert',
      AddBankAccount: 'wallet/bank-account',

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
