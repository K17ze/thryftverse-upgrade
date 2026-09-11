/**
 * useDraftAutosave — idle-debounce draft autosave for the Poster composer.
 *
 * Flagship editors (VN, CapCut, iMovie) all autosave drafts so a crash or
 * force-quit never loses work. This hook debounces a save until the user is
 * idle for `debounceMs` (default 4s): a rapid edit storm resets the pending
 * timer so we never fire a save per keystroke. Autosave is silent — failures
 * are caught and logged via `console.warn` so a storage error can never crash
 * the editor. The manual quick-save button remains the explicit path.
 */
import { useEffect, useRef, useState } from 'react';

import type { CreatorDocument } from '../composition';

export interface UseDraftAutosaveInput {
  /** Whether the document has unsaved changes. */
  isDirty: boolean;
  /** The current working document (drives the debounce reset on edit). */
  document: CreatorDocument;
  /** Persists the draft (from CreatorContext). */
  saveDraft: () => Promise<void>;
  /** Idle debounce window in milliseconds. Defaults to 4000 (4s). */
  debounceMs?: number;
}

export interface UseDraftAutosaveResult {
  /** True while an autosave is in flight. */
  isAutosaving: boolean;
  /** Epoch ms of the last successful autosave, or null if never saved. */
  lastAutosaveAt: number | null;
}

const DEFAULT_DEBOUNCE_MS = 4000;

export function useDraftAutosave({
  isDirty,
  document,
  saveDraft,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: UseDraftAutosaveInput): UseDraftAutosaveResult {
  const [isAutosaving, setIsAutosaving] = useState(false);
  const [lastAutosaveAt, setLastAutosaveAt] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep the latest saveDraft in a ref so the timer callback always calls
  // the current closure without re-arming on every render.
  const saveDraftRef = useRef(saveDraft);
  saveDraftRef.current = saveDraft;

  useEffect(() => {
    // Cancel any pending timer when inputs change (new edit resets debounce).
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!isDirty) return;

    timerRef.current = setTimeout(async () => {
      setIsAutosaving(true);
      try {
        await saveDraftRef.current();
        setLastAutosaveAt(Date.now());
      } catch (error) {
        // Autosave failure must never crash the editor.
        console.warn('Draft autosave failed:', error);
      } finally {
        setIsAutosaving(false);
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isDirty, document, debounceMs]);

  return { isAutosaving, lastAutosaveAt };
}
