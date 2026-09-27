import { describe, it, expect } from 'vitest';
import {
  upgradeToV2,
  NotificationEventRegistry,
  type NotificationEvent,
  type NotificationEventType,
} from '../services/notificationsApi';
import {
  mapEventToCard,
  FILTER_EVENT_TYPES,
} from '../components/notifications/notificationViewModels';

/**
 * Notification contract parity (review P1-3): the backend registers and
 * emits five event types that were absent from the frontend union, card
 * map and filter buckets — they degraded to 'generic' and could not be
 * filtered. These tests pin each type's semantic role, card grouping and
 * filter coverage. On the old contract every assertion here fails.
 */

const NEW_EVENT_TYPES = [
  'order_delivery_failed',
  'order_parcel_lost',
  'order_parcel_damaged',
  'coown_price_alert_triggered',
  'coown_drip_receipt',
] as const satisfies readonly NotificationEventType[];

function makeEvent(eventType: string, payload: Record<string, unknown> = {}): NotificationEvent {
  return {
    id: `evt_${eventType}`,
    userId: 'usr_1',
    channel: 'in_app',
    title: 't',
    body: 'b',
    payload,
    status: 'sent',
    providerMessageId: null,
    providerError: null,
    createdAt: new Date().toISOString(),
    sentAt: null,
    eventType: eventType as NotificationEvent['eventType'],
    actorUserId: null,
    actorUsername: null,
    actorDisplayName: null,
    actorAvatar: null,
    readAt: null,
    imageUrl: null,
    route: null,
  };
}

describe('new backend event types are first-class registry entries', () => {
  it.each(NEW_EVENT_TYPES)('%s resolves to a registry entry, not generic', (eventType) => {
    expect(eventType in NotificationEventRegistry).toBe(true);
    const v2 = upgradeToV2(makeEvent(eventType, { orderId: 'ord_1', assetId: 'ast_1' }));
    expect(v2.eventType).toBe(eventType);
    expect(v2.semanticRole).not.toBe('system');
  });

  it.each([
    'order_delivery_failed',
    'order_parcel_lost',
    'order_parcel_damaged',
  ] as const)('%s is a commerce event that aggregates per order', (eventType) => {
    const v2 = upgradeToV2(makeEvent(eventType, { orderId: 'ord_9' }));
    expect(v2.semanticRole).toBe('commerce');
    expect(v2.attention).toBe('important');
    expect(v2.requiresAction).toBe(false);
    expect(v2.aggregationKey).toBe(`${eventType}:ord_9`);
    expect(v2.objectRef).toEqual({ type: 'order', id: 'ord_9', label: undefined, imageUrl: undefined });
  });

  it.each([
    'coown_price_alert_triggered',
    'coown_drip_receipt',
  ] as const)('%s is a financial event that aggregates per asset', (eventType) => {
    const v2 = upgradeToV2(makeEvent(eventType, { assetId: 'ast_7' }));
    expect(v2.semanticRole).toBe('financial');
    expect(v2.attention).toBe('important');
    expect(v2.requiresAction).toBe(false);
    expect(v2.aggregationKey).toMatch(new RegExp(`^${eventType}:coown_`));
    expect(v2.aggregationKey).toContain('ast_7');
  });
});

describe('card presentation and filtering', () => {
  it.each(NEW_EVENT_TYPES)('%s renders a typed card, not generic', (eventType) => {
    const card = mapEventToCard(makeEvent(eventType));
    expect(card.type).toBe('order');
    expect(card.eventType).toBe(eventType);
  });

  it.each(NEW_EVENT_TYPES)('%s is reachable from the order filter bucket', (eventType) => {
    expect(FILTER_EVENT_TYPES.order).toContain(eventType);
  });

  it('parcel failures sit in the order bucket alongside delivery events', () => {
    const order = FILTER_EVENT_TYPES.order;
    for (const t of ['order_delivered', 'order_delivery_failed', 'order_parcel_lost', 'order_parcel_damaged']) {
      expect(order).toContain(t);
    }
  });
});
