import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fetchJson before importing the telemetry module so the network call
// is intercepted and never reaches a real backend.
vi.mock('../lib/apiClient', () => ({
  fetchJson: vi.fn().mockResolvedValue(undefined),
}));

import {
  trackTelemetryEvent,
  trackScreenView,
  trackFunnelStep,
  trackFeatureUsage,
  trackButtonTap,
  setTelemetryHandler,
  setAnalyticsOptOut,
  isAnalyticsOptOutEnabled,
} from '../lib/telemetry';
import { fetchJson } from '../lib/apiClient';

const mockedFetchJson = vi.mocked(fetchJson);

describe('telemetry — core tracking', () => {
  beforeEach(() => {
    mockedFetchJson.mockClear();
    setTelemetryHandler(null);
    setAnalyticsOptOut(false);
  });

  it('sends an event to the backend via fetchJson', () => {
    trackTelemetryEvent('test_event', { foo: 'bar' });

    expect(mockedFetchJson).toHaveBeenCalledTimes(1);
    const [endpoint, options] = mockedFetchJson.mock.calls[0];
    expect(endpoint).toBe('/analytics/events');
    expect(options?.method).toBe('POST');
    const body = JSON.parse(options?.body as string);
    expect(body.event).toBe('test_event');
    expect(body.foo).toBe('bar');
  });

  it('dispatches to a registered telemetry handler', () => {
    const handler = vi.fn();
    setTelemetryHandler(handler);

    trackTelemetryEvent('handler_event', { value: 42 });

    expect(handler).toHaveBeenCalledWith('handler_event', { value: 42 });
  });

  it('survives a handler that throws', () => {
    const handler = vi.fn(() => {
      throw new Error('boom');
    });
    setTelemetryHandler(handler);

    // Should not throw
    expect(() => trackTelemetryEvent('crashy', {})).not.toThrow();
    // Backend call should still happen
    expect(mockedFetchJson).toHaveBeenCalled();
  });
});

describe('telemetry — opt-out', () => {
  beforeEach(() => {
    mockedFetchJson.mockClear();
    setTelemetryHandler(null);
    setAnalyticsOptOut(false);
  });

  it('suppresses events when opt-out is enabled', () => {
    setAnalyticsOptOut(true);
    expect(isAnalyticsOptOutEnabled()).toBe(true);

    trackTelemetryEvent('should_not_send', {});

    expect(mockedFetchJson).not.toHaveBeenCalled();
  });

  it('does not call the handler when opted out', () => {
    const handler = vi.fn();
    setTelemetryHandler(handler);
    setAnalyticsOptOut(true);

    trackTelemetryEvent('should_not_dispatch', {});

    expect(handler).not.toHaveBeenCalled();
  });

  it('resumes tracking when opt-out is disabled', () => {
    setAnalyticsOptOut(true);
    trackTelemetryEvent('suppressed', {});
    expect(mockedFetchJson).not.toHaveBeenCalled();

    setAnalyticsOptOut(false);
    trackTelemetryEvent('resumed', {});
    expect(mockedFetchJson).toHaveBeenCalledTimes(1);
  });
});

describe('telemetry — PII scrubbing', () => {
  beforeEach(() => {
    mockedFetchJson.mockClear();
    setTelemetryHandler(null);
    setAnalyticsOptOut(false);
  });

  it('strips email from payload', () => {
    trackTelemetryEvent('user_action', { email: 'user@example.com', action: 'tap' });

    const body = JSON.parse(mockedFetchJson.mock.calls[0][1]?.body as string);
    expect(body.email).toBeUndefined();
    expect(body.action).toBe('tap');
  });

  it('strips name, phone, address, username from payload', () => {
    trackTelemetryEvent('profile_view', {
      name: 'Jane',
      phone: '555-1234',
      address: '123 Main St',
      username: 'jane_doe',
      listingId: 'abc123',
    });

    const body = JSON.parse(mockedFetchJson.mock.calls[0][1]?.body as string);
    expect(body.name).toBeUndefined();
    expect(body.phone).toBeUndefined();
    expect(body.address).toBeUndefined();
    expect(body.username).toBeUndefined();
    // Non-PII fields are preserved
    expect(body.listingId).toBe('abc123');
  });

  it('strips token and password keys', () => {
    trackTelemetryEvent('auth_event', { token: 'secret', password: 'hunter2', success: true });

    const body = JSON.parse(mockedFetchJson.mock.calls[0][1]?.body as string);
    expect(body.token).toBeUndefined();
    expect(body.password).toBeUndefined();
    expect(body.success).toBe(true);
  });

  it('strips device and location fragments case-insensitively', () => {
    trackTelemetryEvent('session', {
      DeviceId: 'abc',
      latitude: 40.7,
      Longitude: -74.0,
      ip: '192.168.1.1',
      sessionId: 'sess_123',
    });

    const body = JSON.parse(mockedFetchJson.mock.calls[0][1]?.body as string);
    expect(body.DeviceId).toBeUndefined();
    expect(body.latitude).toBeUndefined();
    expect(body.Longitude).toBeUndefined();
    expect(body.ip).toBeUndefined();
    expect(body.sessionId).toBe('sess_123');
  });
});

describe('telemetry — helper functions', () => {
  beforeEach(() => {
    mockedFetchJson.mockClear();
    setTelemetryHandler(null);
    setAnalyticsOptOut(false);
  });

  it('trackScreenView sends a screen_view event with screen name and params', () => {
    trackScreenView('ItemDetail', { itemId: 'listing_42' });

    const body = JSON.parse(mockedFetchJson.mock.calls[0][1]?.body as string);
    expect(body.event).toBe('screen_view');
    expect(body.screen).toBe('ItemDetail');
    expect(body.itemId).toBe('listing_42');
  });

  it('trackScreenView works without params', () => {
    trackScreenView('Home');

    const body = JSON.parse(mockedFetchJson.mock.calls[0][1]?.body as string);
    expect(body.event).toBe('screen_view');
    expect(body.screen).toBe('Home');
  });

  it('trackScreenView scrubs PII from params', () => {
    trackScreenView('Profile', { userId: 'u_123', email: 'a@b.com' });

    const body = JSON.parse(mockedFetchJson.mock.calls[0][1]?.body as string);
    expect(body.email).toBeUndefined();
    expect(body.userId).toBe('u_123');
  });

  it('trackFunnelStep sends a funnel_step event with funnel, step, step_number', () => {
    trackFunnelStep('checkout', 'payment', 3);

    const body = JSON.parse(mockedFetchJson.mock.calls[0][1]?.body as string);
    expect(body.event).toBe('funnel_step');
    expect(body.funnel).toBe('checkout');
    expect(body.step).toBe('payment');
    expect(body.step_number).toBe(3);
  });

  it('trackFeatureUsage sends a feature_usage event with feature and action', () => {
    trackFeatureUsage('style_quiz', 'completed');

    const body = JSON.parse(mockedFetchJson.mock.calls[0][1]?.body as string);
    expect(body.event).toBe('feature_usage');
    expect(body.feature).toBe('style_quiz');
    expect(body.action).toBe('completed');
  });

  it('trackButtonTap sends a button_tap event with action and context', () => {
    trackButtonTap('add_to_wishlist', { section: 'item_detail' });

    const body = JSON.parse(mockedFetchJson.mock.calls[0][1]?.body as string);
    expect(body.event).toBe('button_tap');
    expect(body.action).toBe('add_to_wishlist');
    expect(body.section).toBe('item_detail');
  });

  it('all helpers respect the opt-out preference', () => {
    setAnalyticsOptOut(true);

    trackScreenView('Home');
    trackFunnelStep('onboarding', 'step_1', 1);
    trackFeatureUsage('feature', 'action');
    trackButtonTap('tap');

    expect(mockedFetchJson).not.toHaveBeenCalled();
  });
});
