import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchLookByIdFromApi, type LookApiItem } from '../../services/looksApi';
import { ApiRequestError } from '../../lib/apiClient';
import { useConnectivity } from '../useConnectivity';
import { useAnalyticsEvent } from '../useAnalyticsEvent';
import { useVisuallyComplete } from '../../performance/visuallyComplete';
import { track } from '../../analytics';

export type LookLoadError = {
  kind: 'not-found' | 'connection' | 'offline' | 'missing';
  message: string;
};

export interface UseLookDetailDataResult {
  look: LookApiItem | null;
  isLoading: boolean;
  loadError: LookLoadError | null;
  commentCount: number;
  setCommentCount: (count: number) => void;
  loadLook: () => Promise<void>;
  /** Report the hero carousel's first image/video decode to the readiness
   *  tracker — wired to LookMediaCarousel's onFirstMediaLoad. */
  reportFirstMedia: () => void;
}

/**
 * Owns the look-fetch domain for the look detail screen: the look entity,
 * its load/error state machine, the comment count mirror, the readiness
 * milestones ('data-ready' / 'interaction-ready' / 'first-media'), and the
 * view telemetry effects so the screen does not wire them inline.
 */
export function useLookDetailData(lookId: string): UseLookDetailDataResult {
  const { isOffline } = useConnectivity();
  const analyticsEvent = useAnalyticsEvent();
  const reportReady = useVisuallyComplete('LookDetail');
  const reportFirstMedia = useCallback(() => reportReady('first-media'), [reportReady]);

  const [look, setLook] = useState<LookApiItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<LookLoadError | null>(null);
  const [commentCount, setCommentCount] = useState(0);

  // loadLook intentionally re-fetches only when lookId changes — read live
  // connectivity through a ref so error classification stays accurate
  // without turning a connectivity flip into an implicit refetch.
  const isOfflineRef = useRef(isOffline);
  isOfflineRef.current = isOffline;
  const analyticsEventRef = useRef(analyticsEvent);
  analyticsEventRef.current = analyticsEvent;

  const loadLook = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetchLookByIdFromApi(lookId);
      if (res.ok && res.look) {
        setLook(res.look);
        setCommentCount(res.look.commentCount);
        // ── Fire analytics view event to the backend pipeline ──
        // This feeds the creator analytics v2 event table, which drives
        // the summary/timeline/content-ranking dashboards. Self-views are
        // filtered in the hook.
        analyticsEventRef.current.view('look', lookId, { surface: 'look_detail', ownerId: res.look.creatorId });
      } else {
        setLoadError({
          kind: 'not-found',
          message: res.error ?? 'This look may have been removed or is unavailable.' });
      }
    } catch (error) {
      if (error instanceof ApiRequestError && (error.status === 404 || error.status === 410)) {
        setLoadError({
          kind: 'missing',
          message: 'This content is no longer available.' });
      } else if (isOfflineRef.current) {
        setLoadError({
          kind: 'offline',
          message: "You're offline. Check your connection and try again." });
      } else {
        setLoadError({
          kind: 'connection',
          message: 'Check your connection and try again.' });
      }
    } finally {
      setIsLoading(false);
    }
  }, [lookId]);

  useEffect(() => {
    loadLook();
  }, [loadLook]);

  // Readiness milestones: 'data-ready' when the look fetch settles
  // (success or terminal error — isLoading flips in loadLook's finally);
  // 'interaction-ready' once a look is on screen with its controls.
  // 'first-media' is reported separately by the hero carousel's first
  // image/video decode. Mount alone never completes the visit.
  useEffect(() => {
    if (!isLoading) {
      reportReady('data-ready');
      if (look) reportReady('interaction-ready');
    }
  }, [isLoading, look, reportReady]);

  useEffect(() => {
    track('look_viewed', { look_id: lookId });
  }, [lookId]);

  return {
    look,
    isLoading,
    loadError,
    commentCount,
    setCommentCount,
    loadLook,
    reportFirstMedia,
  };
}
