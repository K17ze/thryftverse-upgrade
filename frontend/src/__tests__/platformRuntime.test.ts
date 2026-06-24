import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { queryClient } from '../platform/server/queryClient';
import { queryKeys } from '../platform/server/queryKeys';
import { clearUserScopedQueryCache } from '../platform/server/clearUserCache';
import { initSentry, isSentryInitialised, resetSentryForTesting, Sentry } from '../platform/monitoring/sentry';

describe('Platform: Sentry runtime behaviour', () => {
  beforeEach(() => {
    resetSentryForTesting();
  });

  afterEach(() => {
    resetSentryForTesting();
  });

  it('isSentryInitialised returns false before initSentry', () => {
    expect(isSentryInitialised()).toBe(false);
  });

  it('initSentry is a no-op without DSN', () => {
    initSentry();
    expect(isSentryInitialised()).toBe(false);
  });

  it('initSentry with DSN sets initialised flag', () => {
    initSentry({ dsn: 'https://test@sentry.example/1' });
    expect(isSentryInitialised()).toBe(true);
  });

  it('initSentry is idempotent — second call does not reset', () => {
    initSentry({ dsn: 'https://test@sentry.example/1' });
    const stateAfterFirst = isSentryInitialised();
    initSentry({ dsn: 'https://different@sentry.example/2' });
    expect(isSentryInitialised()).toBe(stateAfterFirst);
  });

  it('Sentry proxy is a no-op when not initialised', () => {
    expect(() => Sentry.captureException!(new Error('test'))).not.toThrow();
    expect(() => Sentry.captureMessage!('test')).not.toThrow();
    expect(() => Sentry.setTag!('key', 'value')).not.toThrow();
  });

  it('Sentry proxy does not throw after initialisation', () => {
    initSentry({ dsn: 'https://test@sentry.example/1' });
    expect(() => Sentry.captureException!(new Error('test'))).not.toThrow();
    expect(() => Sentry.captureMessage!('test')).not.toThrow();
  });

  it('resetSentryForTesting resets to uninitialised state', () => {
    initSentry({ dsn: 'https://test@sentry.example/1' });
    expect(isSentryInitialised()).toBe(true);
    resetSentryForTesting();
    expect(isSentryInitialised()).toBe(false);
  });
});

describe('Platform: QueryClient behaviour', () => {
  it('does not retry on 401 status', () => {
    const defaultOptions = queryClient.getDefaultOptions();
    const retryFn = defaultOptions.queries?.retry as (count: number, error: unknown) => boolean;

    expect(retryFn(0, { status: 401 })).toBe(false);
    expect(retryFn(0, { status: 403 })).toBe(false);
    expect(retryFn(0, { status: 404 })).toBe(false);
  });

  it('retries on 500 status', () => {
    const defaultOptions = queryClient.getDefaultOptions();
    const retryFn = defaultOptions.queries?.retry as (count: number, error: unknown) => boolean;

    expect(retryFn(0, { status: 500 })).toBe(true);
  });

  it('retries on network error without status', () => {
    const defaultOptions = queryClient.getDefaultOptions();
    const retryFn = defaultOptions.queries?.retry as (count: number, error: unknown) => boolean;

    expect(retryFn(0, new Error('Network request failed'))).toBe(true);
  });

  it('stops retrying after 2 failures', () => {
    const defaultOptions = queryClient.getDefaultOptions();
    const retryFn = defaultOptions.queries?.retry as (count: number, error: unknown) => boolean;

    expect(retryFn(2, { status: 500 })).toBe(false);
  });

  it('mutations do not retry', () => {
    const defaultOptions = queryClient.getDefaultOptions();
    expect(defaultOptions.mutations?.retry).toBe(0);
  });

  it('staleTime is 5 minutes', () => {
    const defaultOptions = queryClient.getDefaultOptions();
    expect(defaultOptions.queries?.staleTime).toBe(1000 * 60 * 5);
  });
});

describe('Platform: queryKeys behaviour', () => {
  it('user.profile returns stable key array', () => {
    const key1 = queryKeys.user.profile('user-123');
    const key2 = queryKeys.user.profile('user-123');
    expect(key1).toEqual(key2);
    expect(key1).toEqual(['user', 'profile', 'user-123']);
  });

  it('user.profile with undefined returns undefined in key', () => {
    const key = queryKeys.user.profile(undefined);
    expect(key).toEqual(['user', 'profile', undefined]);
  });

  it('chat.messages returns conversation-scoped key', () => {
    const key = queryKeys.chat.messages('conv-456');
    expect(key).toEqual(['chat', 'messages', 'conv-456']);
  });

  it('notifications.unreadCount returns stable key', () => {
    const key = queryKeys.notifications.unreadCount;
    expect(key).toEqual(['notifications', 'unread-count']);
  });
});

describe('Platform: clearUserScopedQueryCache behaviour', () => {
  it('removes user-scoped queries from cache', async () => {
    queryClient.setQueryData(queryKeys.user.profile('u1'), { id: 'u1' });
    queryClient.setQueryData(queryKeys.chat.conversations, []);
    queryClient.setQueryData(['listing', 'detail', 'l1'], { id: 'l1' });

    clearUserScopedQueryCache();

    expect(queryClient.getQueryData(queryKeys.user.profile('u1'))).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.chat.conversations)).toBeUndefined();
    expect(queryClient.getQueryData(['listing', 'detail', 'l1'])).toEqual({ id: 'l1' });
  });

  it('resets unread notification count to 0', () => {
    queryClient.setQueryData(queryKeys.notifications.unreadCount, 5);
    clearUserScopedQueryCache();
    expect(queryClient.getQueryData(queryKeys.notifications.unreadCount)).toBe(0);
  });
});
