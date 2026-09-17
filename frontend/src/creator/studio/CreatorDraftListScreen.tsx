import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  RefreshControl,
  ScrollView } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, RootStackParamList } from '../../navigation/types';
import {
  useSharedValue,
  withTiming,
  withSpring } from 'react-native-reanimated';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { IconGrammar } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { CreatorDraftService, type DraftMeta, type Folder } from '../core/projectStore/drafts';
import { createStableId, makeStableId } from '../../utils/createStableId';
import { useHaptic } from '../../hooks/useHaptic';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { Motion } from '../../theme/motionTokens';
import type { CreatorDocument } from '../core/projectStore/composition';
import { CreatorFolderOrganizeSheet } from '../surfaces/CreatorFolderOrganizeSheet';
import {
  useProjectFolderStore,
  getFolderProjectCount } from '../core/projectStore/ProjectFolderStore';
import { createStyles } from './draftList/draftListStyles';
import { DraftListSkeleton } from './draftList/DraftListSkeleton';
import { FilterTab } from './draftList/FilterTab';
import { DraftCard } from './draftList/DraftCard';
import { EmptyDraftsState } from './draftList/EmptyDraftsState';
import { UndoToast, DeleteConfirmSheet } from './draftList/DraftListOverlays';

type FolderFilter = 'all' | 'unfiled' | { folderId: string };
type SortBy = 'recent' | 'name' | 'type';

const SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: 'recent', label: 'Recent' },
  { key: 'name', label: 'Name' },
  { key: 'type', label: 'Type' },
];

export function CreatorDraftListScreen() {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { spring } = useMotionConfig();
  const reduceMotion = useReducedMotion();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [drafts, setDrafts] = useState<DraftMeta[]>([]);
  const [draftDocs, setDraftDocs] = useState<Record<string, CreatorDocument | null>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('recent');
  const [undoDraft, setUndoDraft] = useState<{ meta: DraftMeta; doc: CreatorDocument | null } | null>(null);
  const [deleteConfirmDraft, setDeleteConfirmDraft] = useState<DraftMeta | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderFilter, setFolderFilter] = useState<FolderFilter>('all');
  const [organizeVisible, setOrganizeVisible] = useState(false);

  // ── ProjectFolderStore integration (Meta Edits August 2026) ────────
  // The Zustand store is the reactive source of truth for folders. We
  // sync service-loaded folders into the store on load, and use the
  // store's folder list to compute project counts for the filter chips.
  const storeFolders = useProjectFolderStore((s) => s.folders);
  const storeCreateFolder = useProjectFolderStore((s) => s.createFolder);

  const toastTranslateY = useSharedValue(100);
  const toastOpacity = useSharedValue(0);

  const showToast = useCallback(() => {
    toastTranslateY.value = withSpring(0, spring.entrance);
    toastOpacity.value = withTiming(1, { duration: Motion.duration.normal, easing: Motion.easing.entrance });
  }, [toastTranslateY, toastOpacity, spring.entrance]);

  const hideToast = useCallback(() => {
    toastTranslateY.value = withTiming(100, { duration: Motion.duration.normal, easing: Motion.easing.exit });
    toastOpacity.value = withTiming(0, { duration: Motion.duration.normal });
  }, [toastTranslateY, toastOpacity]);

  const loadDrafts = useCallback(async () => {
    // Verify local thumbnail URIs still exist before rendering the list.
    // Stale local URIs (OS cleaned up temp files) are cleared so the list
    // shows a graceful fallback instead of a broken image.
    await CreatorDraftService.verifyAndPruneThumbnails();
    const items = await CreatorDraftService.listDrafts();
    setDrafts(items);
    const docs: Record<string, CreatorDocument | null> = {};
    await Promise.all(items.map(async (item) => {
      docs[item.id] = await CreatorDraftService.loadDraft(item.id);
    }));
    setDraftDocs(docs);
    const loadedFolders = await CreatorDraftService.getFolders();
    setFolders(loadedFolders);
    // Sync service folders into the ProjectFolderStore so the store is
    // the reactive source of truth. We only create store entries for
    // service folders that don't already exist in the store (by name,
    // since IDs may differ between the two systems).
    for (const sf of loadedFolders) {
      const exists = storeFolders.some((pf) => pf.id === sf.id || pf.name === sf.name);
      if (!exists) {
        storeCreateFolder(sf.name);
      }
    }
    setLoading(false);
    setRefreshing(false);
  }, [storeFolders, storeCreateFolder]);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  // Haptic: light on screen appear
  useEffect(() => {
    haptic.light();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

  const sortedDrafts = useMemo(() => {
    const copy = [...drafts];
    if (sortBy === 'recent') {
      copy.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } else if (sortBy === 'name') {
      copy.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === 'type') {
      copy.sort((a, b) => {
        if (a.type === b.type) {
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        }
        return a.type.localeCompare(b.type);
      });
    }
    return copy;
  }, [drafts, sortBy]);

  const filteredDrafts = useMemo(() => {
    if (folderFilter === 'all') return sortedDrafts;
    if (folderFilter === 'unfiled') {
      return sortedDrafts.filter((d) => !d.folderId);
    }
    return sortedDrafts.filter((d) => d.folderId === folderFilter.folderId);
  }, [sortedDrafts, folderFilter]);

  const handleOpenOrganize = useCallback(() => {
    haptic.light();
    setOrganizeVisible(true);
  }, [haptic]);

  const handleCloseOrganize = useCallback(() => {
    haptic.light();
    setOrganizeVisible(false);
  }, [haptic]);

  const handleFolderFilterPress = useCallback(
    (filter: FolderFilter) => {
      haptic.selection();
      setFolderFilter(filter);
    },
    [haptic],
  );

  const handleOpenDraft = useCallback((draft: DraftMeta) => {
    haptic.light();
    navigation.navigate('CreatorStudio', {
      type: draft.type,
      draftId: draft.id });
  }, [navigation, haptic]);

  const handleDeleteDraft = useCallback((draft: DraftMeta) => {
    haptic.selection();
    setDeleteConfirmDraft(draft);
  }, [haptic]);

  const handleConfirmDelete = useCallback(async () => {
    const draft = deleteConfirmDraft;
    if (!draft) return;
    setDeleteConfirmDraft(null);
    haptic.success();
    const doc = draftDocs[draft.id] ?? null;
    setUndoDraft({ meta: draft, doc });
    setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
    await CreatorDraftService.deleteDraft(draft.id);
    showToast();
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
    }
    undoTimerRef.current = setTimeout(() => {
      hideToast();
      setUndoDraft(null);
    }, 5000);
  }, [deleteConfirmDraft, draftDocs, haptic, showToast, hideToast]);

  const handleCancelDelete = useCallback(() => {
    haptic.light();
    setDeleteConfirmDraft(null);
  }, [haptic]);

  const handleSwipeDelete = useCallback(async (draft: DraftMeta) => {
    haptic.warning();
    const doc = draftDocs[draft.id] ?? null;
    setUndoDraft({ meta: draft, doc });
    setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
    await CreatorDraftService.deleteDraft(draft.id);
    showToast();
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
    }
    undoTimerRef.current = setTimeout(() => {
      hideToast();
      setUndoDraft(null);
    }, 5000);
  }, [haptic, draftDocs, showToast, hideToast]);

  const handleUndoDelete = useCallback(async () => {
    if (!undoDraft) return;
    haptic.light();
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
    }
    if (undoDraft.doc) {
      await CreatorDraftService.saveDraft(undoDraft.doc);
    }
    setDrafts((prev) => {
      const restored = [...prev, undoDraft.meta];
      restored.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      return restored;
    });
    setUndoDraft(null);
    hideToast();
    loadDrafts();
  }, [undoDraft, haptic, hideToast, loadDrafts]);

  const handleDuplicateDraft = useCallback(async (draft: DraftMeta) => {
    const doc = await CreatorDraftService.loadDraft(draft.id);
    if (!doc) return;
    const newId = createStableId('doc');
    const duplicatedDoc = {
      ...doc,
      id: newId,
      metadata: {
        ...doc.metadata,
        title: `${draft.title} (copy)` },
      pages: doc.pages.map((p) => ({
        ...p,
        id: makeStableId('page'),
        layers: p.layers.map((l) => ({
          ...l,
          id: `${l.id}_dup_${createStableId()}` })) })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString() };
    await CreatorDraftService.saveDraft(duplicatedDoc);
    loadDrafts();
  }, [loadDrafts]);

  const handleStartCreating = useCallback(() => {
    navigation.navigate('CreatorStudio', { type: 'look' });
  }, [navigation]);

  const renderItem = useCallback(({ item, index }: { item: DraftMeta; index: number }) => {
    const doc = draftDocs[item.id];
    const thumbW = 48;
    const thumbH = 48;
    const finalThumbW = thumbW;
    const finalThumbH = thumbH;
    return (
      <DraftCard
        item={item}
        doc={doc}
        index={index}
        finalThumbW={finalThumbW}
        finalThumbH={finalThumbH}
        colors={colors}
        styles={styles}
        reduceMotion={reduceMotion}
        onPress={() => handleOpenDraft(item)}
        onDuplicate={() => handleDuplicateDraft(item)}
        onDelete={() => handleDeleteDraft(item)}
        onSwipeDelete={() => handleSwipeDelete(item)}
      />
    );
  }, [handleOpenDraft, handleDeleteDraft, handleSwipeDelete, handleDuplicateDraft, draftDocs, styles, colors, reduceMotion]);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            accessibilityLabel="Back"
            accessibilityHint="Returns to the previous screen"
            accessibilityRole="button"
          >
            <Ionicons name="chevron-back" size={IconGrammar.standard} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Drafts</Text>
          <View style={styles.organizeBtn} />
        </View>
        <DraftListSkeleton />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityLabel="Back"
          accessibilityHint="Returns to the previous screen"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={IconGrammar.standard} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Drafts</Text>
        <Pressable
          onPress={handleOpenOrganize}
          style={({ pressed }) => [styles.organizeBtn, pressed && { opacity: 0.6 }]}
          accessibilityLabel="Organize folders"
          accessibilityHint="Opens the folder organizer"
          accessibilityRole="button"
          hitSlop={8}
        >
          <Ionicons name="folder-open-outline" size={IconGrammar.standard} color={colors.textPrimary} />
        </Pressable>
      </View>

      {/* Folder filter tabs — with project counts from ProjectFolderStore */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.folderTabBar}
      >
        <FilterTab
          label={`All Projects (${drafts.length})`}
          isActive={folderFilter === 'all'}
          onPress={() => handleFolderFilterPress('all')}
          colors={colors}
          accessibilityLabel="Show all projects"
          accessibilityHint="Filters the list to all projects"
        />
        <FilterTab
          label={`Unfiled (${getFolderProjectCount(storeFolders, null, drafts.length)})`}
          isActive={folderFilter === 'unfiled'}
          onPress={() => handleFolderFilterPress('unfiled')}
          colors={colors}
          accessibilityLabel="Show unfiled drafts"
          accessibilityHint="Filters the list to unfiled drafts"
        />
        {folders.map((folder) => {
          const isActive =
            typeof folderFilter !== 'string' && folderFilter.folderId === folder.id;
          // Use ProjectFolderStore count when available, fall back to
          // counting drafts with matching folderId.
          const storeFolder = storeFolders.find((pf) => pf.id === folder.id || pf.name === folder.name);
          const count = storeFolder
            ? getFolderProjectCount(storeFolders, storeFolder.id, drafts.length)
            : drafts.filter((d) => d.folderId === folder.id).length;
          return (
            <FilterTab
              key={folder.id}
              label={`${folder.name} (${count})`}
              isActive={isActive}
              onPress={() => handleFolderFilterPress({ folderId: folder.id })}
              colors={colors}
              icon={isActive ? 'folder' : 'folder-outline'}
              accessibilityLabel={`Filter by folder ${folder.name}, ${count} projects`}
              accessibilityHint="Filters the list to this folder"
            />
          );
        })}
      </ScrollView>

      {/* Sort tabs */}
      <View style={styles.sortBar}>
        {SORT_OPTIONS.map((opt) => (
          <FilterTab
            key={opt.key}
            label={opt.label}
            isActive={sortBy === opt.key}
            onPress={() => setSortBy(opt.key)}
            colors={colors}
            accessibilityLabel={`Sort by ${opt.label}`}
            accessibilityHint="Sorts the draft list"
          />
        ))}
      </View>

      <FlashList
        data={filteredDrafts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadDrafts(); }} />
        }
        ListEmptyComponent={
          <EmptyDraftsState
            styles={styles}
            reduceMotion={reduceMotion}
            onCreate={handleStartCreating}
          />
        }
      />

      <UndoToast
        visible={!!undoDraft}
        title={undoDraft?.meta.title ?? ''}
        colors={colors}
        toastTranslateY={toastTranslateY}
        toastOpacity={toastOpacity}
        onUndo={handleUndoDelete}
        onDismiss={hideToast}
      />

      <DeleteConfirmSheet
        draft={deleteConfirmDraft}
        colors={colors}
        reduceMotion={reduceMotion}
        onCancel={handleCancelDelete}
        onConfirm={handleConfirmDelete}
      />

      <CreatorFolderOrganizeSheet
        visible={organizeVisible}
        onClose={handleCloseOrganize}
        drafts={drafts}
        folders={folders}
        onFoldersChanged={loadDrafts}
        onDraftsChanged={loadDrafts}
      />
    </View>
  );
}
