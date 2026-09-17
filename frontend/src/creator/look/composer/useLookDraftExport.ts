/**
 * useLookDraftExport — draft image export for the Look composer
 * (Edits parity: export without posting).
 *
 * Extracted from LookComposerScreen — pure relocation, no changes.
 * Renders the look to an image via the export service (native module
 * or JS Skia fallback) and saves to the camera roll. The control is
 * omitted when the service can't render the content (e.g. a video
 * media layer without the native module — JS Skia decodes stills
 * only), never shown as a fake affordance.
 */

import { useCallback, useRef } from 'react';
import * as MediaLibrary from 'expo-media-library/legacy';
import {
  exportDocumentImage,
  isImageExportAvailable,
} from '../../export/mediaExportService';
import type { CreatorDocument, CreatorPage } from '../../core/projectStore/composition';
import { useToast } from '../../../context/ToastContext';
import type { HapticApi } from './useLookMultiSelectActions';

export function useLookDraftExport({
  document,
  page,
  haptic,
  show,
}: {
  document: CreatorDocument;
  page: CreatorPage | undefined;
  haptic: HapticApi;
  show: ReturnType<typeof useToast>['show'];
}) {
  // ── Draft export (Edits parity: export without posting) ──────────────
  const canExportDraft = isImageExportAvailable(document, page?.id);
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
        show('Export is not available for this look', 'info');
        return;
      }
      await MediaLibrary.saveToLibraryAsync(exported.uri);
      show('Saved to camera roll', 'success');
      haptic.medium();
    } catch (err) {
      console.warn('[LookComposer] draft export failed', err);
      show('Could not export look', 'error');
    } finally {
      isExportingRef.current = false;
    }
  }, [document, page, haptic, show]);

  return { canExportDraft, handleExportDraftImage };
}
