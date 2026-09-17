import React, { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
import type { CreatorDocument, CreatorLayer, CreatorPage } from '../core/projectStore/composition';
import { createEmptyDocument } from '../core/projectStore/composition';
import { useHistoryStack } from '../core/projectStore/useHistoryStack';
import { CreatorAnalytics } from '../shared/creatorAnalytics';
import { haptics } from '../../utils/haptics';
import type { CreatorInitialMedia } from '../../navigation/types';
import type { ProjectStore, AssetRegistry } from '../core/projectStore';
import { useSelection } from './context/useSelection';
import { useEntryMediaSeeding } from './context/useEntryMediaSeeding';
import { useProjectStore } from './context/useProjectStore';
import { useUploadReconcile } from './context/useUploadReconcile';
import { useDocumentBootstrap } from './context/useDocumentBootstrap';
import { useAutosave } from './context/useAutosave';
import { useDocumentOps } from './context/useDocumentOps';
import { useLayerOps } from './context/useLayerOps';
import { usePageOps } from './context/usePageOps';
import { useClipboard } from './context/useClipboard';
import { useMultiSelectOps } from './context/useMultiSelectOps';
import { usePosterFrames } from './context/usePosterFrames';
import { useLookIntents } from './context/useLookIntents';
import { buildClipComposition } from './context/mediaBuilders';

export interface CreatorContextValue {
  document: CreatorDocument;
  activePageIndex: number;
  selectedLayerId: string | null;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  isDirty: boolean;
  autosaveStatus: 'idle' | 'saving' | 'saved' | 'failed';
  isLoadingDraft: boolean;
  /** Set when a draft load failed on mount (corrupt/missing). null otherwise. */
  draftError: string | null;
  /** Clear the draft error and retry loading the given draft id. */
  retryDraftLoad: (id: string) => void;

  setDocument: (doc: CreatorDocument) => void;
  /** Commit a document update through the history stack (undo/redo). */
  commitDocument: (doc: CreatorDocument, label: string) => void;
  setActivePageIndex: (index: number) => void;
  selectLayer: (id: string | null) => void;

  addLayer: (layer: CreatorLayer) => void;
  updateLayer: (id: string, updates: Partial<CreatorLayer>, label?: string) => void;
  /** Live (no-history) layer update — mutates document state without pushing
   *  to the undo/redo stack. Used for transient previews (e.g. live filter
   *  preview while scrolling the effect rail) that must not create history
   *  entries. Callers are responsible for committing via updateLayer or
   *  reverting when the preview ends. */
  updateLayerLive: (id: string, updates: Partial<CreatorLayer>) => void;
  commitLayerTransform: (id: string, updates: Partial<CreatorLayer>, label: string, isAutoLayout?: boolean) => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  reorderLayer: (id: string, direction: 'front' | 'forward' | 'backward' | 'back') => void;
  toggleLayerLock: (id: string) => void;
  toggleLayerVisibility: (id: string) => void;

  updateMetadata: (updates: Partial<CreatorDocument['metadata']>) => void;
  /** No-history metadata write for session state that should persist into
      drafts but must not pollute undo (e.g. playheadMs). */
  updateMetadataLive: (updates: Partial<CreatorDocument['metadata']>) => void;
  updateCanvas: (updates: Partial<CreatorDocument['canvas']>) => void;
  addPage: () => void;
  duplicatePage: (index: number) => void;
  removePage: (index: number) => void;
  reorderPages: (fromIndex: number, toIndex: number) => void;
  updatePageDuration: (index: number, durationMs: number) => void;
  /** Insert a pre-built page at a specific index. Used by split to create
      a new page for the second half of a split clip. */
  insertPage: (page: CreatorPage, index: number) => void;
  /** Update a layer on a specific page, bypassing activePageIndex. Used by
      timeline operations that target clips on non-active pages. */
  updateLayerOnPage: (pageIndex: number, layerId: string, updates: Partial<CreatorLayer>, label?: string) => void;

  undo: () => void;
  redo: () => void;
  retryAutosave: () => void;

  saveDraft: () => Promise<void>;
  loadDraft: (id: string) => Promise<boolean>;

  clipboard: CreatorLayer | null;
  copyLayer: (layerId: string) => void;
  pasteLayer: () => void;

  selectedLayerIds: string[];
  toggleMultiSelect: (layerId: string) => void;
  clearMultiSelect: () => void;
  deleteMultiSelected: () => void;
  /** Replace the entire multi-select set. null/empty clears selection. */
  selectLayers: (ids: string[] | null) => void;
  /** Add/remove a single layer from the multi-select set. */
  toggleLayerInSelection: (id: string) => void;
  /** Commit transforms to multiple layers in a single history entry. */
  commitMultiLayerTransform: (updates: Array<{ id: string; updates: Partial<CreatorLayer> }>, label: string) => void;
  /** Live (no-history) position update for multiple layers — used during drag. */
  updateLayersLive: (updates: Array<{ id: string; x?: number; y?: number }>) => void;
  /** Reorder all selected layers to the front (top of z-stack) in one entry. */
  bringSelectedToFront: () => void;
  /** Reorder all selected layers to the back (bottom of z-stack) in one entry. */
  sendSelectedToBack: () => void;

  alignLayerToCenter: (layerId: string) => void;
  alignLayerToHorizontalCenter: (layerId: string) => void;
  alignLayerToVerticalCenter: (layerId: string) => void;

  // ── Poster-specific frame methods ──────────────────────────────────
  // Poster is a sequence of frames (pages). Each frame normally has one
  // primary media layer. These methods encode the Story mental model
  // (add frames, replace frame media, reorder frames) without leaking
  // the generic layer/page abstraction to callers. They are no-ops for
  // Look documents (Look is a single-page collage).
  addPosterFrame: (media?: CreatorInitialMedia) => void;
  addPosterFrames: (media: CreatorInitialMedia[]) => void;
  replacePosterFrameMedia: (pageId: string, media: CreatorInitialMedia) => void;
  reorderPosterFrames: (from: number, to: number) => void;

  // ── Look-specific intent methods ──────────────────────────────────
  // Look is a collage on a single 4:5 canvas. These methods encode the
  // collage mental model (cutouts, product tags, asset swap, auto
  // arrangement) without leaking the generic layer/page abstraction to
  // callers. They are no-ops for Poster documents.
  addLookCutout: (params: {
    mediaUri: string;
    sourceLayerId?: string;
    contentFit?: 'cover' | 'contain' | 'fill';
  }) => void;
  addLookProduct: (params: {
    listingId: string;
    snapshotTitle: string;
    snapshotImageUrl?: string;
    snapshotPriceGbp?: number;
    x?: number;
    y?: number;
  }) => void;
  swapLookAsset: (layerId: string, replacement: {
    mediaUri: string;
    mediaType?: 'image' | 'video';
    contentFit?: 'cover' | 'contain' | 'fill';
  }) => void;
  autoArrangeLook: (layout?: 'hero' | 'pair' | 'dominant' | 'collage') => void;

  // ── Multi-clip capture → poster composition ────────────────────────
  // Creates a new poster composition from a set of captured clips. Each
  // clip becomes a sequential timeline media layer on a single page,
  // with the page duration set to the sum of all clip durations. The
  // returned document can be used to navigate to the poster composer.
  createCompositionFromClips: (clips: CreatorInitialMedia[]) => CreatorDocument;

  // ── Durable project store integration ──────────────────────────────
  // The ProjectStore persists project packages (document + copied media)
  // to the file system so drafts survive gallery media deletion.
  // These are ADDITIVE to the existing AsyncStorage draft system.
  projectStore: ProjectStore | null;
  assetRegistry: AssetRegistry | null;
  hasPendingRecovery: boolean;
  /** Recover the crashed project by loading the last journal checkpoint. */
  recoverCrashedProject: () => Promise<void>;
  /** Dismiss the recovery prompt without recovering. */
  dismissRecovery: () => void;
  importAsset: (sourceUri: string, mediaType: 'image' | 'video') => Promise<string | null>;
}

const CreatorContext = createContext<CreatorContextValue | null>(null);

export interface CreatorProviderProps {
  children: React.ReactNode;
  initialType: 'look' | 'poster';
  draftId?: string;
  templateId?: string;
  sourceDocumentId?: string;
  /**
   * Backward-compatible single-asset entry point. The asset is seeded as a
   * single image media layer. Prefer `initialMedia` for multi-asset or
   * video-aware acquisition.
   */
  initialMediaUri?: string;
  /**
   * Typed multi-asset acquisition payload. Every asset is seeded as a media
   * layer in deterministic order, preserving kind, dimensions and video
   * duration (in ms). When both `initialMedia` and `initialMediaUri` are
   * provided, `initialMedia` takes precedence.
   */
  initialMedia?: CreatorInitialMedia[];
}

export function CreatorProvider({ children, initialType, draftId, templateId, sourceDocumentId, initialMediaUri, initialMedia }: CreatorProviderProps) {
  const initialDoc = useMemo(() => createEmptyDocument(initialType), [initialType]);
  const [document, setDocumentState] = useState<CreatorDocument>(initialDoc);
  // Live document mirror for save paths. No-history writes (updateMetadataLive,
  // updateLayerLive) advance `document` without touching the history stack, so
  // the history top is stale for save purposes — always persist the live doc.
  const documentRef = useRef(document);
  documentRef.current = document;

  const [activePageIndex, setActivePageIndex] = useState(0);
  const {
    selectedLayerId,
    selectedLayerIds,
    setSelectedLayerId,
    setSelectedLayerIds,
    selectLayer,
    selectLayers,
    toggleLayerInSelection,
    toggleMultiSelect,
    clearMultiSelect,
  } = useSelection();
  const {
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    undo: undoHistory,
    redo: redoHistory,
    push: pushHistory,
    reset: resetHistory,
  } = useHistoryStack(initialDoc);
  const [isDirty, setIsDirty] = useState(false);
  const lastSavedDocRef = useRef(JSON.stringify(initialDoc));

  const commit = useCallback((doc: CreatorDocument, label: string) => {
    pushHistory(doc, label);
    setDocumentState(doc);
    setIsDirty(true);
  }, [pushHistory]);

  const setDocument = useCallback((doc: CreatorDocument) => {
    resetHistory(doc);
    setDocumentState(doc);
    setSelectedLayerId(null);
    setSelectedLayerIds([]);
    setActivePageIndex(0);
    setIsDirty(false);
    lastSavedDocRef.current = JSON.stringify(doc);
  }, [resetHistory, setSelectedLayerId, setSelectedLayerIds]);

  const undo = useCallback(() => {
    const doc = undoHistory();
    if (doc) {
      setDocumentState(doc);
      setSelectedLayerId(null);
      setSelectedLayerIds([]);
      CreatorAnalytics.undo(document.type);
    }
  }, [undoHistory, document.type, setSelectedLayerId, setSelectedLayerIds]);

  const redo = useCallback(() => {
    const doc = redoHistory();
    if (doc) {
      setDocumentState(doc);
      setSelectedLayerId(null);
      setSelectedLayerIds([]);
      CreatorAnalytics.redo(document.type);
    }
  }, [redoHistory, document.type, setSelectedLayerId, setSelectedLayerIds]);

  useEntryMediaSeeding({
    initialType,
    initialMediaUri,
    initialMedia,
    setDocumentState,
    resetHistory,
    setIsDirty,
  });

  const {
    projectStoreRef,
    assetRegistryRef,
    crashJournalRef,
    projectIdRef,
    hasPendingRecovery,
    recoverCrashedProject,
    dismissRecovery,
    importAsset,
  } = useProjectStore({ initialType, setDocument, setIsDirty });

  useUploadReconcile();

  const {
    isLoadingDraft,
    draftError,
    retryDraftLoad,
    loadDraft,
  } = useDocumentBootstrap({
    initialType,
    draftId,
    templateId,
    sourceDocumentId,
    setDocument,
  });

  const { autosaveStatus, saveDraft, retryAutosave } = useAutosave({
    document,
    documentRef,
    isDirty,
    setIsDirty,
    lastSavedDocRef,
    projectStoreRef,
    crashJournalRef,
    projectIdRef,
  });

  const {
    updateMetadata,
    updateMetadataLive,
    updateCanvas,
  } = useDocumentOps({ setDocumentState, pushHistory, setIsDirty });

  const {
    addLayer,
    updateLayer,
    updateLayerLive,
    commitLayerTransform,
    removeLayer,
    duplicateLayer,
    reorderLayer,
    toggleLayerLock,
    toggleLayerVisibility,
    alignLayerToCenter,
    alignLayerToHorizontalCenter,
    alignLayerToVerticalCenter,
  } = useLayerOps({
    document,
    activePageIndex,
    setDocumentState,
    pushHistory,
    setIsDirty,
    setSelectedLayerId,
  });

  const {
    addPage,
    duplicatePage,
    removePage,
    reorderPages,
    updatePageDuration,
    insertPage,
    updateLayerOnPage,
  } = usePageOps({
    document,
    setDocumentState,
    pushHistory,
    setIsDirty,
    setActivePageIndex,
    setSelectedLayerId,
  });

  const {
    clipboard,
    copyLayer,
    pasteLayer,
  } = useClipboard({ document, activePageIndex, addLayer });

  const {
    deleteMultiSelected,
    commitMultiLayerTransform,
    updateLayersLive,
    bringSelectedToFront,
    sendSelectedToBack,
  } = useMultiSelectOps({
    selectedLayerIds,
    activePageIndex,
    setDocumentState,
    pushHistory,
    setIsDirty,
    setSelectedLayerId,
    setSelectedLayerIds,
    removeLayer,
  });

  const {
    addPosterFrame,
    addPosterFrames,
    replacePosterFrameMedia,
    reorderPosterFrames,
  } = usePosterFrames({
    document,
    setDocumentState,
    pushHistory,
    setIsDirty,
    setActivePageIndex,
    setSelectedLayerId,
    reorderPages,
  });

  const {
    addLookCutout,
    addLookProduct,
    swapLookAsset,
    autoArrangeLook,
  } = useLookIntents({
    document,
    setDocumentState,
    pushHistory,
    setIsDirty,
    addLayer,
    updateLayer,
  });

  // ── Multi-clip capture → poster composition ────────────────────────
  // Creates a new poster composition from a set of captured clips. Each
  // clip becomes a sequential timeline media layer on a single page.
  // The page duration is set to the sum of all clip durations. The
  // composition is set as the current document and returned so the
  // caller can navigate to the poster composer (e.g. via a draft ID or
  // by passing the document through route params).
  //
  // Per the task spec:
  //   - Creates a new composition with a single page
  //   - Adds each clip as a sequential timeline clip (media layer with
  //     timeRange)
  //   - Sets the composition duration to the sum of clip durations
  //   - The caller opens the poster composer with the new composition
  //
  // The timeRange on each media layer enables the timeline renderer to
  // play clips sequentially: clip 0 plays from 0 to its duration, clip 1
  // from clip 0's end to clip 0's end + clip 1's duration, etc.
  const createCompositionFromClips = useCallback(
    (clips: CreatorInitialMedia[]): CreatorDocument => {
      const doc = buildClipComposition(clips);
      // Set the new document as the current composition
      setDocument(doc);
      haptics.selection();
      return doc;
    },
    [setDocument],
  );

  const value = useMemo<CreatorContextValue>(
    () => ({
      document,
      activePageIndex,
      selectedLayerId,
      canUndo,
      canRedo,
      undoLabel,
      redoLabel,
      isDirty,
      autosaveStatus,
      isLoadingDraft,
      draftError,
      retryDraftLoad,
      setDocument,
      commitDocument: commit,
      setActivePageIndex,
      selectLayer,
      addLayer,
      updateLayer,
      commitLayerTransform,
      removeLayer,
      duplicateLayer,
      reorderLayer,
      toggleLayerLock,
      toggleLayerVisibility,
      updateMetadata,
      updateMetadataLive,
      updateCanvas,
      addPage,
      duplicatePage,
      removePage,
      reorderPages,
      updatePageDuration,
      insertPage,
      updateLayerOnPage,
      undo,
      redo,
      retryAutosave,
      saveDraft,
      loadDraft,
      clipboard,
      copyLayer,
      pasteLayer,
      selectedLayerIds,
      toggleMultiSelect,
      clearMultiSelect,
      deleteMultiSelected,
      selectLayers,
      toggleLayerInSelection,
      commitMultiLayerTransform,
      updateLayersLive,
      updateLayerLive,
      bringSelectedToFront,
      sendSelectedToBack,
      alignLayerToCenter,
      alignLayerToHorizontalCenter,
      alignLayerToVerticalCenter,
      addPosterFrame,
      addPosterFrames,
      replacePosterFrameMedia,
      reorderPosterFrames,
      addLookCutout,
      addLookProduct,
      swapLookAsset,
      autoArrangeLook,
      createCompositionFromClips,
      // ── Durable project store integration ──
      projectStore: projectStoreRef.current,
      assetRegistry: assetRegistryRef.current,
      hasPendingRecovery,
      recoverCrashedProject,
      dismissRecovery,
      importAsset,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ref.current reads are stable value captures
    [
      document,
      activePageIndex,
      selectedLayerId,
      canUndo,
      canRedo,
      undoLabel,
      redoLabel,
      isDirty,
      autosaveStatus,
      isLoadingDraft,
      draftError,
      retryDraftLoad,
      setDocument,
      commit,
      setActivePageIndex,
      selectLayer,
      addLayer,
      updateLayer,
      commitLayerTransform,
      removeLayer,
      duplicateLayer,
      reorderLayer,
      toggleLayerLock,
      toggleLayerVisibility,
      updateMetadata,
      updateMetadataLive,
      updateCanvas,
      addPage,
      duplicatePage,
      removePage,
      reorderPages,
      updatePageDuration,
      insertPage,
      updateLayerOnPage,
      undo,
      redo,
      retryAutosave,
      saveDraft,
      loadDraft,
      clipboard,
      copyLayer,
      pasteLayer,
      selectedLayerIds,
      toggleMultiSelect,
      clearMultiSelect,
      deleteMultiSelected,
      selectLayers,
      toggleLayerInSelection,
      commitMultiLayerTransform,
      updateLayersLive,
      updateLayerLive,
      bringSelectedToFront,
      sendSelectedToBack,
      alignLayerToCenter,
      alignLayerToHorizontalCenter,
      alignLayerToVerticalCenter,
      addPosterFrame,
      addPosterFrames,
      replacePosterFrameMedia,
      reorderPosterFrames,
      addLookCutout,
      addLookProduct,
      swapLookAsset,
      autoArrangeLook,
      createCompositionFromClips,
      projectStoreRef.current,
      assetRegistryRef.current,
      hasPendingRecovery,
      recoverCrashedProject,
      dismissRecovery,
      importAsset,
    ],
  );

  return <CreatorContext.Provider value={value}>{children}</CreatorContext.Provider>;
}

export function useCreator(): CreatorContextValue {
  const ctx = useContext(CreatorContext);
  if (!ctx) throw new Error('useCreator must be used within CreatorProvider');
  return ctx;
}
