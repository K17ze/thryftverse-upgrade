import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { AppState } from 'react-native';
import type { CreatorDocument } from '../../core/projectStore/composition';
import { CreatorDraftService } from '../../core/projectStore/drafts';
import { CreatorAnalytics } from '../../shared/creatorAnalytics';
import { CrashJournal, ProjectStore, PROJECT_SCHEMA_VERSION } from '../../core/projectStore';
import type { ProjectPackage } from '../../core/projectStore';

const AUTOSAVE_INTERVAL_MS = 5000;

// Durable ProjectStore save (atomic write — survives gallery deletion)
// Per spec 08 §5: write temp, rename to project.json. This is the
// primary durable path; AsyncStorage is the fallback for platforms
// where expo-file-system is unavailable.
async function persistToProjectStore(
  store: ProjectStore,
  journal: CrashJournal | null,
  projectIdRef: MutableRefObject<string | null>,
  doc: CreatorDocument,
): Promise<void> {
  // Ensure a project ID exists for this document
  if (!projectIdRef.current) {
    const pkg = await store.createProject(doc.type);
    projectIdRef.current = pkg.projectId;
  }
  const projectPkg: ProjectPackage = {
    projectId: projectIdRef.current!,
    version: PROJECT_SCHEMA_VERSION,
    name: doc.metadata.title || 'Untitled',
    composition: doc,
    assets: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await store.saveProject(projectPkg);
  // Checkpoint the crash journal after a successful atomic save
  if (journal) {
    await journal.checkpoint();
  }
}

export interface UseAutosaveOptions {
  document: CreatorDocument;
  /** Live document mirror — no-history writes advance `document` without
      touching the history stack, so saves always persist the live doc. */
  documentRef: MutableRefObject<CreatorDocument>;
  isDirty: boolean;
  setIsDirty: Dispatch<SetStateAction<boolean>>;
  lastSavedDocRef: MutableRefObject<string>;
  projectStoreRef: MutableRefObject<ProjectStore | null>;
  crashJournalRef: MutableRefObject<CrashJournal | null>;
  projectIdRef: MutableRefObject<string | null>;
}

export interface UseAutosave {
  autosaveStatus: 'idle' | 'saving' | 'saved' | 'failed';
  saveDraft: () => Promise<void>;
  retryAutosave: () => Promise<void>;
}

/**
 * Autosave/persistence wiring: debounced AsyncStorage draft save, durable
 * ProjectStore package save, AppState background flush and unmount flush.
 */
export function useAutosave({
  document,
  documentRef,
  isDirty,
  setIsDirty,
  lastSavedDocRef,
  projectStoreRef,
  crashJournalRef,
  projectIdRef,
}: UseAutosaveOptions): UseAutosave {
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always-current reference to the flush-save handler so the AppState
  // listener and unmount cleanup can invoke the latest implementation
  // without re-subscribing on every render.
  const flushSaveRef = useRef<(() => Promise<void>) | null>(null);

  const saveDraft = useCallback(async () => {
    setAutosaveStatus('saving');
    try {
      // 1. Legacy AsyncStorage save (backward compatibility + web fallback)
      await CreatorDraftService.saveDraft(document);
      lastSavedDocRef.current = JSON.stringify(document);
      setIsDirty(false);
      setAutosaveStatus('saved');
      CreatorAnalytics.draftSave(document.type);

      // 2. Durable ProjectStore save (atomic write — survives gallery deletion)
      const store = projectStoreRef.current;
      const journal = crashJournalRef.current;
      if (store) {
        try {
          await persistToProjectStore(store, journal, projectIdRef, document);
        } catch {
          // ProjectStore save failed — the legacy AsyncStorage save above
          // already succeeded, so the draft is not lost. The crash journal
          // (if any) will still trigger recovery on next launch.
        }
      }
    } catch {
      setAutosaveStatus('failed');
    }
  }, [document, lastSavedDocRef, setIsDirty, projectStoreRef, crashJournalRef, projectIdRef]);

  const retryAutosave = useCallback(async () => {
    if (!isDirty) return;
    setAutosaveStatus('saving');
    try {
      const current = documentRef.current;
      await CreatorDraftService.saveDraft(current);
      lastSavedDocRef.current = JSON.stringify(current);
      setIsDirty(false);
      setAutosaveStatus('saved');

      // Durable ProjectStore save (atomic write)
      const store = projectStoreRef.current;
      const journal = crashJournalRef.current;
      if (store) {
        try {
          await persistToProjectStore(store, journal, projectIdRef, current);
        } catch {
          // ProjectStore failed — legacy save already succeeded
        }
      }
    } catch {
      setAutosaveStatus('failed');
    }
  }, [isDirty, documentRef, lastSavedDocRef, setIsDirty, projectStoreRef, crashJournalRef, projectIdRef]);

  // Autosave
  useEffect(() => {
    if (!isDirty) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    setAutosaveStatus('saving');
    autosaveTimerRef.current = setTimeout(async () => {
      const current = documentRef.current;
      const currentStr = JSON.stringify(current);
      if (currentStr !== lastSavedDocRef.current) {
        try {
          await CreatorDraftService.saveDraft(current);
          lastSavedDocRef.current = currentStr;
          setIsDirty(false);
          setAutosaveStatus('saved');

          // Durable ProjectStore save (atomic write)
          const store = projectStoreRef.current;
          const journal = crashJournalRef.current;
          if (store) {
            try {
              await persistToProjectStore(store, journal, projectIdRef, current);
            } catch {
              // ProjectStore failed — legacy save already succeeded
            }
          }
        } catch {
          setAutosaveStatus('failed');
        }
      } else {
        setAutosaveStatus('saved');
      }
    }, AUTOSAVE_INTERVAL_MS);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [document, isDirty, documentRef, lastSavedDocRef, setIsDirty, projectStoreRef, crashJournalRef, projectIdRef]);

  // Keep flushSaveRef pointed at the latest retryAutosave (which reads from
  // the history stack and guards on isDirty, mirroring the debounce path).
  useEffect(() => {
    flushSaveRef.current = retryAutosave;
  }, [retryAutosave]);

  // Flush pending edits when the app is backgrounded or becomes inactive.
  // The 5s debounce timer may fire after the OS suspends the app (where the
  // save may not complete) or be killed before it fires, losing edits. Clear
  // the pending timer and save immediately on these transitions.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        if (autosaveTimerRef.current) {
          clearTimeout(autosaveTimerRef.current);
          autosaveTimerRef.current = null;
        }
        flushSaveRef.current?.();
      }
    });
    return () => {
      subscription.remove();
    };
  }, []);

  // Flush any remaining dirty state on unmount so edits aren't lost when the
  // provider tears down before the debounce timer fires.
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      flushSaveRef.current?.();
    };
  }, []);

  return { autosaveStatus, saveDraft, retryAutosave };
}
