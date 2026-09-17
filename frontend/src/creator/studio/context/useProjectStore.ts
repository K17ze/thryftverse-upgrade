import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { CreatorDocument } from '../../core/projectStore/composition';
import { ProjectStore, AssetRegistry, CrashJournal } from '../../core/projectStore';

export interface UseProjectStoreOptions {
  initialType: 'look' | 'poster';
  setDocument: (doc: CreatorDocument) => void;
  setIsDirty: Dispatch<SetStateAction<boolean>>;
}

export interface UseProjectStore {
  projectStoreRef: MutableRefObject<ProjectStore | null>;
  assetRegistryRef: MutableRefObject<AssetRegistry | null>;
  crashJournalRef: MutableRefObject<CrashJournal | null>;
  projectIdRef: MutableRefObject<string | null>;
  hasPendingRecovery: boolean;
  /** Recover the crashed project by loading the last journal checkpoint. */
  recoverCrashedProject: () => Promise<void>;
  /** Dismiss the recovery prompt without recovering. */
  dismissRecovery: () => void;
  importAsset: (sourceUri: string, mediaType: 'image' | 'video') => Promise<string | null>;
}

// ── Durable project store wiring ─────────────────────────────────────
// Lazy-initialized singletons. The ProjectStore persists project packages
// (document + copied media) to the file system so drafts survive gallery
// media deletion. Additive to the existing AsyncStorage draft system.
export function useProjectStore({
  initialType,
  setDocument,
  setIsDirty,
}: UseProjectStoreOptions): UseProjectStore {
  const projectStoreRef = useRef<ProjectStore | null>(null);
  const assetRegistryRef = useRef<AssetRegistry | null>(null);
  const crashJournalRef = useRef<CrashJournal | null>(null);
  const projectIdRef = useRef<string | null>(null);
  const [hasPendingRecovery, setHasPendingRecovery] = useState(false);

  // Initialize project store on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const baseDir = 'creator_projects';
        const store = new ProjectStore(baseDir);
        await store.init();
        const registry = new AssetRegistry(store);
        const journal = new CrashJournal(baseDir);
        if (!mounted) return;
        projectStoreRef.current = store;
        assetRegistryRef.current = registry;
        crashJournalRef.current = journal;
        const pending = await journal.hasPending();
        if (pending) {
          setHasPendingRecovery(true);
        }
      } catch {
        // Project store is optional — AsyncStorage drafts remain the fallback.
      }
    })();
    return () => { mounted = false; };
  }, []);

  // ── Crash recovery ─────────────────────────────────────────────────
  // When a pending crash journal entry is detected, the composer shows
  // a recovery prompt. If the user accepts, we load the last saved
  // project package from the ProjectStore and restore it as the current
  // document. If the user declines, we checkpoint the journal to clear
  // the pending state.
  const recoverCrashedProject = useCallback(async () => {
    const store = projectStoreRef.current;
    const journal = crashJournalRef.current;
    if (!store || !journal) {
      setHasPendingRecovery(false);
      return;
    }
    try {
      const projects = await store.listProjects();
      if (projects.length === 0) {
        await journal.checkpoint();
        setHasPendingRecovery(false);
        return;
      }
      // Load the most recently updated project
      const latest = projects.sort((a, b) => b.updatedAt - a.updatedAt)[0];
      const pkg = await store.loadProject(latest.projectId);
      if (pkg?.composition) {
        setDocument(pkg.composition);
        setIsDirty(true);
      }
      await journal.checkpoint();
      setHasPendingRecovery(false);
    } catch {
      setHasPendingRecovery(false);
    }
  }, [setDocument, setIsDirty]);

  const dismissRecovery = useCallback(() => {
    const journal = crashJournalRef.current;
    if (journal) {
      void journal.checkpoint();
    }
    setHasPendingRecovery(false);
  }, []);

  // ── Asset import via durable AssetRegistry ─────────────────────────
  // Copies a media file into project storage so it survives gallery deletion.
  // Returns the AssetRef ID, or null if the registry isn't initialized.
  const importAsset = useCallback(async (
    sourceUri: string,
    mediaType: 'image' | 'video',
  ): Promise<string | null> => {
    const registry = assetRegistryRef.current;
    const store = projectStoreRef.current;
    if (!registry || !store) return null;

    // Ensure a project exists
    if (!projectIdRef.current) {
      try {
        const pkg = await store.createProject(initialType);
        projectIdRef.current = pkg.projectId;
      } catch {
        return null;
      }
    }

    const projectId = projectIdRef.current;
    if (!projectId) return null;

    try {
      return await registry.importAsset(
        projectId,
        sourceUri,
        { type: mediaType, source: 'gallery' },
      );
    } catch {
      return null;
    }
  }, [initialType]);

  return {
    projectStoreRef,
    assetRegistryRef,
    crashJournalRef,
    projectIdRef,
    hasPendingRecovery,
    recoverCrashedProject,
    dismissRecovery,
    importAsset,
  };
}
