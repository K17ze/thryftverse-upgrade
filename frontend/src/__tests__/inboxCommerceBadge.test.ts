import { describe, it, expect } from 'vitest';
import { deriveInboxCommerceBadge } from '../utils/conversationClassification';
import type { ConversationContext } from '../domain';

/**
 * Inbox commerce badge — the row's "money in flight" signal is derived from
 * the server-authoritative ConversationContext. Order beats offer beats
 * listing terminal state (same priority as ChatListingContextBar). Terminal
 * facts map to quiet neutral tones, never fabricated states.
 */

const ctx = (partial: ConversationContext): ConversationContext => partial;

describe('deriveInboxCommerceBadge', () => {
  it('returns null when no server context exists', () => {
    expect(deriveInboxCommerceBadge(undefined)).toBeNull();
    expect(deriveInboxCommerceBadge(ctx({}))).toBeNull();
  });

  it('maps order statuses to labels and tones', () => {
    const order = { id: 'o1', status: 'paid' as const, totalAmount: 100, currency: 'GBP', createdAt: '2025-01-01' };
    expect(deriveInboxCommerceBadge(ctx({ order }))).toEqual({ label: 'Paid', tone: 'brand' });
    expect(deriveInboxCommerceBadge(ctx({ order: { ...order, status: 'delivered' } }))).toEqual({ label: 'Delivered', tone: 'success' });
    expect(deriveInboxCommerceBadge(ctx({ order: { ...order, status: 'cancelled' } }))).toEqual({ label: 'Cancelled', tone: 'danger' });
    expect(deriveInboxCommerceBadge(ctx({ order: { ...order, status: 'refunded' } }))).toEqual({ label: 'Refunded', tone: 'danger' });
  });

  it('maps offer statuses when no order is present', () => {
    const offer = { id: 'f1', amount: 50, currency: 'GBP', status: 'pending' as const, expiresAt: '2025-01-02' };
    expect(deriveInboxCommerceBadge(ctx({ offer }))).toEqual({ label: 'Offer pending', tone: 'warning' });
    expect(deriveInboxCommerceBadge(ctx({ offer: { ...offer, status: 'countered' } }))).toEqual({ label: 'Countered', tone: 'warning' });
    expect(deriveInboxCommerceBadge(ctx({ offer: { ...offer, status: 'accepted' } }))).toEqual({ label: 'Offer accepted', tone: 'success' });
    expect(deriveInboxCommerceBadge(ctx({ offer: { ...offer, status: 'rejected' } }))).toEqual({ label: 'Offer declined', tone: 'danger' });
    expect(deriveInboxCommerceBadge(ctx({ offer: { ...offer, status: 'expired' } }))).toEqual({ label: 'Offer expired', tone: 'neutral' });
    expect(deriveInboxCommerceBadge(ctx({ offer: { ...offer, status: 'withdrawn' } }))).toEqual({ label: 'Offer withdrawn', tone: 'neutral' });
  });

  it('order outranks offer when both exist', () => {
    const order = { id: 'o1', status: 'shipped' as const, totalAmount: 100, currency: 'GBP', createdAt: '2025-01-01' };
    const offer = { id: 'f1', amount: 50, currency: 'GBP', status: 'accepted' as const, expiresAt: '2025-01-02' };
    expect(deriveInboxCommerceBadge(ctx({ order, offer }))).toEqual({ label: 'Shipped', tone: 'brand' });
  });

  it('offer outranks listing terminal state', () => {
    const offer = { id: 'f1', amount: 50, currency: 'GBP', status: 'pending' as const, expiresAt: '2025-01-02' };
    const listing = { id: 'l1', title: 'T', price: 10, currency: 'GBP', status: 'sold' as const };
    expect(deriveInboxCommerceBadge(ctx({ offer, listing }))).toEqual({ label: 'Offer pending', tone: 'warning' });
  });

  it('maps listing terminal states and stays silent on active', () => {
    const base = { id: 'l1', title: 'T', price: 10, currency: 'GBP' };
    expect(deriveInboxCommerceBadge(ctx({ listing: { ...base, status: 'sold' } }))).toEqual({ label: 'Sold', tone: 'neutral' });
    expect(deriveInboxCommerceBadge(ctx({ listing: { ...base, status: 'paused' } }))).toEqual({ label: 'Paused', tone: 'neutral' });
    expect(deriveInboxCommerceBadge(ctx({ listing: { ...base, status: 'deleted' } }))).toEqual({ label: 'Removed', tone: 'neutral' });
    expect(deriveInboxCommerceBadge(ctx({ listing: { ...base, status: 'active' } }))).toBeNull();
  });
});
