import React from 'react';
import type { ViewToken } from 'react-native';
import type { ImpressionEntry, ImpressionStatus } from '../domain';

interface ViewableItemsChangedInfo {
  changed: ViewToken[];
  viewableItems: ViewToken[];
}

export interface UseRecommendationImpressionsResult {
  onViewableItemsChanged: (info: ViewableItemsChangedInfo) => void;
  reset: () => void;
}

const FLUSH_DELAY_MS = 500;

function viewTokenListingId(token: ViewToken): string | null {
  const item = token.item as unknown;
  if (item && typeof item === 'object') {
    const listing = (item as { listing?: { id?: unknown } }).listing;
    if (listing && typeof listing === 'object' && typeof listing.id === 'string') {
      return listing.id;
    }
    const id = (item as { id?: unknown }).id;
    if (typeof id === 'string') return id;
  }
  const key = token.key;
  if (typeof key === 'string' && key.length > 0) return key;
  return null;
}

export function useRecommendationImpressions(
  onFlush: (entries: ImpressionEntry[]) => void,
): UseRecommendationImpressionsResult {
  const pendingRef = React.useRef<Map<string, ImpressionStatus>>(new Map());
  const confirmedRenderedRef = React.useRef<Set<string>>(new Set());
  const confirmedViewableRef = React.useRef<Set<string>>(new Set());
  const flushTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFlushRef = React.useRef(onFlush);
  React.useEffect(() => {
    onFlushRef.current = onFlush;
  }, [onFlush]);

  const scheduleFlush = React.useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      const pending = pendingRef.current;
      if (pending.size === 0) return;
      const entries: ImpressionEntry[] = [];
      pending.forEach((status, listingId) => {
        entries.push({ listingId, status });
      });
      pending.clear();
      onFlushRef.current(entries);
    }, FLUSH_DELAY_MS);
  }, []);

  const markStatus = React.useCallback(
    (listingId: string, status: ImpressionStatus) => {
      if (status === 'rendered') {
        if (confirmedRenderedRef.current.has(listingId)) return;
        confirmedRenderedRef.current.add(listingId);
      } else {
        if (confirmedViewableRef.current.has(listingId)) return;
        confirmedViewableRef.current.add(listingId);
      }
      pendingRef.current.set(listingId, status);
      scheduleFlush();
    },
    [scheduleFlush]
  );

  const onViewableItemsChanged = React.useCallback(
    (info: ViewableItemsChangedInfo) => {
      for (const token of info.viewableItems) {
        if (!token.isViewable) continue;
        const listingId = viewTokenListingId(token);
        if (!listingId) continue;
        markStatus(listingId, 'rendered');
      }
      for (const token of info.changed) {
        if (!token.isViewable) continue;
        const listingId = viewTokenListingId(token);
        if (!listingId) continue;
        markStatus(listingId, 'viewable');
      }
    },
    [markStatus]
  );

  const reset = React.useCallback(() => {
    pendingRef.current.clear();
    confirmedRenderedRef.current.clear();
    confirmedViewableRef.current.clear();
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    return () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };
  }, []);

  return { onViewableItemsChanged, reset };
}
