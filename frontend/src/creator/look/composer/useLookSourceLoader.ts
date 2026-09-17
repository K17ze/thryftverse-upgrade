/**
 * useLookSourceLoader — published-look loading for the Look composer.
 *
 * Extracted from LookComposerScreen — pure relocation, no changes.
 * When sourceDocumentId refers to a published look (not a local draft),
 * fetches it from the API and loads it into the canvas as the working
 * document. The remix path in CreatorContext handles local-draft
 * sourceDocumentIds via CreatorDraftService.
 */

import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';
import { makeStableId } from '../../../utils/createStableId';
import { fetchLookByIdFromApi } from '../../../services/looksApi';
import { lookToDocument } from '../../export/viewerAdapters';
import { safeValidateDocument } from '../../core/projectStore/composition';
import type { CreatorContextValue } from '../../studio/CreatorContext';

export function useLookSourceLoader({
  sourceDocumentId,
  sourceMode,
  draftId,
  templateId,
  setDocument,
  setEditingLookId,
  setIsLoadingSourceLook,
  setSourceLookError,
  setSourceLookRetryNonce,
  sourceLookRetryNonce,
}: {
  sourceDocumentId: string | undefined;
  sourceMode: 'edit' | 'remix';
  draftId: string | undefined;
  templateId: string | undefined;
  setDocument: CreatorContextValue['setDocument'];
  setEditingLookId: (id: string | null) => void;
  setIsLoadingSourceLook: (loading: boolean) => void;
  setSourceLookError: (error: boolean) => void;
  setSourceLookRetryNonce: Dispatch<SetStateAction<number>>;
  sourceLookRetryNonce: number;
}) {
  // ── Edit mode: load an existing published look for editing ───────────
  // When sourceDocumentId refers to a published look (not a local draft),
  // fetch it from the API and load it into the canvas as the working
  // document. The remix path in CreatorContext handles local-draft
  // sourceDocumentIds via CreatorDraftService.
  useEffect(() => {
    if (!sourceDocumentId || draftId || templateId) return;
    let cancelled = false;
    setIsLoadingSourceLook(true);
    setSourceLookError(false);
    fetchLookByIdFromApi(sourceDocumentId)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok || !res.look) {
          setSourceLookError(true);
          return;
        }
        const persisted = safeValidateDocument(res.look.compositionDocument);
        const baseDoc = persisted.success && persisted.data
          ? persisted.data
          : lookToDocument({
              id: res.look.id,
              title: res.look.title,
              caption: res.look.caption,
              mediaUrl: res.look.mediaUrl,
              mediaType: res.look.mediaType,
              visibility: res.look.visibility,
              tags: res.look.tags.map((t) => ({
                id: t.id,
                label: t.label,
                listingId: t.listingId,
                x: t.x,
                y: t.y })) });
        if (sourceMode === 'remix') {
          setDocument({
            ...baseDoc,
            id: makeStableId('look'),
            metadata: {
              ...baseDoc.metadata,
              sourceDocumentId: res.look.id,
              sourceCreatorId: res.look.creatorId },
            updatedAt: new Date().toISOString() });
          setEditingLookId(null);
        } else {
          setDocument(baseDoc);
          setEditingLookId(sourceDocumentId);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setSourceLookError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSourceLook(false);
      });
    return () => { cancelled = true; };
  }, [sourceDocumentId, sourceMode, draftId, templateId, setDocument, setEditingLookId, setIsLoadingSourceLook, setSourceLookError, sourceLookRetryNonce]);

  const handleRetrySourceLook = useCallback(() => {
    setSourceLookRetryNonce((n) => n + 1);
  }, [setSourceLookRetryNonce]);

  return { handleRetrySourceLook };
}
