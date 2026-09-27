'use client';

/**
 * useShare — the one share grammar for profile/social surfaces: native
 * share sheet where the platform supports it, clipboard copy otherwise.
 * Callers get a stable `share({ url, title, copiedLabel })` that resolves
 * after the share completes and surfaces its own toast — no per-surface
 * divergence (research: share grammar was clipboard-only on half the
 * surfaces, navigator.share on the other half).
 */

import { useCallback } from 'react';
import { useToast } from '@/components/ui/Toast';

export interface ShareInput {
  /** Absolute or relative URL; defaults to the current location. */
  url?: string;
  /** Title for the native share sheet. */
  title?: string;
  /** Toast copy for the clipboard fallback — e.g. "Board link copied". */
  copiedLabel?: string;
}

export function useShare() {
  const { show } = useToast();

  return useCallback(
    async ({ url, title, copiedLabel = 'Link copied' }: ShareInput = {}) => {
      const href =
        url ?? (typeof window !== 'undefined' ? window.location.href : '');
      if (!href) return;
      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share(title ? { title, url: href } : { url: href });
          return;
        } catch {
          // Dismissed or unsupported — fall through to clipboard.
        }
      }
      try {
        await navigator.clipboard.writeText(href);
        show(copiedLabel, 'success');
      } catch {
        show('Could not copy link', 'error');
      }
    },
    [show],
  );
}
