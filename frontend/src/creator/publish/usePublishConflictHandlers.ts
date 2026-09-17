// ── Conflict resolution handlers ───────────────────────────────────
// "Reload" fetches the latest server version and replaces the working
// document (the local edits are superseded — that is what reload
// promises). "Duplicate" forks the local document under a new id so the
// user's edits are preserved as a new draft with no server identity.
// Previously both buttons just reset to review — the next publish hit
// the same 409 forever.
// Extracted verbatim from useCreatorPublishWorkflow.ts.
import { useCallback, type MutableRefObject } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { fetchCreatorDocument } from '../../services/creatorDocumentsApi';
import type { CreatorDocumentSaveResult } from '../../services/creatorDocumentsApi';
import { ApiRequestError } from '../../lib/apiClient';
import { safeValidateDocument } from '../core/projectStore/composition';
import type { CreatorDocument } from '../core/projectStore/composition';
import { createStableId } from '../../utils/createStableId';
import type { PublishGuard } from '../core/projectStore/compositionContract';
import type { useToast } from '../../context/ToastContext';
import { REVIEW_STATE, type PublishState } from './publishWorkflowShared';

export interface PublishConflictHandlersParams {
  document: CreatorDocument;
  setDocument: (doc: CreatorDocument) => void;
  serverDocMetaRef: MutableRefObject<CreatorDocumentSaveResult | null>;
  publishGuardRef: MutableRefObject<PublishGuard>;
  progressWidth: SharedValue<number>;
  setPublishState: (state: PublishState) => void;
  showToast: ReturnType<typeof useToast>['show'];
}

export function usePublishConflictHandlers({
  document,
  setDocument,
  serverDocMetaRef,
  publishGuardRef,
  progressWidth,
  setPublishState,
  showToast }: PublishConflictHandlersParams) {
  const handleReloadFromServer = useCallback(async () => {
    try {
      const fresh = await fetchCreatorDocument(document.id);
      const freshDoc = safeValidateDocument(fresh.documentJson);
      if (!freshDoc.success || !freshDoc.data) {
        setPublishState({ tag: 'error', message: 'The server version could not be read. Try duplicating instead.', canRetry: true, canSaveDraft: true });
        return;
      }
      setDocument(freshDoc.data);
      serverDocMetaRef.current = {
        documentId: fresh.documentId,
        lockVersion: fresh.lockVersion,
        documentHash: fresh.documentHash,
        headRevision: fresh.headRevision,
        updatedAt: fresh.updatedAt,
      };
      setPublishState(REVIEW_STATE);
      progressWidth.value = 0;
      publishGuardRef.current.reset();
      showToast('Loaded the latest version');
    } catch (err) {
      // 404 = deleted server-side — the draft only exists locally now.
      const gone = err instanceof ApiRequestError && err.status === 404;
      serverDocMetaRef.current = null;
      setPublishState(gone
        ? { tag: 'error', message: 'This document no longer exists on the server. Save as draft to keep a local copy.', canRetry: false, canSaveDraft: true }
        : { tag: 'error', message: 'Could not load the latest version. Try again.', canRetry: true, canSaveDraft: true });
    }
  }, [document.id, setDocument, showToast, progressWidth, serverDocMetaRef, publishGuardRef, setPublishState]);

  const handleDuplicateAsNewDraft = useCallback(() => {
    setDocument({
      ...document,
      id: createStableId('doc'),
      metadata: {
        ...document.metadata,
        sourceDocumentId: document.id,
        // The duplicate is a new draft — it carries no schedule intent
        // from the conflicting document.
        scheduledFor: undefined,
      },
      updatedAt: new Date().toISOString(),
    });
    // The duplicate has no server identity — clear the meta so the next
    // publish takes the create path, not a stale If-Match update.
    serverDocMetaRef.current = null;
    setPublishState(REVIEW_STATE);
    progressWidth.value = 0;
    publishGuardRef.current.reset();
    showToast('Saved as a new draft');
  }, [document, setDocument, showToast, progressWidth, serverDocMetaRef, publishGuardRef, setPublishState]);

  return { handleReloadFromServer, handleDuplicateAsNewDraft };
}
