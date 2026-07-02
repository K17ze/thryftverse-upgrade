import { describe, it, expect } from 'vitest';
import { resolveNotificationRoute, extractRouteFromPushData } from '../utils/notificationRouting';

describe('resolveNotificationRoute', () => {
  it('resolves OrderDetail route with orderId', () => {
    const result = resolveNotificationRoute({ screen: 'OrderDetail', params: { orderId: 'ord_123' } });
    expect(result).toEqual({ screen: 'OrderDetail', params: { orderId: 'ord_123' } });
  });

  it('resolves ItemDetail route with itemId', () => {
    const result = resolveNotificationRoute({ screen: 'ItemDetail', params: { itemId: 'item_456' } });
    expect(result).toEqual({ screen: 'ItemDetail', params: { itemId: 'item_456' } });
  });

  it('resolves SupportTicketDetail route with ticketId', () => {
    const result = resolveNotificationRoute({ screen: 'SupportTicketDetail', params: { ticketId: 'tkt_789' } });
    expect(result).toEqual({ screen: 'SupportTicketDetail', params: { ticketId: 'tkt_789' } });
  });

  it('resolves Wallet route without params', () => {
    const result = resolveNotificationRoute({ screen: 'Wallet' });
    expect(result).toEqual({ screen: 'Wallet' });
  });

  it('resolves BalanceHistory route without params', () => {
    const result = resolveNotificationRoute({ screen: 'BalanceHistory' });
    expect(result).toEqual({ screen: 'BalanceHistory' });
  });

  it('resolves NotificationsList route without params', () => {
    const result = resolveNotificationRoute({ screen: 'NotificationsList' });
    expect(result).toEqual({ screen: 'NotificationsList' });
  });

  it('resolves UserProfile route with userId', () => {
    const result = resolveNotificationRoute({ screen: 'UserProfile', params: { userId: 'usr_abc' } });
    expect(result).toEqual({ screen: 'UserProfile', params: { userId: 'usr_abc' } });
  });

  it('resolves Chat route with conversationId and partnerUserId', () => {
    const result = resolveNotificationRoute({ screen: 'Chat', params: { conversationId: 'conv_1', partnerUserId: 'usr_2' } });
    expect(result).toEqual({ screen: 'Chat', params: { conversationId: 'conv_1', partnerUserId: 'usr_2' } });
  });

  it('resolves Chat route with conversationId only', () => {
    const result = resolveNotificationRoute({ screen: 'Chat', params: { conversationId: 'conv_1' } });
    expect(result).toEqual({ screen: 'Chat', params: { conversationId: 'conv_1', partnerUserId: undefined } });
  });

  it('resolves AuctionDetail route with auctionId', () => {
    const result = resolveNotificationRoute({ screen: 'AuctionDetail', params: { auctionId: 'auc_123' } });
    expect(result).toEqual({ screen: 'AuctionDetail', params: { auctionId: 'auc_123' } });
  });

  it('resolves AuctionHome as valid screen', () => {
    const result = resolveNotificationRoute({ screen: 'AuctionHome' });
    expect(result).toEqual({ screen: 'AuctionHome' });
  });

  it('resolves MyBids as valid screen', () => {
    const result = resolveNotificationRoute({ screen: 'MyBids' });
    expect(result).toEqual({ screen: 'MyBids' });
  });

  it('falls back to payload orderId when route is null', () => {
    const result = resolveNotificationRoute(null, { orderId: 'ord_fallback' });
    expect(result).toEqual({ screen: 'OrderDetail', params: { orderId: 'ord_fallback' } });
  });

  it('falls back to payload listingId when route is null', () => {
    const result = resolveNotificationRoute(null, { listingId: 'list_fb' });
    expect(result).toEqual({ screen: 'ItemDetail', params: { itemId: 'list_fb' } });
  });

  it('falls back to payload ticketId when route is null', () => {
    const result = resolveNotificationRoute(null, { ticketId: 'tkt_fb' });
    expect(result).toEqual({ screen: 'SupportTicketDetail', params: { ticketId: 'tkt_fb' } });
  });

  it('falls back to payload auctionId when route is null', () => {
    const result = resolveNotificationRoute(null, { auctionId: 'auc_fb' });
    expect(result).toEqual({ screen: 'AuctionDetail', params: { auctionId: 'auc_fb' } });
  });

  it('returns null when no route or payload identifiers', () => {
    const result = resolveNotificationRoute(null, { foo: 'bar' });
    expect(result).toBeNull();
  });

  it('returns null when route screen is unknown', () => {
    const result = resolveNotificationRoute({ screen: 'NonExistentScreen' });
    expect(result).toBeNull();
  });

  it('returns null when route screen is valid but missing required params', () => {
    const result = resolveNotificationRoute({ screen: 'OrderDetail' });
    expect(result).toBeNull();
  });

  it('returns null when AuctionDetail route is missing auctionId', () => {
    const result = resolveNotificationRoute({ screen: 'AuctionDetail' });
    expect(result).toBeNull();
  });

  it('returns null when all inputs are null/undefined', () => {
    const result = resolveNotificationRoute(null, null);
    expect(result).toBeNull();
  });
});

describe('extractRouteFromPushData', () => {
  it('extracts route from push data with route object', () => {
    const data = { route: { screen: 'OrderDetail', params: { orderId: 'ord_1' } } };
    const result = extractRouteFromPushData(data);
    expect(result).toEqual({ screen: 'OrderDetail', params: { orderId: 'ord_1' } });
  });

  it('falls back to payload fields when no route object', () => {
    const data = { orderId: 'ord_2' };
    const result = extractRouteFromPushData(data);
    expect(result).toEqual({ screen: 'OrderDetail', params: { orderId: 'ord_2' } });
  });

  it('returns null when data is null', () => {
    const result = extractRouteFromPushData(null);
    expect(result).toBeNull();
  });

  it('returns null when data is undefined', () => {
    const result = extractRouteFromPushData(undefined);
    expect(result).toBeNull();
  });

  it('returns null when data is empty', () => {
    const result = extractRouteFromPushData({});
    expect(result).toBeNull();
  });
});
