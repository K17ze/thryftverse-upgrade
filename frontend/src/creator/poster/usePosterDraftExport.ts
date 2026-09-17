/**
 * usePosterDraftExport — draft export for the Poster composer (Edits
 * parity: export without posting).
 *
 * Extracted from PosterComposerScreen (pure extraction — no behavioral
 * change). Renders the active page to an image via the export service
 * (native module or JS Skia fallback) and saves it to the camera roll.
 * Video compositions stay hidden until the native export module is linked —
 * the JS path cannot decode video sources, so the control is omitted
 * rather than shown as a fake affordance.
 */
import { useCallback, useMemo, useRef } from 'react';
import * as MediaLibrary from 'expo-media-library/legacy';

import {
  exportDocumentImage,
  isImageExportAvailable,
} from '../export/mediaExportService';
import type { CreatorDocument, CreatorPage } from '../core/projectStore/composition';
import type { ToastOptions, ToastType } from '../../context/ToastContext';
import type { useHaptic } from '../../hooks/useHaptic';

// ── Types ────────────────────────────────────────────────────────────

/**
 * The haptic engine returned by useHaptic.
 */
type Haptic = ReturnType<typeof useHaptic>;

/**
 * Toast presenter returned by useToast.
 */
type ShowToast = (message: string, type?: ToastType, options?: ToastOptions) => void;

export interface UsePosterDraftExportInput {
  /** The composition document being edited. */
  document: CreatorDocument;
  /** The active page (export target); may be undefined before load. */
  page: CreatorPage | undefined;
  /** Haptic engine for press/success feedback. */
  haptic: Haptic;
  /** Toast presenter for permission/success/error notices. */
  show: ShowToast;
}

export interface UsePosterDraftExportResult {
  /** Whether the export service can render the active page. */
  canExportDraft: boolean;
  /** Exports the active page to the camera roll. */
  handleExportDraftImage: () => Promise<void>;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function usePosterDraftExport({
  document,
  page,
  haptic,
  show,
}: UsePosterDraftExportInput): UsePosterDraftExportResult {
  // Renders the active page to an image via the export service (native
  // module or JS Skia fallback) and saves to the camera roll. Video
  // compositions stay hidden until the native export module is linked ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â
  // the JS path cannot decode video sources, so the control is omitted
  // rather than shown as a fake affordance.
  const canExportDraft = useMemo(
    () => isImageExportAvailable(document, page?.id),
    [document, page?.id],
  );
  const isExportingRef = useRef(false);

  const handleExportDraftImage = useCallback(async () => {
    if (!page || isExportingRef.current) return;
    isExportingRef.current = true;
    haptic.light();
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) {
        show('Allow photo access to save', 'info');
        return;
      }
      const exported = await exportDocumentImage(document, page.id);
      if (!exported) {
        show('Export is not available for this frame', 'info');
        return;
      }
      await MediaLibrary.saveToLibraryAsync(exported.uri);
      show('Saved to camera roll', 'success');
      haptic.medium();
    } catch (err) {
      console.warn('[PosterComposer] draft export failed', err);
      show('Could not export frame', 'error');
    } finally {
      isExportingRef.current = false;
    }
  }, [document, page, haptic, show]);
  return { canExportDraft, handleExportDraftImage };
}
