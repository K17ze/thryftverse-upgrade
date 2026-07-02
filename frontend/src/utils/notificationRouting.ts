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
  | { screen: 'AuctionDetail'; params: { auctionId: string } }
  | { screen: 'Wallet' }
  | { screen: 'BalanceHistory' }
  | { screen: 'NotificationsList' }
  | { screen: 'UserProfile'; params: { userId: string } }
  | { screen: 'Chat'; params: { conversationId: string; partnerUserId?: string } }
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
    if (screen === 'AuctionDetail' && typeof params.auctionId === 'string') {
      return { screen: 'AuctionDetail', params: { auctionId: params.auctionId } };
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
    if (VALID_SCREENS.has(screen)) {
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
      return { screen: 'AuctionDetail', params: { auctionId } };
    }

    const assetId = typeof payload.assetId === 'string' ? payload.assetId : null;
    if (assetId) {
      return { screen: 'AssetDetail', params: { assetId } };
    }

    const listingId = typeof payload.listingId === 'string' ? payload.listingId : null;
    if (listingId) {
      return { screen: 'ItemDetail', params: { itemId: listingId } };
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
