import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { CreatorDocument, CreatorLayer, CreatorPage } from './composition';
import {
  createEmptyDocument,
  addLayerToPage,
  updateLayerInPage,
  removeLayerFromPage,
  reorderLayerZ,
  duplicateLayerInPage,
  computeLookLayout,
  POSTER_DEFAULT_ASPECT_RATIO,
} from './composition';
import { HistoryStack } from './history';
import { CreatorDraftService } from './drafts';
import { CreatorAnalytics } from './creatorAnalytics';
import { getTemplateById } from './templates';
import { createStableId, makeStableId } from '../utils/createStableId';
import { haptics } from '../utils/haptics';
import type { CreatorInitialMedia } from '../navigation/types';
import { ProjectStore, AssetRegistry, CrashJournal, PROJECT_SCHEMA_VERSION } from './core/projectStore';
import type { ProjectPackage, ProjectType } from './core/projectStore';

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

  setDocument: (doc: CreatorDocument) => void;
  /** Commit a document update through the history stack (undo/redo). */
  commitDocument: (doc: CreatorDocument, label: string) => void;
  setActivePageIndex: (index: number) => void;
  selectLayer: (id: string | null) => void;

  addLayer: (layer: CreatorLayer) => void;
  updateLayer: (id: string, updates: Partial<CreatorLayer>, label?: string) => void;
  commitLayerTransform: (id: string, updates: Partial<CreatorLayer>, label: string) => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  reorderLayer: (id: string, direction: 'front' | 'forward' | 'backward' | 'back') => void;
  toggleLayerLock: (id: string) => void;
  toggleLayerVisibility: (id: string) => void;

  updateMetadata: (updates: Partial<CreatorDocument['metadata']>) => void;
  updateCanvas: (updates: Partial<CreatorDocument['canvas']>) => void;
  addPage: () => void;
  duplicatePage: (index: number) => void;
  removePage: (index: number) => void;
  reorderPages: (fromIndex: number, toIndex: number) => void;
  updatePageDuration: (index: number, durationMs: number) => void;

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

const AUTOSAVE_INTERVAL_MS = 5000;
const MAX_PAGES = 10;

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
  // Seed initial captured/selected media. The seeding strategy branches on
  // `initialType` to respect the two distinct product mental models:
  //
  //   Poster (Story): a SEQUENCE of frames. Each selected asset becomes its
  //     own page (frame) — media[0] → page 0, media[1] → page 1, etc. This
  //     preserves the user's tap/selection order so frames play in the
  //     order the user chose them.
  //
  //   Look (collage): a COMPOSED canvas. Multiple selected assets are seeded
  //     as stacked media layers on a single page (page 0), preserving the
  //     existing collage behavior.
  //
  // When `initialMedia` is absent, fall back to the legacy single-URI
  // `initialMediaUri` path (treated as an image layer on page 0) for
  // backward compatibility with existing single-asset entry points (e.g.
  // camera capture).
  useEffect(() => {
    if (initialMedia && initialMedia.length > 0) {
      setDocumentState((prev) => {
        if (initialType === 'poster') {
          // ── Poster: one page per selected asset ──
          // Each media item creates a new page with a single base media
          // layer at z=0. The initial empty page (page_1) is replaced by
          // the first frame; subsequent frames are appended. Selection
          // order == page order.
          const pages = initialMedia.slice(0, MAX_PAGES).map((asset, i) => {
            const mediaLayer: CreatorLayer = {
              id: createStableId('media'),
              type: 'media',
              x: 0.5,
              y: 0.5,
              width: 1,
              height: 1,
              scale: 1,
              rotation: 0,
              zIndex: 0,
              locked: false,
              hidden: false,
              opacity: 1,
              payload: {
                mediaUri: asset.uri,
                mediaType: asset.kind,
                contentFit: 'cover',
                videoDurationMs: asset.kind === 'video' ? asset.durationMs : undefined,
                opacity: 1,
              },
            };
            return {
              id: makeStableId(`page_${i}`),
              layers: [mediaLayer],
            };
          });
          return { ...prev, pages, updatedAt: new Date().toISOString() };
        }
        // ── Look: multi-media as auto-arranged layers on page 0 ──
        // Per doc 05: "Default should never produce four identical
        // full-bleed images stacked at center." We use computeLookLayout
        // to position assets based on count (hero, pair, dominant,
        // collage) so the canvas is immediately useful.
        const lookLayers: CreatorLayer[] = initialMedia.map((asset, i) => ({
          id: createStableId('media'),
          type: 'media' as const,
          x: 0.5,
          y: 0.5,
          width: 1,
          height: 1,
          scale: 1,
          rotation: 0,
          zIndex: i,
          locked: false,
          hidden: false,
          opacity: 1,
          payload: {
            mediaUri: asset.uri,
            mediaType: asset.kind,
            contentFit: 'cover' as const,
            videoDurationMs: asset.kind === 'video' ? asset.durationMs : undefined,
            opacity: 1,
          },
        }));
        const arrangedLayers = computeLookLayout(lookLayers);
        let lookDoc = prev;
        arrangedLayers.forEach((layer) => {
          lookDoc = addLayerToPage(lookDoc, 0, layer);
        });
        return lookDoc;
      });
      return;
    }
    if (!initialMediaUri) return;
    const mediaLayer: CreatorLayer = {
      id: createStableId('media'),
      type: 'media',
      x: 0.5,
      y: 0.5,
      width: 1,
      height: 1,
      scale: 1,
      rotation: 0,
      zIndex: 0,
      locked: false,
      hidden: false,
      opacity: 1,
      payload: {
        mediaUri: initialMediaUri,
        mediaType: 'image',
        contentFit: 'cover',
        opacity: 1,
      },
    };
    setDocumentState((prev) => addLayerToPage(prev, 0, mediaLayer));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMediaUri, initialMedia, initialType]);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [undoLabel, setUndoLabel] = useState<string | null>(null);
  const [redoLabel, setRedoLabel] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);

  const historyRef = useRef(new HistoryStack(initialDoc));
  const lastSavedDocRef = useRef(JSON.stringify(initialDoc));
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Durable project store refs ─────────────────────────────────────
  // Lazy-initialized singletons. The ProjectStore persists project packages
  // (document + copied media) to the file system so drafts survive gallery
  // media deletion. Additive to the existing AsyncStorage draft system.
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
  }, []);

  const dismissRecovery = useCallback(() => {
    const journal = crashJournalRef.current;
    if (journal) {
      void journal.checkpoint();
    }
    setHasPendingRecovery(false);
  }, []);

  const syncHistoryButtons = useCallback(() => {
    const h = historyRef.current;
    setCanUndo(h.canUndo());
    setCanRedo(h.canRedo());
    setUndoLabel(h.getUndoLabel());
    setRedoLabel(h.getRedoLabel());
  }, []);

  const commit = useCallback((doc: CreatorDocument, label: string) => {
    historyRef.current.push(doc, label);
    setDocumentState(doc);
    setIsDirty(true);
    syncHistoryButtons();
  }, [syncHistoryButtons]);

  const setDocument = useCallback((doc: CreatorDocument) => {
    historyRef.current.reset(doc);
    setDocumentState(doc);
    setSelectedLayerId(null);
    setSelectedLayerIds([]);
    setActivePageIndex(0);
    setIsDirty(false);
    lastSavedDocRef.current = JSON.stringify(doc);
    syncHistoryButtons();
  }, [syncHistoryButtons]);

  useEffect(() => {
    CreatorAnalytics.sessionStart(initialType);
  }, [initialType]);

  // Load draft on mount if draftId is provided
  useEffect(() => {
    if (!draftId) return;
    let cancelled = false;
    setIsLoadingDraft(true);
    CreatorDraftService.loadDraft(draftId).then((doc) => {
      if (cancelled || !doc) return;
      setDocument(doc);
      CreatorAnalytics.draftLoad(doc.type);
    }).catch(() => {
      // Corrupt or missing draft — stay with empty document
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
          title: `Remix of ${sourceDoc.metadata.title || 'Untitled'}`,
        },
        updatedAt: new Date().toISOString(),
      };
      setDocument(remixedDoc);
    }).catch(() => {
      // Source not found — stay with empty document
    }).finally(() => {
      if (!cancelled) setIsLoadingDraft(false);
    });
    return () => { cancelled = true; };
  }, [sourceDocumentId, draftId, templateId, setDocument]);

  // selectLayer keeps the singular `selectedLayerId` and the multi-select
  // array `selectedLayerIds` in sync. A non-null id selects exactly that
  // layer (single-select); null clears both — including multi-select.
  const selectLayer = useCallback((id: string | null) => {
    setSelectedLayerId(id);
    setSelectedLayerIds(id ? [id] : []);
  }, []);

  const addLayer = useCallback((layer: CreatorLayer) => {
    setDocumentState((prev) => {
      const doc = addLayerToPage(prev, activePageIndex, layer);
      historyRef.current.push(doc, `Add ${layer.type} layer`);
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
    setSelectedLayerId(layer.id);
    CreatorAnalytics.layerAdd(document.type, layer.type);
  }, [activePageIndex, syncHistoryButtons, document.type]);

  const updateLayer = useCallback((id: string, updates: Partial<CreatorLayer>, label?: string) => {
    setDocumentState((prev) => {
      const doc = updateLayerInPage(prev, activePageIndex, id, updates);
      doc.updatedAt = new Date().toISOString();
      // Coalesce rapid updates with the same label into one history entry
      // This prevents history spam when updateLayer is called in rapid succession
      historyRef.current.push(doc, label ?? 'Update layer');
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
    CreatorAnalytics.layerTransform(document.type, updates.type ?? 'update');
  }, [activePageIndex, syncHistoryButtons, document.type]);

  const commitLayerTransform = useCallback((id: string, updates: Partial<CreatorLayer>, label: string) => {
    setDocumentState((prev) => {
      const doc = updateLayerInPage(prev, activePageIndex, id, updates);
      doc.updatedAt = new Date().toISOString();
      historyRef.current.push(doc, label);
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
    CreatorAnalytics.layerTransform(document.type, updates.type ?? 'transform');
  }, [activePageIndex, syncHistoryButtons, document.type]);

  const removeLayer = useCallback((id: string) => {
    const layerType = document.pages[activePageIndex]?.layers.find((l) => l.id === id)?.type ?? 'unknown';
    setDocumentState((prev) => {
      const doc = removeLayerFromPage(prev, activePageIndex, id);
      historyRef.current.push(doc, 'Remove layer');
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
    setSelectedLayerId(null);
    CreatorAnalytics.layerRemove(document.type, layerType);
  }, [activePageIndex, syncHistoryButtons, document.type, document.pages]);

  const duplicateLayer = useCallback((id: string) => {
    const layerType = document.pages[activePageIndex]?.layers.find((l) => l.id === id)?.type ?? 'unknown';
    setDocumentState((prev) => {
      const doc = duplicateLayerInPage(prev, activePageIndex, id);
      historyRef.current.push(doc, 'Duplicate layer');
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
    CreatorAnalytics.layerDuplicate(document.type, layerType);
  }, [activePageIndex, syncHistoryButtons, document.type, document.pages]);

  const reorderLayer = useCallback((id: string, direction: 'front' | 'forward' | 'backward' | 'back') => {
    setDocumentState((prev) => {
      const doc = reorderLayerZ(prev, activePageIndex, id, direction);
      historyRef.current.push(doc, `Move ${direction}`);
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
    CreatorAnalytics.layerReorder(document.type, direction);
  }, [activePageIndex, syncHistoryButtons, document.type]);

  const toggleLayerLock = useCallback((id: string) => {
    setDocumentState((prev) => {
      const layer = prev.pages[activePageIndex]?.layers.find((l) => l.id === id);
      if (!layer) return prev;
      const doc = updateLayerInPage(prev, activePageIndex, id, { locked: !layer.locked });
      historyRef.current.push(doc, layer.locked ? 'Unlock layer' : 'Lock layer');
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
  }, [activePageIndex, syncHistoryButtons]);

  const toggleLayerVisibility = useCallback((id: string) => {
    setDocumentState((prev) => {
      const layer = prev.pages[activePageIndex]?.layers.find((l) => l.id === id);
      if (!layer) return prev;
      const doc = updateLayerInPage(prev, activePageIndex, id, { hidden: !layer.hidden });
      historyRef.current.push(doc, layer.hidden ? 'Show layer' : 'Hide layer');
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
  }, [activePageIndex, syncHistoryButtons]);

  const updateMetadata = useCallback((updates: Partial<CreatorDocument['metadata']>) => {
    setDocumentState((prev) => {
      const doc = { ...prev, metadata: { ...prev.metadata, ...updates }, updatedAt: new Date().toISOString() };
      historyRef.current.push(doc, 'Update settings');
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
  }, [syncHistoryButtons]);

  const updateCanvas = useCallback((updates: Partial<CreatorDocument['canvas']>) => {
    setDocumentState((prev) => {
      const doc = { ...prev, canvas: { ...prev.canvas, ...updates }, updatedAt: new Date().toISOString() };
      historyRef.current.push(doc, 'Update canvas');
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
  }, [syncHistoryButtons]);

  const addPage = useCallback(() => {
    setDocumentState((prev) => {
      if (prev.pages.length >= MAX_PAGES) return prev;
      const doc = {
        ...prev,
        pages: [...prev.pages, { id: `page_${Date.now()}`, layers: [] }],
        updatedAt: new Date().toISOString(),
      };
      historyRef.current.push(doc, 'Add page');
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
    setActivePageIndex((prev) => prev + 1);
    setSelectedLayerId(null);
    CreatorAnalytics.pageAdd(document.type, document.pages.length + 1);
  }, [syncHistoryButtons, document.type, document.pages.length]);

  const duplicatePage = useCallback((index: number) => {
    setDocumentState((prev) => {
      if (prev.pages.length >= MAX_PAGES) return prev;
      const sourcePage = prev.pages[index];
      if (!sourcePage) return prev;
      const clonedLayers = sourcePage.layers.map((l) => ({
        ...l,
        id: `${l.id}_clone_${createStableId()}`,
      }));
      const newPage: CreatorPage = {
        id: makeStableId('page'),
        layers: clonedLayers,
        durationMs: sourcePage.durationMs,
      };
      const newPages = [...prev.pages];
      newPages.splice(index + 1, 0, newPage);
      const doc = { ...prev, pages: newPages, updatedAt: new Date().toISOString() };
      historyRef.current.push(doc, 'Duplicate page');
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
    setActivePageIndex(index + 1);
    setSelectedLayerId(null);
  }, [syncHistoryButtons]);

  const reorderPages = useCallback((fromIndex: number, toIndex: number) => {
    setDocumentState((prev) => {
      if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= prev.pages.length || toIndex < 0 || toIndex >= prev.pages.length) return prev;
      const newPages = [...prev.pages];
      const [moved] = newPages.splice(fromIndex, 1);
      newPages.splice(toIndex, 0, moved);
      const doc = { ...prev, pages: newPages, updatedAt: new Date().toISOString() };
      historyRef.current.push(doc, 'Reorder pages');
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
    setActivePageIndex(toIndex);
    setSelectedLayerId(null);
  }, [syncHistoryButtons]);

  const updatePageDuration = useCallback((index: number, durationMs: number) => {
    setDocumentState((prev) => {
      const newPages = [...prev.pages];
      if (!newPages[index]) return prev;
      newPages[index] = { ...newPages[index], durationMs };
      const doc = { ...prev, pages: newPages, updatedAt: new Date().toISOString() };
      historyRef.current.push(doc, 'Update duration');
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
  }, [syncHistoryButtons]);

  const removePage = useCallback((index: number) => {
    setDocumentState((prev) => {
      if (prev.pages.length <= 1) return prev;
      const doc = {
        ...prev,
        pages: prev.pages.filter((_, i) => i !== index),
        updatedAt: new Date().toISOString(),
      };
      historyRef.current.push(doc, 'Remove page');
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
    setActivePageIndex((prev) => Math.max(0, prev > index ? prev - 1 : prev === index ? Math.max(0, index - 1) : prev));
    setSelectedLayerId(null);
  }, [syncHistoryButtons]);

  const undo = useCallback(() => {
    const doc = historyRef.current.undo();
    if (doc) {
      setDocumentState(doc);
      setSelectedLayerId(null);
      setSelectedLayerIds([]);
      syncHistoryButtons();
      CreatorAnalytics.undo(document.type);
    }
  }, [syncHistoryButtons, document.type]);

  const redo = useCallback(() => {
    const doc = historyRef.current.redo();
    if (doc) {
      setDocumentState(doc);
      setSelectedLayerId(null);
      setSelectedLayerIds([]);
      syncHistoryButtons();
      CreatorAnalytics.redo(document.type);
    }
  }, [syncHistoryButtons, document.type]);

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
      // Per spec 08 §5: write temp, rename to project.json. This is the
      // primary durable path; AsyncStorage is the fallback for platforms
      // where expo-file-system is unavailable.
      const store = projectStoreRef.current;
      const journal = crashJournalRef.current;
      if (store) {
        try {
          // Ensure a project ID exists for this document
          if (!projectIdRef.current) {
            const pkg = await store.createProject(document.type);
            projectIdRef.current = pkg.projectId;
          }
          const projectPkg: ProjectPackage = {
            projectId: projectIdRef.current!,
            version: PROJECT_SCHEMA_VERSION,
            name: document.metadata.title || 'Untitled',
            composition: document,
            assets: {},
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          await store.saveProject(projectPkg);
          // Checkpoint the crash journal after a successful atomic save
          if (journal) {
            await journal.checkpoint();
          }
        } catch {
          // ProjectStore save failed — the legacy AsyncStorage save above
          // already succeeded, so the draft is not lost. The crash journal
          // (if any) will still trigger recovery on next launch.
        }
      }
    } catch {
      setAutosaveStatus('failed');
    }
  }, [document]);

  const retryAutosave = useCallback(async () => {
    if (!isDirty) return;
    setAutosaveStatus('saving');
    try {
      const current = historyRef.current.current();
      await CreatorDraftService.saveDraft(current);
      lastSavedDocRef.current = JSON.stringify(current);
      setIsDirty(false);
      setAutosaveStatus('saved');

      // Durable ProjectStore save (atomic write)
      const store = projectStoreRef.current;
      const journal = crashJournalRef.current;
      if (store) {
        try {
          if (!projectIdRef.current) {
            const pkg = await store.createProject(current.type);
            projectIdRef.current = pkg.projectId;
          }
          const projectPkg: ProjectPackage = {
            projectId: projectIdRef.current!,
            version: PROJECT_SCHEMA_VERSION,
            name: current.metadata.title || 'Untitled',
            composition: current,
            assets: {},
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          await store.saveProject(projectPkg);
          if (journal) {
            await journal.checkpoint();
          }
        } catch {
          // ProjectStore failed — legacy save already succeeded
        }
      }
    } catch {
      setAutosaveStatus('failed');
    }
  }, [isDirty]);

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

  const loadDraft = useCallback(async (id: string): Promise<boolean> => {
    const doc = await CreatorDraftService.loadDraft(id);
    if (doc) {
      setDocument(doc);
      return true;
    }
    return false;
  }, [setDocument]);

  // ─── Copy / Paste ────────────────────────────────────────────────────────
  const [clipboard, setClipboard] = useState<CreatorLayer | null>(null);

  const copyLayer = useCallback((layerId: string) => {
    const layer = document.pages[activePageIndex].layers.find((l) => l.id === layerId);
    if (layer) {
      setClipboard({ ...layer });
      haptics.selection();
    }
  }, [document, activePageIndex]);

  const pasteLayer = useCallback(() => {
    if (!clipboard) return;
    const newLayer: CreatorLayer = {
      ...clipboard,
      id: createStableId(clipboard.type),
      x: Math.min(clipboard.x + 0.05, 1.4),
      y: Math.min(clipboard.y + 0.05, 1.4),
    };
    addLayer(newLayer);
    setClipboard(null);
    haptics.tap();
  }, [clipboard, addLayer]);

  // ─── Multi-Select ────────────────────────────────────────────────────────
  // `selectedLayerIds` holds the full multi-select set. `selectedLayerId`
  // (singular, above) is always kept in sync as the primary (first) element
  // for backward compatibility with single-select consumers.
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);

  // Replace the entire selection set. null/[] clears both states.
  const selectLayers = useCallback((ids: string[] | null) => {
    const arr = ids ?? [];
    setSelectedLayerIds(arr);
    setSelectedLayerId(arr.length > 0 ? arr[0] : null);
  }, []);

  // Add/remove a single layer from the multi-select set. The primary
  // (first) selection becomes the new head of the array.
  const toggleLayerInSelection = useCallback((id: string) => {
    setSelectedLayerIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      setSelectedLayerId(next.length > 0 ? next[0] : null);
      return next;
    });
  }, []);

  // Legacy alias — delegates to toggleLayerInSelection so existing
  // consumers keep working with the synced primary selection.
  const toggleMultiSelect = useCallback((layerId: string) => {
    setSelectedLayerIds((prev) => {
      const next = prev.includes(layerId)
        ? prev.filter((x) => x !== layerId)
        : [...prev, layerId];
      setSelectedLayerId(next.length > 0 ? next[0] : null);
      return next;
    });
  }, []);

  const clearMultiSelect = useCallback(() => {
    setSelectedLayerIds([]);
    setSelectedLayerId(null);
  }, []);

  const deleteMultiSelected = useCallback(() => {
    selectedLayerIds.forEach((id) => removeLayer(id));
    setSelectedLayerIds([]);
    setSelectedLayerId(null);
  }, [selectedLayerIds, removeLayer]);

  // Commit transforms to multiple layers in a single history entry.
  // Used by bulk align, bulk move (drag end), and distribute operations.
  const commitMultiLayerTransform = useCallback((
    updates: Array<{ id: string; updates: Partial<CreatorLayer> }>,
    label: string,
  ) => {
    if (updates.length === 0) return;
    setDocumentState((prev) => {
      let doc = prev;
      for (const { id, updates: layerUpdates } of updates) {
        doc = updateLayerInPage(doc, activePageIndex, id, layerUpdates);
      }
      doc.updatedAt = new Date().toISOString();
      historyRef.current.push(doc, label);
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
  }, [activePageIndex, syncHistoryButtons]);

  // Live (no-history) position update for multiple layers. Used during
  // multi-select drag so peer layers move together in real-time without
  // spamming the history stack. The final committed state is written via
  // commitMultiLayerTransform on drag end.
  const updateLayersLive = useCallback((
    updates: Array<{ id: string; x?: number; y?: number }>,
  ) => {
    if (updates.length === 0) return;
    setDocumentState((prev) => {
      let doc = prev;
      for (const { id, x, y } of updates) {
        const layerUpdates: Partial<CreatorLayer> = {};
        if (x !== undefined) layerUpdates.x = x;
        if (y !== undefined) layerUpdates.y = y;
        doc = updateLayerInPage(doc, activePageIndex, id, layerUpdates);
      }
      doc.updatedAt = new Date().toISOString();
      return doc;
    });
  }, [activePageIndex]);

  // Reorder all selected layers to the front (top of z-stack) in one
  // history entry, preserving the relative order of the selected set.
  const bringSelectedToFront = useCallback(() => {
    if (selectedLayerIds.length === 0) return;
    setDocumentState((prev) => {
      const pages = [...prev.pages];
      const page = { ...pages[activePageIndex] };
      const sorted = [...page.layers].sort((a, b) => a.zIndex - b.zIndex);
      const selectedSet = new Set(selectedLayerIds);
      const selected = sorted.filter((l) => selectedSet.has(l.id));
      const unselected = sorted.filter((l) => !selectedSet.has(l.id));
      page.layers = [...unselected, ...selected].map((l, i) => ({ ...l, zIndex: i }));
      pages[activePageIndex] = page;
      const doc = { ...prev, pages, updatedAt: new Date().toISOString() };
      historyRef.current.push(doc, 'Bring to front');
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
  }, [activePageIndex, syncHistoryButtons, selectedLayerIds]);

  // Reorder all selected layers to the back (bottom of z-stack) in one
  // history entry, preserving the relative order of the selected set.
  const sendSelectedToBack = useCallback(() => {
    if (selectedLayerIds.length === 0) return;
    setDocumentState((prev) => {
      const pages = [...prev.pages];
      const page = { ...pages[activePageIndex] };
      const sorted = [...page.layers].sort((a, b) => a.zIndex - b.zIndex);
      const selectedSet = new Set(selectedLayerIds);
      const selected = sorted.filter((l) => selectedSet.has(l.id));
      const unselected = sorted.filter((l) => !selectedSet.has(l.id));
      page.layers = [...selected, ...unselected].map((l, i) => ({ ...l, zIndex: i }));
      pages[activePageIndex] = page;
      const doc = { ...prev, pages, updatedAt: new Date().toISOString() };
      historyRef.current.push(doc, 'Send to back');
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
  }, [activePageIndex, syncHistoryButtons, selectedLayerIds]);

  // ─── Alignment Tools ─────────────────────────────────────────────────────
  const alignLayerToCenter = useCallback((layerId: string) => {
    updateLayer(layerId, { x: 0.5, y: 0.5 });
  }, [updateLayer]);

  const alignLayerToHorizontalCenter = useCallback((layerId: string) => {
    updateLayer(layerId, { x: 0.5 });
  }, [updateLayer]);

  const alignLayerToVerticalCenter = useCallback((layerId: string) => {
    updateLayer(layerId, { y: 0.5 });
  }, [updateLayer]);

  // ─── Poster-specific frame methods ────────────────────────────────
  // Poster is a sequence of frames (pages). Each frame normally has one
  // primary media layer. These methods encode the Story mental model
  // (add frames, replace frame media, reorder frames) and are no-ops for
  // Look documents (Look is a single-page collage).

  const addPosterFrame = useCallback((media?: CreatorInitialMedia) => {
    if (document.type !== 'poster') return;
    setDocumentState((prev) => {
      if (prev.pages.length >= MAX_PAGES) return prev;
      // If the document has only the initial empty page (from
      // createEmptyDocument), replace it rather than appending.
      const hasOnlyEmptyPage =
        prev.pages.length === 1 && prev.pages[0].layers.length === 0;
      const mediaLayer: CreatorLayer | null = media ? {
        id: createStableId('media'),
        type: 'media',
        x: 0.5,
        y: 0.5,
        width: 1,
        height: 1,
        scale: 1,
        rotation: 0,
        zIndex: 0,
        locked: false,
        hidden: false,
        opacity: 1,
        payload: {
          mediaUri: media.uri,
          mediaType: media.kind,
          contentFit: 'cover',
          videoDurationMs: media.kind === 'video' ? media.durationMs : undefined,
          opacity: 1,
        },
      } : null;
      const newPage: CreatorPage = {
        id: makeStableId('page'),
        layers: mediaLayer ? [mediaLayer] : [],
      };
      const doc = {
        ...prev,
        pages: hasOnlyEmptyPage ? [newPage] : [...prev.pages, newPage],
        updatedAt: new Date().toISOString(),
      };
      historyRef.current.push(doc, 'Add frame');
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
    setActivePageIndex((prev) => prev + 1);
    setSelectedLayerId(null);
    CreatorAnalytics.pageAdd('poster', document.pages.length + 1);
  }, [document.type, document.pages.length, syncHistoryButtons]);

  const addPosterFrames = useCallback((media: CreatorInitialMedia[]) => {
    if (document.type !== 'poster') return;
    setDocumentState((prev) => {
      // If the document has only the initial empty page (from
      // createEmptyDocument), replace it rather than appending so that
      // selecting N assets produces exactly N pages — not N+1 with a
      // leading empty frame.
      const hasOnlyEmptyPage =
        prev.pages.length === 1 && prev.pages[0].layers.length === 0;
      const basePages = hasOnlyEmptyPage ? [] : prev.pages;
      const remaining = MAX_PAGES - basePages.length;
      if (remaining <= 0) return prev;
      const toAdd = media.slice(0, remaining);
      const newPages: CreatorPage[] = toAdd.map((asset, i) => {
        const mediaLayer: CreatorLayer = {
          id: createStableId('media'),
          type: 'media',
          x: 0.5,
          y: 0.5,
          width: 1,
          height: 1,
          scale: 1,
          rotation: 0,
          zIndex: 0,
          locked: false,
          hidden: false,
          opacity: 1,
          payload: {
            mediaUri: asset.uri,
            mediaType: asset.kind,
            contentFit: 'cover',
            videoDurationMs: asset.kind === 'video' ? asset.durationMs : undefined,
            opacity: 1,
          },
        };
        return {
          id: makeStableId(`page_${i}`),
          layers: [mediaLayer],
        };
      });
      const doc = {
        ...prev,
        pages: [...basePages, ...newPages],
        updatedAt: new Date().toISOString(),
      };
      historyRef.current.push(doc, `Add ${newPages.length} frame${newPages.length > 1 ? 's' : ''}`);
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
  }, [document.type, syncHistoryButtons]);

  const replacePosterFrameMedia = useCallback((pageId: string, media: CreatorInitialMedia) => {
    if (document.type !== 'poster') return;
    setDocumentState((prev) => {
      const pageIndex = prev.pages.findIndex((p) => p.id === pageId);
      if (pageIndex === -1) return prev;
      const pages = [...prev.pages];
      const page = { ...pages[pageIndex] };
      // Find existing media layer or create a new one
      const existingMediaIdx = page.layers.findIndex((l) => l.type === 'media');
      const newMediaLayer: CreatorLayer = {
        id: existingMediaIdx >= 0 ? page.layers[existingMediaIdx].id : createStableId('media'),
        type: 'media',
        x: 0.5,
        y: 0.5,
        width: 1,
        height: 1,
        scale: 1,
        rotation: 0,
        zIndex: 0,
        locked: false,
        hidden: false,
        opacity: 1,
        payload: {
          mediaUri: media.uri,
          mediaType: media.kind,
          contentFit: 'cover',
          videoDurationMs: media.kind === 'video' ? media.durationMs : undefined,
          opacity: 1,
        },
      };
      if (existingMediaIdx >= 0) {
        page.layers = page.layers.map((l, i) => i === existingMediaIdx ? newMediaLayer : l);
      } else {
        page.layers = [newMediaLayer, ...page.layers];
      }
      pages[pageIndex] = page;
      const doc = { ...prev, pages, updatedAt: new Date().toISOString() };
      historyRef.current.push(doc, 'Replace frame media');
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
  }, [document.type, syncHistoryButtons]);

  const reorderPosterFrames = useCallback((from: number, to: number) => {
    if (document.type !== 'poster') return;
    reorderPages(from, to);
  }, [document.type, reorderPages]);

  // ─── Look-specific intent methods ────────────────────────────────────
  // Look is a single-page 4:5 collage. These methods encode the collage
  // mental model (cutouts, product tags, asset swap, auto arrangement)
  // and are no-ops for Poster documents. They always target page 0.

  const addLookCutout = useCallback((params: {
    mediaUri: string;
    sourceLayerId?: string;
    contentFit?: 'cover' | 'contain' | 'fill';
  }) => {
    if (document.type !== 'look') return;
    const page0 = document.pages[0];
    const maxZ = page0 ? page0.layers.reduce((max, l) => Math.max(max, l.zIndex), 0) : 0;
    const layer: CreatorLayer = {
      id: createStableId('media'),
      type: 'media',
      x: 0.5,
      y: 0.5,
      width: 0.4,
      height: 0.4,
      scale: 1,
      rotation: 0,
      zIndex: maxZ + 1,
      locked: false,
      hidden: false,
      opacity: 1,
      payload: {
        mediaUri: params.mediaUri,
        mediaType: 'image',
        contentFit: params.contentFit ?? 'contain',
        opacity: 1,
      },
    };
    addLayer(layer);
    CreatorAnalytics.layerAdd('look', 'media');
  }, [document.type, document.pages, addLayer]);

  const addLookProduct = useCallback((params: {
    listingId: string;
    snapshotTitle: string;
    snapshotImageUrl?: string;
    snapshotPriceGbp?: number;
    x?: number;
    y?: number;
  }) => {
    if (document.type !== 'look') return;
    const page0 = document.pages[0];
    const maxZ = page0 ? page0.layers.reduce((max, l) => Math.max(max, l.zIndex), 0) : 0;
    const layer: CreatorLayer = {
      id: createStableId('product'),
      type: 'product',
      x: params.x ?? 0.5,
      y: params.y ?? 0.5,
      width: 0.08,
      height: 0.08,
      scale: 1,
      rotation: 0,
      zIndex: maxZ + 1,
      locked: false,
      hidden: false,
      opacity: 1,
      payload: {
        listingId: params.listingId,
        snapshotTitle: params.snapshotTitle,
        snapshotImageUrl: params.snapshotImageUrl,
        snapshotPriceGbp: params.snapshotPriceGbp,
        availability: 'active',
        hotspotLabel: params.snapshotTitle,
      },
    };
    addLayer(layer);
    CreatorAnalytics.layerAdd('look', 'product');
  }, [document.type, document.pages, addLayer]);

  const swapLookAsset = useCallback((layerId: string, replacement: {
    mediaUri: string;
    mediaType?: 'image' | 'video';
    contentFit?: 'cover' | 'contain' | 'fill';
  }) => {
    if (document.type !== 'look') return;
    const page0 = document.pages[0];
    const layer = page0?.layers.find((l) => l.id === layerId);
    if (!layer || layer.type !== 'media') return;
    updateLayer(layerId, {
      type: 'media',
      payload: {
        ...layer.payload,
        mediaUri: replacement.mediaUri,
        mediaType: replacement.mediaType ?? layer.payload.mediaType,
        contentFit: replacement.contentFit ?? layer.payload.contentFit,
      },
    }, 'Swap asset');
  }, [document.type, document.pages, updateLayer]);

  const autoArrangeLook = useCallback((layout: 'hero' | 'pair' | 'dominant' | 'collage' = 'collage') => {
    if (document.type !== 'look') return;
    setDocumentState((prev) => {
      const page0 = prev.pages[0];
      if (!page0) return prev;
      const mediaLayers = page0.layers.filter((l) => l.type === 'media' && !l.hidden);
      const otherLayers = page0.layers.filter((l) => l.type !== 'media');
      if (mediaLayers.length === 0) return prev;

      let arranged: CreatorLayer[];
      const n = mediaLayers.length;

      if (layout === 'hero' || n === 1) {
        // 1 → hero composition
        arranged = [{
          ...mediaLayers[0],
          x: 0.5, y: 0.5, width: 0.9, height: 0.9, scale: 1, rotation: 0,
        }];
      } else if (layout === 'pair' || n === 2) {
        // 2 → balanced editorial pairing
        arranged = [
          { ...mediaLayers[0], x: 0.27, y: 0.5, width: 0.44, height: 0.8, scale: 1, rotation: 0 },
          { ...mediaLayers[1], x: 0.73, y: 0.5, width: 0.44, height: 0.8, scale: 1, rotation: 0 },
        ];
      } else if (layout === 'dominant' || n === 3) {
        // 3 → dominant + two supporting
        arranged = [
          { ...mediaLayers[0], x: 0.5, y: 0.42, width: 0.7, height: 0.7, scale: 1, rotation: 0 },
          { ...mediaLayers[1], x: 0.22, y: 0.82, width: 0.3, height: 0.3, scale: 1, rotation: 0 },
          { ...mediaLayers[2], x: 0.78, y: 0.82, width: 0.3, height: 0.3, scale: 1, rotation: 0 },
        ];
      } else {
        // 4+ → scattered collage with collision avoidance
        // Distribute around the canvas with slight overlap but no full overlap
        arranged = mediaLayers.map((layer, i) => {
          const angle = (i / n) * Math.PI * 2;
          const radius = 0.28;
          const cx = 0.5 + Math.cos(angle) * radius;
          const cy = 0.5 + Math.sin(angle) * radius;
          const size = 0.34;
          return {
            ...layer,
            x: Math.max(0.18, Math.min(0.82, cx)),
            y: Math.max(0.18, Math.min(0.82, cy)),
            width: size,
            height: size,
            scale: 1,
            rotation: (i % 2 === 0 ? 1 : -1) * 4,
          };
        });
      }

      // Reassign zIndex in order
      const allLayers = [...arranged, ...otherLayers].map((l, i) => ({ ...l, zIndex: i }));
      const newPages = [...prev.pages];
      newPages[0] = { ...page0, layers: allLayers };
      const doc = { ...prev, pages: newPages, updatedAt: new Date().toISOString() };
      historyRef.current.push(doc, 'Auto-arrange look');
      setIsDirty(true);
      syncHistoryButtons();
      return doc;
    });
    haptics.selection();
  }, [document.type, syncHistoryButtons]);

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
      // Default clip duration: 5s for images, actual duration for video.
      const IMAGE_CLIP_DURATION_MS = 5000;
      let cumulativeMs = 0;

      const layers: CreatorLayer[] = clips.map((clip, i) => {
        const durationMs = clip.kind === 'video'
          ? (clip.durationMs ?? IMAGE_CLIP_DURATION_MS)
          : IMAGE_CLIP_DURATION_MS;
        const startMs = cumulativeMs;
        const endMs = cumulativeMs + durationMs;
        cumulativeMs = endMs;

        return {
          id: createStableId('media'),
          type: 'media' as const,
          x: 0.5,
          y: 0.5,
          width: 1,
          height: 1,
          scale: 1,
          rotation: 0,
          zIndex: i,
          locked: false,
          hidden: false,
          opacity: 1,
          timeRange: { startMs, endMs },
          payload: {
            mediaUri: clip.uri,
            mediaType: clip.kind,
            contentFit: 'cover' as const,
            videoDurationMs: clip.kind === 'video' ? clip.durationMs : undefined,
            opacity: 1,
            // Preserve speed metadata for video clips
            ...(clip.speed ? { speed: clip.speed } : {}),
            // Preserve camera effect as a filter node
            ...(clip.cameraEffect ? {
              effects: [{ type: 'filter' as const, id: clip.cameraEffect, amount: 1 }],
            } : {}),
          },
        };
      });

      const doc: CreatorDocument = {
        id: makeStableId('doc'),
        type: 'poster',
        version: 1,
        canvas: {
          aspectRatio: POSTER_DEFAULT_ASPECT_RATIO,
          background: { type: 'color', value: '#1a1a1a' },
        },
        pages: [{
          id: 'page_1',
          durationMs: cumulativeMs,
          layers,
        }],
        metadata: {
          caption: '',
          title: '',
          visibility: 'public',
          allowReplies: true,
          allowReactions: true,
          expiresInHours: 24,
          allowRemix: false,
        },
        updatedAt: new Date().toISOString(),
      };

      // Set the new document as the current composition
      setDocument(doc);
      haptics.selection();
      return doc;
    },
    [setDocument],
  );

  // Autosave
  useEffect(() => {
    if (!isDirty) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    setAutosaveStatus('saving');
    autosaveTimerRef.current = setTimeout(async () => {
      const current = historyRef.current.current();
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
              if (!projectIdRef.current) {
                const pkg = await store.createProject(current.type);
                projectIdRef.current = pkg.projectId;
              }
              const projectPkg: ProjectPackage = {
                projectId: projectIdRef.current!,
                version: PROJECT_SCHEMA_VERSION,
                name: current.metadata.title || 'Untitled',
                composition: current,
                assets: {},
                createdAt: Date.now(),
                updatedAt: Date.now(),
              };
              await store.saveProject(projectPkg);
              if (journal) {
                await journal.checkpoint();
              }
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
  }, [document, isDirty]);

  const value: CreatorContextValue = {
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
    updateCanvas,
    addPage,
    duplicatePage,
    removePage,
    reorderPages,
    updatePageDuration,
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
  };

  return <CreatorContext.Provider value={value}>{children}</CreatorContext.Provider>;
}

export function useCreator(): CreatorContextValue {
  const ctx = useContext(CreatorContext);
  if (!ctx) throw new Error('useCreator must be used within CreatorProvider');
  return ctx;
}
