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
  flushTelemetry,
} from '../lib/telemetry';
import { fetchJson } from '../lib/apiClient';

const mockedFetchJson = vi.mocked(fetchJson);

describe('telemetry — core tracking', () => {
  beforeEach(() => {
    mockedFetchJson.mockClear();
    setTelemetryHandler(null);
    setAnalyticsOptOut(false);
  });

  it('batches and flushes events to the backend via fetchJson', async () => {
    trackTelemetryEvent('test_event', { foo: 'bar' });
    await flushTelemetry();

    expect(mockedFetchJson).toHaveBeenCalledTimes(1);
    const [endpoint, options] = mockedFetchJson.mock.calls[0];
    expect(endpoint).toBe('/analytics/events/batch');
    expect(options?.method).toBe('POST');
    const body = JSON.parse(options?.body as string);
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events.length).toBe(1);
    expect(body.events[0].event).toBe('test_event');
    expect(body.events[0].payload.foo).toBe('bar');
  });

  it('dispatches to a registered telemetry handler with enriched payload', () => {
    const handler = vi.fn();
    setTelemetryHandler(handler);

    trackTelemetryEvent('handler_event', { value: 42 });

    expect(handler).toHaveBeenCalledTimes(1);
    const [eventName, payload] = handler.mock.calls[0];
    expect(eventName).toBe('handler_event');
    expect(payload.value).toBe(42);
    expect(payload.session_id).toBeDefined();
    expect(payload.timestamp).toBeDefined();
  });

  it('survives a handler that throws', async () => {
    const handler = vi.fn(() => {
      throw new Error('boom');
    });
    setTelemetryHandler(handler);

    // Should not throw
    expect(() => trackTelemetryEvent('crashy', {})).not.toThrow();
    // Backend call should still happen on flush
    await flushTelemetry();
    expect(mockedFetchJson).toHaveBeenCalled();
  });
});

describe('telemetry — opt-out', () => {
  beforeEach(() => {
    mockedFetchJson.mockClear();
    setTelemetryHandler(null);
    setAnalyticsOptOut(false);
  });

  it('suppresses events when opt-out is enabled', async () => {
    setAnalyticsOptOut(true);
    expect(isAnalyticsOptOutEnabled()).toBe(true);

    trackTelemetryEvent('should_not_send', {});
    await flushTelemetry();

    expect(mockedFetchJson).not.toHaveBeenCalled();
  });

  it('does not call the handler when opted out', () => {
    const handler = vi.fn();
    setTelemetryHandler(handler);
    setAnalyticsOptOut(true);

    trackTelemetryEvent('should_not_dispatch', {});

    expect(handler).not.toHaveBeenCalled();
  });

  it('resumes tracking when opt-out is disabled', async () => {
    setAnalyticsOptOut(true);
    trackTelemetryEvent('suppressed', {});
    await flushTelemetry();
    expect(mockedFetchJson).not.toHaveBeenCalled();

    setAnalyticsOptOut(false);
    trackTelemetryEvent('resumed', {});
    await flushTelemetry();
    expect(mockedFetchJson).toHaveBeenCalledTimes(1);
  });
});

describe('telemetry — PII scrubbing', () => {
  beforeEach(() => {
    mockedFetchJson.mockClear();
    setTelemetryHandler(null);
    setAnalyticsOptOut(false);
  });

  it('strips email from payload', async () => {
    trackTelemetryEvent('user_action', { email: 'user@example.com', action: 'tap' });
    await flushTelemetry();

    const body = JSON.parse(mockedFetchJson.mock.calls[0][1]?.body as string);
    const event = body.events[0];
    expect(event.payload.email).toBeUndefined();
    expect(event.payload.action).toBe('tap');
  });

  it('strips name, phone, address, username from payload', async () => {
    trackTelemetryEvent('profile_view', {
      name: 'Jane',
      phone: '555-1234',
      address: '123 Main St',
      username: 'jane_doe',
      listingId: 'abc123',
    });
    await flushTelemetry();

    const body = JSON.parse(mockedFetchJson.mock.calls[0][1]?.body as string);
    const event = body.events[0];
    expect(event.payload.name).toBeUndefined();
    expect(event.payload.phone).toBeUndefined();
    expect(event.payload.address).toBeUndefined();
    expect(event.payload.username).toBeUndefined();
    // Non-PII fields are preserved
    expect(event.payload.listingId).toBe('abc123');
  });

  it('strips token and password keys', async () => {
    trackTelemetryEvent('auth_event', { token: 'secret', password: 'hunter2', success: true });
    await flushTelemetry();

    const body = JSON.parse(mockedFetchJson.mock.calls[0][1]?.body as string);
    const event = body.events[0];
    expect(event.payload.token).toBeUndefined();
    expect(event.payload.password).toBeUndefined();
    expect(event.payload.success).toBe(true);
  });

  it('strips device and location fragments case-insensitively', async () => {
    trackTelemetryEvent('session', {
      DeviceId: 'abc',
      latitude: 40.7,
      Longitude: -74.0,
      ip: '192.168.1.1',
      sessionId: 'sess_123',
    });
    await flushTelemetry();

    const body = JSON.parse(mockedFetchJson.mock.calls[0][1]?.body as string);
    const event = body.events[0];
    expect(event.payload.DeviceId).toBeUndefined();
    expect(event.payload.latitude).toBeUndefined();
    expect(event.payload.Longitude).toBeUndefined();
    expect(event.payload.ip).toBeUndefined();
    expect(event.payload.sessionId).toBe('sess_123');
  });
});

describe('telemetry — helper functions', () => {
  beforeEach(() => {
    mockedFetchJson.mockClear();
    setTelemetryHandler(null);
    setAnalyticsOptOut(false);
  });

  it('trackScreenView sends a screen_view event with screen name and params', async () => {
    trackScreenView('ItemDetail', { itemId: 'listing_42' });
    await flushTelemetry();

    const body = JSON.parse(mockedFetchJson.mock.calls[0][1]?.body as string);
    const event = body.events[0];
    expect(event.event).toBe('screen_view');
    expect(event.payload.screen).toBe('ItemDetail');
    expect(event.payload.itemId).toBe('listing_42');
  });

  it('trackScreenView works without params', async () => {
    trackScreenView('Home');
    await flushTelemetry();

    const body = JSON.parse(mockedFetchJson.mock.calls[0][1]?.body as string);
    const event = body.events[0];
    expect(event.event).toBe('screen_view');
    expect(event.payload.screen).toBe('Home');
  });

  it('trackScreenView scrubs PII from params', async () => {
    trackScreenView('Profile', { userId: 'u_123', email: 'a@b.com' });
    await flushTelemetry();

    const body = JSON.parse(mockedFetchJson.mock.calls[0][1]?.body as string);
    const event = body.events[0];
    expect(event.payload.email).toBeUndefined();
    expect(event.payload.userId).toBe('u_123');
  });

  it('trackFunnelStep sends a funnel_step event with funnel, step, step_number', async () => {
    trackFunnelStep('checkout', 'payment', 3);
    await flushTelemetry();

    const body = JSON.parse(mockedFetchJson.mock.calls[0][1]?.body as string);
    const event = body.events[0];
    expect(event.event).toBe('funnel_step');
    expect(event.payload.funnel).toBe('checkout');
    expect(event.payload.step).toBe('payment');
    expect(event.payload.step_number).toBe(3);
  });

  it('trackFeatureUsage sends a feature_usage event with feature and action', async () => {
    trackFeatureUsage('style_quiz', 'completed');
    await flushTelemetry();

    const body = JSON.parse(mockedFetchJson.mock.calls[0][1]?.body as string);
    const event = body.events[0];
    expect(event.event).toBe('feature_usage');
    expect(event.payload.feature).toBe('style_quiz');
    expect(event.payload.action).toBe('completed');
  });

  it('trackButtonTap sends a button_tap event with action and context', async () => {
    trackButtonTap('add_to_wishlist', { section: 'item_detail' });
    await flushTelemetry();

    const body = JSON.parse(mockedFetchJson.mock.calls[0][1]?.body as string);
    const event = body.events[0];
    expect(event.event).toBe('button_tap');
    expect(event.payload.action).toBe('add_to_wishlist');
    expect(event.payload.section).toBe('item_detail');
  });

  it('all helpers respect the opt-out preference', async () => {
    setAnalyticsOptOut(true);

    trackScreenView('Home');
    trackFunnelStep('onboarding', 'step_1', 1);
    trackFeatureUsage('feature', 'action');
    trackButtonTap('tap');
    await flushTelemetry();

    expect(mockedFetchJson).not.toHaveBeenCalled();
  });
});
