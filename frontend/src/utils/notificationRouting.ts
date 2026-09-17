import type { RootStackParamList } from '../navigation/types';

type ScreenName = keyof RootStackParamList;

export interface NotificationRoute {
  screen: string;
  params?: Record<string, unknown>;
}

export type ResolvedRoute =
  | { screen: 'OrderDetail'; params: { orderId: string } }
  | { screen: 'ItemDetail'; params: { itemId: string } }
  | { screen: 'SupportTicketDetail'; params: { ticketId: string } }
  | { screen: 'AuctionDetail'; params: { auctionId: string; openBidSheet?: boolean; initialBidAmount?: number } }
  | { screen: 'SellerFulfilment'; params: { orderId: string } }
  | { screen: 'SupportCaseDetail'; params: { caseId: string } }
  | { screen: 'Wallet' }
  | { screen: 'BalanceHistory' }
  | { screen: 'NotificationsList' }
  | { screen: 'UserProfile'; params: { userId: string } }
  | { screen: 'Chat'; params: { conversationId: string; partnerUserId?: string } }
  | { screen: 'LiveStreamViewer'; params: { sessionId: string } }
  | { screen: 'AssetDetail'; params: { assetId: string } }
  | { screen: 'VerificationResponse'; params: { assetId: string; demandId: number } }
  | { screen: 'CollectionDetail'; params: { collectionId: string } }
  | { screen: 'Browse'; params: { categoryId: string; title: string; searchQuery?: string } }
  | { screen: ScreenName; params?: Record<string, unknown> }
  | null;

const VALID_SCREENS: ReadonlySet<string> = new Set<ScreenName>([
  'Wallet',
  'BalanceHistory',
  'NotificationsList',
  'MyOrders',
  'HelpSupport',
  'PushNotifications',
  'Settings',
  'MainTabs',
  'AuctionHome',
  'SellerAuctionCentre',
  'MyBids',
  'CoOwnHub',
  'Portfolio',
  'CoOwnOrderHistory',
  'SellerVerification',
  'VerificationResponse',
  'Withdraw',
  'SellerEarnings',
  'WalletHistory',
  'LiveShopping',
  'SellerFulfilment',
  'SupportCaseDetail',
  'SupportTicketDetail',
  'OrderDetail',
  'ItemDetail',
  'Chat',
  'AuctionDetail',
  'UserProfile',
  'LiveStreamViewer',
  'AssetDetail',
  'CollectionDetail',
  'Browse',
  'Offers',
  'ResolutionCentre',
  'OrderSupport',
  'SavedSearches',
  // Scheduled-publication events (success/blocked/failed) route creators to
  // the drafts library where the published/failed document lives.
  'CreatorDraftList',
]);

/**
 * Screens whose params are validated by dedicated branches above. The
 * generic VALID_SCREENS passthrough must NOT admit these — a malformed
 * route (e.g. OrderDetail without orderId) would otherwise navigate to a
 * screen that renders a broken state. Reaching the allowlist with one of
 * these names means required params were absent; the event falls through
 * to the payload fallback, then null.
 */
const PARAM_VALIDATED_SCREENS: ReadonlySet<string> = new Set([
  'OrderDetail',
  'ItemDetail',
  'SupportTicketDetail',
  'AuctionDetail',
  'SellerFulfilment',
  'SupportCaseDetail',
  'UserProfile',
  'Chat',
  'LiveStreamViewer',
  'AssetDetail',
  'VerificationResponse',
  'CollectionDetail',
  'Browse',
]);

export function resolveNotificationRoute(
  route: NotificationRoute | null | undefined,
  payload?: Record<string, unknown> | null | undefined,
): ResolvedRoute {
  if (route && typeof route.screen === 'string') {
    const screen = route.screen;
    const params = route.params ?? {};

    if (screen === 'OrderDetail' && typeof params.orderId === 'string') {
      return { screen: 'OrderDetail', params: { orderId: params.orderId } };
    }
    if (screen === 'ItemDetail' && typeof params.itemId === 'string') {
      return { screen: 'ItemDetail', params: { itemId: params.itemId } };
    }
    if (screen === 'SupportTicketDetail' && typeof params.ticketId === 'string') {
      return { screen: 'SupportTicketDetail', params: { ticketId: params.ticketId } };
    }
    if (screen === 'Wallet') {
      return { screen: 'Wallet' };
    }
    if (screen === 'BalanceHistory') {
      return { screen: 'BalanceHistory' };
    }
    if (screen === 'NotificationsList') {
      return { screen: 'NotificationsList' };
    }
    if (screen === 'UserProfile' && typeof params.userId === 'string') {
      return { screen: 'UserProfile', params: { userId: params.userId } };
    }
    if (screen === 'Chat' && typeof params.conversationId === 'string') {
      return {
        screen: 'Chat',
        params: {
          conversationId: params.conversationId,
          partnerUserId: typeof params.partnerUserId === 'string' ? params.partnerUserId : undefined,
        },
      };
    }
    if (screen === 'LiveStreamViewer' && typeof params.sessionId === 'string') {
      return { screen: 'LiveStreamViewer', params: { sessionId: params.sessionId } };
    }
    if (screen === 'AssetDetail' && typeof params.assetId === 'string') {
      return { screen: 'AssetDetail', params: { assetId: params.assetId } };
    }
    if (
      screen === 'VerificationResponse' &&
      typeof params.assetId === 'string' &&
      typeof params.demandId === 'number'
    ) {
      return {
        screen: 'VerificationResponse',
        params: { assetId: params.assetId, demandId: params.demandId },
      };
    }
    if (screen === 'CollectionDetail' && typeof params.collectionId === 'string') {
      return { screen: 'CollectionDetail', params: { collectionId: params.collectionId } };
    }
    // Dispatch-deadline breaches route sellers to the fulfilment surface.
    if (screen === 'SellerFulfilment' && typeof params.orderId === 'string') {
      return { screen: 'SellerFulfilment', params: { orderId: params.orderId } };
    }
    // Support-case events — the backend emits both the registered
    // 'SupportCaseDetail' name and the legacy 'support_case' alias.
    if (
      (screen === 'SupportCaseDetail' || screen === 'support_case') &&
      typeof params.caseId === 'string'
    ) {
      return { screen: 'SupportCaseDetail', params: { caseId: params.caseId } };
    }
    // Saved-search match notifications land on the search results for the
    // saved query — same destination as tapping the row in SavedSearches.
    if (
      screen === 'Browse' &&
      typeof params.categoryId === 'string' &&
      typeof params.title === 'string'
    ) {
      return {
        screen: 'Browse',
        params: {
          categoryId: params.categoryId,
          title: params.title,
          searchQuery: typeof params.searchQuery === 'string' ? params.searchQuery : undefined,
        },
      };
    }
    if (screen === 'AuctionDetail' && typeof params.auctionId === 'string') {
      return {
        screen: 'AuctionDetail',
        params: {
          auctionId: params.auctionId,
          openBidSheet: params.openBidSheet === true || payload?.openBidSheet === true,
          initialBidAmount:
            typeof params.initialBidAmount === 'number'
              ? params.initialBidAmount
              : typeof payload?.initialBidAmount === 'number'
                ? payload.initialBidAmount
                : typeof payload?.minimumNextBidGbp === 'number'
                  ? payload.minimumNextBidGbp
                  : undefined,
        },
      };
    }
    if (screen === 'AuctionHome') {
      return { screen: 'AuctionHome' };
    }
    if (screen === 'MyBids') {
      return { screen: 'MyBids' };
    }
    if (screen === 'CoOwnHub') {
      return { screen: 'CoOwnHub' };
    }
    if (screen === 'Portfolio') {
      return { screen: 'Portfolio' };
    }
    if (VALID_SCREENS.has(screen) && !PARAM_VALIDATED_SCREENS.has(screen)) {
      return { screen: screen as ScreenName, params };
    }
  }

  if (payload) {
    const orderId = typeof payload.orderId === 'string' ? payload.orderId : null;
    if (orderId) {
      return { screen: 'OrderDetail', params: { orderId } };
    }

    const ticketId = typeof payload.ticketId === 'string' ? payload.ticketId : null;
    if (ticketId) {
      return { screen: 'SupportTicketDetail', params: { ticketId } };
    }

    const auctionId = typeof payload.auctionId === 'string' ? payload.auctionId : null;
    if (auctionId) {
      return {
        screen: 'AuctionDetail',
        params: {
          auctionId,
          openBidSheet: payload.openBidSheet === true,
          initialBidAmount:
            typeof payload.initialBidAmount === 'number'
              ? payload.initialBidAmount
              : typeof payload.minimumNextBidGbp === 'number'
                ? payload.minimumNextBidGbp
                : undefined,
        },
      };
    }

    const assetId = typeof payload.assetId === 'string' ? payload.assetId : null;
    const demandId = typeof payload.demandId === 'number' ? payload.demandId : null;
    if (assetId && demandId) {
      return { screen: 'VerificationResponse', params: { assetId, demandId } };
    }
    if (assetId) {
      return { screen: 'AssetDetail', params: { assetId } };
    }

    const listingId = typeof payload.listingId === 'string' ? payload.listingId : null;
    if (listingId) {
      return { screen: 'ItemDetail', params: { itemId: listingId } };
    }

    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : null;
    if (sessionId) {
      return { screen: 'LiveStreamViewer', params: { sessionId } };
    }

    const collectionId = typeof payload.collectionId === 'string' ? payload.collectionId : null;
    if (collectionId) {
      return { screen: 'CollectionDetail', params: { collectionId } };
    }

    // Chat events persist without a route — the conversation id is the
    // destination.
    const conversationId = typeof payload.conversationId === 'string' ? payload.conversationId : null;
    if (conversationId) {
      const partnerUserId =
        typeof payload.partnerUserId === 'string' ? payload.partnerUserId
        : typeof payload.senderId === 'string' ? payload.senderId
        : typeof payload.actorUserId === 'string' ? payload.actorUserId
        : undefined;
      return { screen: 'Chat', params: { conversationId, partnerUserId } };
    }

    const caseId = typeof payload.caseId === 'string' ? payload.caseId : null;
    if (caseId) {
      return { screen: 'SupportCaseDetail', params: { caseId } };
    }
  }

  return null;
}

export function extractRouteFromPushData(
  data: Record<string, unknown> | undefined | null,
): ResolvedRoute {
  if (!data) return null;

  const route = data.route as NotificationRoute | null | undefined;
  if (route) {
    return resolveNotificationRoute(route, data);
  }

  return resolveNotificationRoute(null, data);
}
