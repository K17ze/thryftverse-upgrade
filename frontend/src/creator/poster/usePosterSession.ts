import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ───────────────────────────────────────────────────────────────────────────
// usePosterSession — persists and restores the poster composer's transient
// session state (active page, selected layer, timeline zoom) to AsyncStorage.
//
// On re-entry after backgrounding or crash recovery, these values were lost —
// the user returned to page 0 with no selection. This hook persists them
// (debounced 500ms) and restores them on mount or when a different document
// is loaded.
//
// AsyncStorage failures are non-fatal: every read/write is wrapped so a
// corrupt or unavailable store never crashes the composer.
//
// Extracted from PosterComposerScreen.tsx (lines 882-978) as the first safe
// decomposition step per the Wave 2 research report.
// ───────────────────────────────────────────────────────────────────────────

const SESSION_KEY_PREFIX = '@poster_session_';

export interface PosterSessionState {
  activePageIndex: number;
  selectedLayerId: string | null;
  timelineZoomScale: number;
}

export interface PosterSessionRestore {
  activePageIndex: number;
  selectedLayerId: string | null;
  timelineZoomScale: number;
}

export interface UsePosterSessionInput {
  documentId: string | undefined;
  pageCount: number;
  activePageIndex: number;
  selectedLayerId: string | null;
  timelineZoomScale: number;
  setActivePageIndex: (index: number) => void;
  selectLayer: (id: string | null) => void;
  setTimelineZoomScale: (scale: number) => void;
}

export function usePosterSession({
  documentId,
  pageCount,
  activePageIndex,
  selectedLayerId,
  timelineZoomScale,
  setActivePageIndex,
  selectLayer,
  setTimelineZoomScale,
}: UsePosterSessionInput) {
  const sessionKey = documentId ? `${SESSION_KEY_PREFIX}${documentId}` : null;
  const prevDocIdRef = useRef<string | null>(null);
  const hasAttemptedRestoreRef = useRef(false);

  // Debounced persistence — writes whenever any tracked value changes.
  // Skipped until the first restoration attempt completes so default
  // values (page 0 / no selection / 1x zoom) never clobber a saved
  // session before it has been read back.
  useEffect(() => {
    if (!sessionKey || !hasAttemptedRestoreRef.current) return;
    const timer = setTimeout(() => {
      AsyncStorage.setItem(
        sessionKey,
        JSON.stringify({
          activePageIndex,
          selectedLayerId,
          timelineZoomScale,
        }),
      ).catch(() => {
        // AsyncStorage write failure — silently continue.
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [sessionKey, activePageIndex, selectedLayerId, timelineZoomScale]);

  // Restoration on mount + when a different document is loaded. Runs
  // only when the document identity changes, not on every page/layer/
  // zoom change (those are handled by the persistence effect above).
  useEffect(() => {
    if (!sessionKey) return;
    const currentDocId = documentId;
    const prevDocId = prevDocIdRef.current;
    // On a genuine document change (not the initial mount), clear the
    // previous document's session so stale state never leaks across
    // projects.
    if (prevDocId != null && prevDocId !== currentDocId) {
      AsyncStorage.removeItem(`${SESSION_KEY_PREFIX}${prevDocId}`).catch(() => {
        // Clear failure — silently continue.
      });
      // A different document means a fresh session: reset the guard so
      // persistence waits for the new document's restoration.
      hasAttemptedRestoreRef.current = false;
    }
    prevDocIdRef.current = currentDocId ?? null;
    let cancelled = false;
    (async () => {
      hasAttemptedRestoreRef.current = true;
      try {
        const raw = await AsyncStorage.getItem(sessionKey);
        if (cancelled || !raw) return;
        const saved = JSON.parse(raw) as {
          activePageIndex?: number;
          selectedLayerId?: string | null;
          timelineZoomScale?: number;
        };
        // Validate page index is within current document bounds.
        if (
          typeof saved.activePageIndex === 'number' &&
          Number.isFinite(saved.activePageIndex) &&
          saved.activePageIndex >= 0 &&
          saved.activePageIndex < pageCount
        ) {
          setActivePageIndex(saved.activePageIndex);
        }
        // Validate the layer still exists somewhere in the document.
        // (The caller's selectLayer is responsible for checking existence.)
        if (saved.selectedLayerId) {
          selectLayer(saved.selectedLayerId);
        }
        // Restore zoom (defensive: must be a finite number).
        if (
          typeof saved.timelineZoomScale === 'number' &&
          Number.isFinite(saved.timelineZoomScale)
        ) {
          setTimelineZoomScale(saved.timelineZoomScale);
        }
      } catch {
        // Corrupt or unreadable session — silently continue.
      }
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally only re-run when the document identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);
}
