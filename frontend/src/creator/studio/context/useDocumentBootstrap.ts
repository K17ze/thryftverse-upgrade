import { useCallback, useEffect, useState } from 'react';
import type { CreatorDocument } from '../../core/projectStore/composition';
import { CreatorDraftService } from '../../core/projectStore/drafts';
import { CreatorAnalytics } from '../../shared/creatorAnalytics';
import { createStableId } from '../../../utils/createStableId';
import { getTemplateById } from '../templates';

export interface UseDocumentBootstrapOptions {
  initialType: 'look' | 'poster';
  draftId?: string;
  templateId?: string;
  sourceDocumentId?: string;
  setDocument: (doc: CreatorDocument) => void;
}

export interface UseDocumentBootstrap {
  isLoadingDraft: boolean;
  /** Set when a draft load failed on mount (corrupt/missing). null otherwise. */
  draftError: string | null;
  /** Clear the draft error and retry loading the given draft id. */
  retryDraftLoad: (id: string) => void;
  loadDraft: (id: string) => Promise<boolean>;
}

/**
 * Mount-time document bootstrap: analytics session start plus the
 * draft / template / remix-source loading chain (priority:
 * draftId > templateId > sourceDocumentId).
 */
export function useDocumentBootstrap({
  initialType,
  draftId,
  templateId,
  sourceDocumentId,
  setDocument,
}: UseDocumentBootstrapOptions): UseDocumentBootstrap {
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  useEffect(() => {
    CreatorAnalytics.sessionStart(initialType);
  }, [initialType]);

  // Load draft on mount if draftId is provided
  useEffect(() => {
    if (!draftId) return;
    let cancelled = false;
    setIsLoadingDraft(true);
    setDraftError(null);
    CreatorDraftService.loadDraft(draftId).then((doc) => {
      if (cancelled || !doc) return;
      setDocument(doc);
      CreatorAnalytics.draftLoad(doc.type);
    }).catch(() => {
      // Corrupt or missing draft — stay with empty document
      if (!cancelled) setDraftError('Failed to load draft');
    }).finally(() => {
      if (!cancelled) setIsLoadingDraft(false);
    });
    return () => { cancelled = true; };
  }, [draftId, setDocument]);

  // Load template on mount if templateId is provided (and no draftId takes priority)
  useEffect(() => {
    if (!templateId || draftId) return;
    const template = getTemplateById(templateId);
    if (template) {
      const doc = template.build();
      setDocument(doc);
    }
  }, [templateId, draftId, setDocument]);

  // Load source document for remix if sourceDocumentId is provided
  useEffect(() => {
    if (!sourceDocumentId || draftId || templateId) return;
    let cancelled = false;
    setIsLoadingDraft(true);
    setDraftError(null);
    CreatorDraftService.loadDraft(sourceDocumentId).then((sourceDoc) => {
      if (cancelled || !sourceDoc) return;
      if (!sourceDoc.metadata.allowRemix) return;
      const remixedDoc: CreatorDocument = {
        ...sourceDoc,
        id: createStableId('doc'),
        metadata: {
          ...sourceDoc.metadata,
          sourceDocumentId: sourceDoc.id,
          sourceCreatorId: sourceDoc.metadata.sourceCreatorId,
          allowRemix: false,
          title: `Recreated from ${sourceDoc.metadata.title || 'Untitled'}`,
        },
        updatedAt: new Date().toISOString(),
      };
      setDocument(remixedDoc);
    }).catch(() => {
      // Source not found — stay with empty document
      if (!cancelled) setDraftError('Failed to load draft');
    }).finally(() => {
      if (!cancelled) setIsLoadingDraft(false);
    });
    return () => { cancelled = true; };
  }, [sourceDocumentId, draftId, templateId, setDocument]);

  // Retry a failed draft load: clears the error, sets loading, and re-attempts.
  const retryDraftLoad = useCallback((id: string) => {
    setDraftError(null);
    setIsLoadingDraft(true);
    CreatorDraftService.loadDraft(id).then((doc) => {
      if (doc) {
        setDocument(doc);
        CreatorAnalytics.draftLoad(doc.type);
      }
    }).catch(() => {
      setDraftError('Failed to load draft');
    }).finally(() => {
      setIsLoadingDraft(false);
    });
  }, [setDocument]);

  const loadDraft = useCallback(async (id: string): Promise<boolean> => {
    const doc = await CreatorDraftService.loadDraft(id);
    if (doc) {
      setDocument(doc);
      return true;
    }
    return false;
  }, [setDocument]);

  return {
    isLoadingDraft,
    draftError,
    retryDraftLoad,
    loadDraft,
  };
}
