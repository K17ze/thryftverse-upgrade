import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import {
  getCoOwnFlags,
  setDegradationLevel,
  updateFlags,
  isUserAllowed,
  isOrderSizeAllowed,
  subscribeToFlagChanges,
  type DegradationLevel,
} from '../services/coownFeatureFlags';

describe('Phase 4: Feature flags — progressive degradation', () => {
  beforeEach(() => {
    setDegradationLevel('normal');
    updateFlags({ allowedUserIds: null, maxOrderSize: null });
  });

  it('normal level allows all operations', () => {
    setDegradationLevel('normal');
    const flags = getCoOwnFlags();
    expect(flags.canPlaceOrders).toBe(true);
    expect(flags.realtimeEnabled).toBe(true);
    expect(flags.analyticsEnabled).toBe(true);
    expect(flags.isPaperMode).toBe(false);
  });

  it('light level disables analytics', () => {
    setDegradationLevel('light');
    const flags = getCoOwnFlags();
    expect(flags.canPlaceOrders).toBe(true);
    expect(flags.analyticsEnabled).toBe(false);
    expect(flags.notificationsEnabled).toBe(true);
  });

  it('moderate level disables realtime and notifications', () => {
    setDegradationLevel('moderate');
    const flags = getCoOwnFlags();
    expect(flags.canPlaceOrders).toBe(true);
    expect(flags.realtimeEnabled).toBe(false);
    expect(flags.notificationsEnabled).toBe(false);
  });

  it('severe level disables order placement (read-only)', () => {
    setDegradationLevel('severe');
    const flags = getCoOwnFlags();
    expect(flags.canPlaceOrders).toBe(false);
    expect(flags.canCancelOrders).toBe(true); // cancellation still allowed
    expect(flags.realtimeEnabled).toBe(false);
  });

  it('paper level enables paper trading mode', () => {
    setDegradationLevel('paper');
    const flags = getCoOwnFlags();
    expect(flags.isPaperMode).toBe(true);
    expect(flags.canPlaceOrders).toBe(true);
  });

  it('isUserAllowed returns true when no restriction', () => {
    updateFlags({ allowedUserIds: null });
    expect(isUserAllowed('user123')).toBe(true);
  });

  it('isUserAllowed checks allowed list when restricted', () => {
    updateFlags({ allowedUserIds: ['user1', 'user2'] });
    expect(isUserAllowed('user1')).toBe(true);
    expect(isUserAllowed('user3')).toBe(false);
  });

  it('isOrderSizeAllowed returns true when no limit', () => {
    updateFlags({ maxOrderSize: null });
    expect(isOrderSizeAllowed(1000000)).toBe(true);
  });

  it('isOrderSizeAllowed checks limit when set', () => {
    updateFlags({ maxOrderSize: 100 });
    expect(isOrderSizeAllowed(50)).toBe(true);
    expect(isOrderSizeAllowed(101)).toBe(false);
  });

  it('subscribeToFlagChanges notifies on update', () => {
    let received = false;
    const unsub = subscribeToFlagChanges(() => { received = true; });
    setDegradationLevel('light');
    expect(received).toBe(true);
    unsub();
  });

  it('unsubscribe stops notifications', () => {
    let count = 0;
    const unsub = subscribeToFlagChanges(() => { count++; });
    setDegradationLevel('light');
    const countAfterFirst = count;
    unsub();
    setDegradationLevel('normal');
    expect(count).toBe(countAfterFirst);
  });

  it('lastUpdated is set on every change', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    setDegradationLevel('normal');
    const before = getCoOwnFlags().lastUpdated;
    vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'));
    setDegradationLevel('light');
    const after = getCoOwnFlags().lastUpdated;
    expect(after).not.toBe(before);
    vi.useRealTimers();
  });
});
