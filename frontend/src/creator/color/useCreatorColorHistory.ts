/**
 * useCreatorColorHistory — persistence hook for recently committed colors.
 *
 * Per spec 04_COLOR_SYSTEM_ZERO_GAP §4:
 * - Persist only committed colors, not every slider frame.
 * - Last 12 colors.
 * - Deduplicate by normalized RGBA.
 *
 * Uses AsyncStorage for cross-session persistence. The hook is designed
 * to be used by CreatorColorPicker and any tool that commits a color.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CreatorColor, RecentColor } from './ColorTypes';
import { normalize, colorsEqual } from './ColorMath';

const STORAGE_KEY = '@thryftverse/creator_recent_colors';
const MAX_RECENT = 12;

/**
 * Hook for managing the recent color history.
 *
 * Returns:
 * - recents: array of RecentColor (most recent first)
 * - commitColor: add a color to history (deduplicates, trims to 12)
 * - clearRecents: remove all recent colors
 * - loading: true while loading from AsyncStorage on mount
 */
export function useCreatorColorHistory() {
  const [recents, setRecents] = useState<RecentColor[]>([]);
  const [loading, setLoading] = useState(true);
  const loadedRef = useRef(false);

  // Load persisted recents on mount
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((json) => {
        if (cancelled) return;
        if (json) {
          try {
            const parsed = JSON.parse(json) as RecentColor[];
            if (Array.isArray(parsed)) {
              setRecents(parsed.slice(0, MAX_RECENT));
            }
          } catch {
            // Corrupted storage — start fresh
          }
        }
        loadedRef.current = true;
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        loadedRef.current = true;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist whenever recents change (after initial load)
  useEffect(() => {
    if (!loadedRef.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(recents)).catch(() => {
      // Storage write failure is non-fatal — recents still work in-memory
    });
  }, [recents]);

  /**
   * Commit a color to the recent history.
   * Deduplicates by normalized RGBA. Moves existing to front.
   * Trims to MAX_RECENT entries.
   */
  const commitColor = useCallback((color: CreatorColor) => {
    const normalized = normalize(color);
    setRecents((prev) => {
      // Remove any existing entry that matches this color
      const filtered = prev.filter(
        (entry) => !colorsEqual(entry.color, normalized),
      );
      // Prepend the new entry
      const entry: RecentColor = {
        color: normalized,
        committedAt: Date.now(),
      };
      return [entry, ...filtered].slice(0, MAX_RECENT);
    });
  }, []);

  /**
   * Clear all recent colors.
   */
  const clearRecents = useCallback(() => {
    setRecents([]);
  }, []);

  return {
    recents,
    commitColor,
    clearRecents,
    loading,
  };
}
