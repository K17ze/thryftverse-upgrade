/**
 * useAnalyticsEvent — dual-write bridge for creator analytics event ingestion.
 *
 * The backend creator analytics v2 pipeline (events → daily aggregate →
 * summary/timeline/content-ranking) is architecturally complete but was
 * never fed because `logAnalyticsEvent` had zero call sites. This hook
 * provides a fire-and-forget bridge that sends view/like/save/share events
 * to the backend event table alongside the existing PostHog `track()` call.
 *
 * Usage:
 *   const logEvent = useAnalyticsEvent();
 *   logEvent.view('look', lookId, { surface: 'look_detail' });
 *   logEvent.like('look', lookId);
 *
 * The hook is resilient — failures are swallowed (analytics events must
 * never break the user's flow). Deduplication is handled server-side via
 * the event_id.
 */
import { useCallback, useRef } from 'react';
import { logAnalyticsEvent, type AnalyticsContentType, type AnalyticsEventType } from '../services/creatorAnalyticsApi';
import { useStore } from '../store/useStore';

interface LogOptions {
  surface?: string;
  position?: number;
  impressionId?: string;
  sessionId?: string;
  /** The content owner's user ID. When provided, events are skipped if the
   *  current user is the owner — a creator viewing their own content is not
   *  a meaningful engagement signal for their analytics dashboard. */
  ownerId?: string;
}

export interface AnalyticsEventLogger {
  view: (contentType: AnalyticsContentType, contentId: string, options?: LogOptions) => void;
  like: (contentType: AnalyticsContentType, contentId: string, options?: LogOptions) => void;
  save: (contentType: AnalyticsContentType, contentId: string, options?: LogOptions) => void;
  share: (contentType: AnalyticsContentType, contentId: string, options?: LogOptions) => void;
  comment: (contentType: AnalyticsContentType, contentId: string, options?: LogOptions) => void;
  productClick: (contentType: AnalyticsContentType, contentId: string, options?: LogOptions) => void;
  profileVisit: (contentType: AnalyticsContentType, contentId: string, options?: LogOptions) => void;
}

export function useAnalyticsEvent(): AnalyticsEventLogger {
  const currentUser = useStore((s) => s.currentUser);
  const sessionIdRef = useRef<string>(`sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);

  const send = useCallback(
    (
      eventType: AnalyticsEventType,
      contentType: AnalyticsContentType,
      contentId: string,
      options?: LogOptions,
    ) => {
      // Don't log self-views — a creator viewing their own content is not
      // a meaningful engagement signal for their analytics dashboard.
      if (!currentUser?.id) return;
      if (options?.ownerId && options.ownerId === currentUser.id) return;

      const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;

      // Fire-and-forget — analytics must never block the UI or break flows.
      logAnalyticsEvent({
        event_id: eventId,
        content_type: contentType,
        content_id: contentId,
        event_type: eventType,
        session_id: options?.sessionId ?? sessionIdRef.current,
        impression_id: options?.impressionId,
        surface: options?.surface,
        position: options?.position,
      }).catch(() => {
        // Swallow — analytics events are best-effort. The server has
        // idempotent deduplication via event_id, so retries are safe.
      });
    },
    [currentUser?.id],
  );

  return {
    view: (ct, id, opts) => send('view', ct, id, opts),
    like: (ct, id, opts) => send('like', ct, id, opts),
    save: (ct, id, opts) => send('save', ct, id, opts),
    share: (ct, id, opts) => send('share', ct, id, opts),
    comment: (ct, id, opts) => send('comment', ct, id, opts),
    productClick: (ct, id, opts) => send('product_click', ct, id, opts),
    profileVisit: (ct, id, opts) => send('profile_visit', ct, id, opts),
  };
}
