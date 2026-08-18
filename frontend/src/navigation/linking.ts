import type { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList, TabParamList } from './types';

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
      // Root stack — tab navigator. Nested screens are addressable via
      // their own path segments (e.g. `thryftverse://home`).
      MainTabs: {
        screens: {
          Home: 'home',
          Explore: 'explore',
          Create: undefined, // Create tab is not deep-linkable (modal action)
          Inbox: 'inbox',
          Profile: 'me',
        } satisfies Record<keyof TabParamList, string | undefined>,
      },

      // Marketplace / product surfaces
      ItemDetail: 'product/:itemId',
      CategoryDetail: 'category/:categoryId',
      CollectionDetail: 'collection/:collectionId',
      Closet: 'closet',
      Checkout: 'checkout/:itemId',

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

      // Chat / social
      Chat: 'chat/:conversationId',
      UserProfile: 'user/:userId',

      // Orders & wallet
      OrderDetail: 'order/:orderId',
      Wallet: 'wallet',
      MyOrders: 'orders',
      BalanceHistory: 'wallet/balance',
      Withdraw: 'wallet/withdraw',
      SellerEarnings: 'wallet/earnings',
      WalletActivity: 'wallet/activity',

      // Discovery
      GlobalSearch: 'search',
      PulseFeed: 'pulse',
      LookDetail: 'looks/:lookId',
      NotificationsList: 'notifications',

      // Bots
      BotDirectory: 'bots',
      BotDetail: 'bot/:botId',

      // Moodboards
      MoodboardEditor: 'moodboards/:moodboardId',

      // Galleria collections
      GalleriaCollectionDetail: 'galleria/collections/:collectionId',

      // Live shopping — live stream viewer is deep-linkable from push
      // notifications ("Seller is live now") and shared stream URLs.
      LiveShopping: 'live',
      LiveStreamViewer: 'live/:sessionId',
    },
  },
};
