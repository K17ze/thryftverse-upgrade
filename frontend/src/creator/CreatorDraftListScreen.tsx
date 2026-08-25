import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  RefreshControl,
  ScrollView,
  type DimensionValue,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  runOnJS,
  Easing,
  interpolate,
  Extrapolation,
  useReducedMotion,
  type SharedValue,
} from 'react-native-reanimated';
import { Space, Radius, Type, Typography, Control, Stroke, IconGrammar } from '../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { CreatorDraftService, type DraftMeta, type Folder } from './drafts';
import { createStableId, makeStableId } from '../utils/createStableId';
import { formatRelativeTime } from '../utils/dateFormat';
import { CreatorCanvas } from './CreatorCanvas';
import { SwipeableRow } from '../components/SwipeableRow';
import { PressScale } from './CreatorAnimations';
import { useHaptic } from '../hooks/useHaptic';
import { useMotionConfig } from '../hooks/useMotionConfig';
import { Motion } from '../theme/motionTokens';
import type { CreatorDocument } from './composition';
import { CreatorFolderOrganizeSheet } from './CreatorFolderOrganizeSheet';
import {
  useProjectFolderStore,
  getFolderProjectCount,
} from './core/projectStore/ProjectFolderStore';

type FolderFilter = 'all' | 'unfiled' | { folderId: string };
type SortBy = 'recent' | 'name' | 'type';

// ── SkeletonBlock — one-time shimmer sweep (AGENTS.md §14, §17) ──────
// A single shimmering placeholder block. The sweep runs once (0→1)
// then holds — no continuous pulse. Uses colors.surfaceAlt.
function SkeletonBlock({ width, height, radius }: { width: DimensionValue; height: number; radius?: number }) {
  const { colors } = useAppTheme();
  const reduceMotion = useReducedMotion();
  const shimmerSV = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    shimmerSV.value = 0;
    shimmerSV.value = withTiming(1, { duration: Motion.duration.crawl });
  }, [reduceMotion, shimmerSV]);

  const style = useAnimatedStyle(() => ({
    backgroundColor: colors.surfaceAlt,
    opacity: 0.5 + 0.3 * shimmerSV.value,
  }));

  return (
    <Reanimated.View style={[{ width, height, borderRadius: radius ?? Radius.sm }, style]} />
  );
}

// ── DraftListSkeleton — matches draft row layout (thumbnail + 2 text lines) ──
function DraftListSkeleton() {
  return (
    <View style={{ flex: 1, backgroundColor: undefined }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: Space.md,
            padding: Space.md,
            borderBottomWidth: Stroke.hairline,
            borderBottomColor: 'transparent',
          }}
        >
          {/* Thumbnail rectangle */}
          <SkeletonBlock width={100} height={100} radius={Radius.lg} />
          {/* Two text lines */}
          <View style={{ flex: 1, gap: Space.xs }}>
            <SkeletonBlock width={'60%'} height={Type.bodyStrong.size + 4} radius={Radius.sm} />
            <SkeletonBlock width={'40%'} height={Type.caption.size + 2} radius={Radius.sm} />
          </View>
          {/* Action icons placeholder */}
          <View style={{ flexDirection: 'row', gap: Space.xs }}>
            <SkeletonBlock width={Control.hit} height={Control.hit} radius={Radius.sm} />
            <SkeletonBlock width={Control.hit} height={Control.hit} radius={Radius.sm} />
          </View>
        </View>
      ))}
    </View>
  );
}

const SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: 'recent', label: 'Recent' },
  { key: 'name', label: 'Name' },
  { key: 'type', label: 'Type' },
];

// ── Underline filter tab ────────────────────────────────────────────
// Replaces pill-background chips/pills with text-only tabs + 2pt spring-
// animated underline indicator (brand color, Stroke.emphasis).
interface FilterTabProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
  colors: ThemeColors;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  accessibilityLabel: string;
}

function FilterTab({ label, isActive, onPress, colors, icon, accessibilityLabel }: FilterTabProps) {
  const underlineOpacity = useSharedValue(isActive ? 1 : 0);

  useEffect(() => {
    underlineOpacity.value = withSpring(isActive ? 1 : 0, Motion.spring.indicator);
  }, [isActive, underlineOpacity]);

  const underlineStyle = useAnimatedStyle(() => ({
    opacity: underlineOpacity.value,
  }));

  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={({ pressed }) => [
        {
          paddingHorizontal: Space.md,
          paddingVertical: Space.sm,
          alignItems: 'center',
          marginRight: Space.xs,
        },
        pressed && { opacity: 0.7 },
      ]}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Space.xxs }}>
        {icon && (
          <Ionicons
            name={icon}
            size={IconGrammar.metadata}
            color={isActive ? colors.textPrimary : colors.textSecondary}
          />
        )}
        <Text
          style={{
            fontFamily: Typography.family.semibold,
            fontSize: Type.body.size,
            color: isActive ? colors.textPrimary : colors.textSecondary,
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
      <Reanimated.View
        style={[
          {
            height: Stroke.emphasis,
            backgroundColor: colors.brand,
            width: '100%',
            marginTop: Space.xxs,
          },
          underlineStyle,
        ]}
      />
    </Pressable>
  );
}

export function CreatorDraftListScreen() {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { spring } = useMotionConfig();
  const reduceMotion = useReducedMotion();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<any>();
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
    toastOpacity.value = withTiming(1, { duration: Motion.duration.normal, easing: Easing.out(Easing.ease) });
  }, [toastTranslateY, toastOpacity, spring.entrance]);

  const hideToast = useCallback(() => {
    toastTranslateY.value = withTiming(100, { duration: Motion.duration.normal, easing: Easing.in(Easing.ease) });
    toastOpacity.value = withTiming(0, { duration: Motion.duration.normal });
  }, [toastTranslateY, toastOpacity]);

  const loadDrafts = useCallback(async () => {
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
      draftId: draft.id,
    });
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
        title: `${draft.title} (copy)`,
      },
      pages: doc.pages.map((p) => ({
        ...p,
        id: makeStableId('page'),
        layers: p.layers.map((l) => ({
          ...l,
          id: `${l.id}_dup_${createStableId()}`,
        })),
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await CreatorDraftService.saveDraft(duplicatedDoc);
    loadDrafts();
  }, [loadDrafts]);

  const handleStartCreating = useCallback(() => {
    navigation.navigate('CreatorStudio', { type: 'look' });
  }, [navigation]);

  const renderItem = useCallback(({ item, index }: { item: DraftMeta; index: number }) => {
    const doc = draftDocs[item.id];
    const thumbW = 120;
    const thumbH = doc ? Math.floor(thumbW / doc.canvas.aspectRatio) : 120;
    const isPortrait = thumbH > thumbW;
    const finalThumbW = isPortrait ? 100 : thumbW;
    const finalThumbH = isPortrait ? Math.min(140, Math.floor(finalThumbW / (doc?.canvas.aspectRatio ?? 0.8))) : thumbH;
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
        springCfg={spring.entrance}
        onPress={() => handleOpenDraft(item)}
        onDuplicate={() => handleDuplicateDraft(item)}
        onDelete={() => handleDeleteDraft(item)}
        onSwipeDelete={() => handleSwipeDelete(item)}
      />
    );
  }, [handleOpenDraft, handleDeleteDraft, handleSwipeDelete, handleDuplicateDraft, draftDocs, styles, colors, reduceMotion, spring.entrance]);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            accessibilityLabel="Back"
            accessibilityRole="button"
          >
            <Ionicons name="chevron-back" size={IconGrammar.hero} color={colors.textPrimary} />
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
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={IconGrammar.hero} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Drafts</Text>
        <Pressable
          onPress={handleOpenOrganize}
          style={({ pressed }) => [styles.organizeBtn, pressed && { opacity: 0.6 }]}
          accessibilityLabel="Organize folders"
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
        />
        <FilterTab
          label={`Unfiled (${getFolderProjectCount(storeFolders, null, drafts.length)})`}
          isActive={folderFilter === 'unfiled'}
          onPress={() => handleFolderFilterPress('unfiled')}
          colors={colors}
          accessibilityLabel="Show unfiled drafts"
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
            colors={colors}
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

interface UndoToastProps {
  visible: boolean;
  title: string;
  colors: ThemeColors;
  toastTranslateY: SharedValue<number>;
  toastOpacity: SharedValue<number>;
  onUndo: () => void;
  onDismiss: () => void;
}

function UndoToast({
  visible,
  title,
  colors,
  toastTranslateY,
  toastOpacity,
  onUndo,
  onDismiss,
}: UndoToastProps) {
  const toastStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: toastTranslateY.value }],
    opacity: toastOpacity.value,
  }));

  if (!visible) return null;

  return (
    <Reanimated.View
      style={[
        {
          position: 'absolute',
          bottom: Space.lg,
          left: Space.md,
          right: Space.md,
          backgroundColor: colors.surfaceElevated,
          borderRadius: Radius.lg,
          paddingHorizontal: Space.md,
          paddingVertical: Space.md,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: Space.sm,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.18,
          shadowRadius: 12,
          elevation: 8,
        },
        toastStyle,
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            fontFamily: Typography.family.medium,
            fontSize: Type.body.size,
            color: colors.textPrimary,
          }}
          numberOfLines={1}
        >
          Draft deleted
        </Text>
        <Text
          style={{
            fontFamily: Typography.family.regular,
            fontSize: Type.caption.size,
            color: colors.textSecondary,
          }}
          numberOfLines={1}
        >
          {title}
        </Text>
      </View>
      <Pressable
        onPress={onUndo}
        style={({ pressed }) => [
          {
            paddingHorizontal: Space.md,
            paddingVertical: Space.sm,
            minHeight: 50,
            justifyContent: 'center',
            borderRadius: Radius.lg,
            backgroundColor: pressed ? colors.brandPressed : colors.brand,
          },
        ]}
        accessibilityLabel="Undo delete"
        accessibilityRole="button"
      >
        <Text
          style={{
            fontFamily: Typography.family.semibold,
            fontSize: Type.bodyStrong.size,
            color: colors.textInverse,
          }}
        >
          Undo
        </Text>
      </Pressable>
      <Pressable
        onPress={onDismiss}
        style={{ width: 32, height: 32, justifyContent: 'center', alignItems: 'center' }}
        accessibilityLabel="Dismiss"
        accessibilityRole="button"
        hitSlop={8}
      >
        <Ionicons name="close" size={IconGrammar.metadata} color={colors.textSecondary} />
      </Pressable>
    </Reanimated.View>
  );
}

// ── DraftCard with stagger entrance and spring thumbnail ───────────
interface DraftCardProps {
  item: DraftMeta;
  doc: CreatorDocument | null | undefined;
  index: number;
  finalThumbW: number;
  finalThumbH: number;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  reduceMotion: boolean;
  springCfg: { damping: number; stiffness: number; mass: number };
  onPress: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSwipeDelete: () => void;
}

function DraftCard({
  item,
  doc,
  index,
  finalThumbW,
  finalThumbH,
  colors,
  styles,
  reduceMotion,
  springCfg,
  onPress,
  onDuplicate,
  onDelete,
  onSwipeDelete,
}: DraftCardProps) {
  // Thumbnail press spring scale
  const thumbScale = useSharedValue(1);
  const thumbAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: thumbScale.value }],
  }));

  // Refined stagger entrance — opacity only (no scale), 30ms delay per
  // card, 200ms duration. Respects reduceMotion (opacity = 1 immediately).
  const entranceOpacity = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) {
      entranceOpacity.value = 1;
    } else {
      entranceOpacity.value = withDelay(index * 30, withTiming(1, { duration: 200 }));
    }
  }, [reduceMotion, index, entranceOpacity]);
  const entranceStyle = useAnimatedStyle(() => ({
    opacity: entranceOpacity.value,
  }));

  return (
    <Reanimated.View style={entranceStyle}>
    <SwipeableRow
        accessibilityLabel={`Open draft ${item.title}`}
        accessibilityHint="Swipe left to delete"
        onPress={onPress}
        rightAction={{
          icon: 'trash-outline',
          label: 'Delete',
          onPress: onSwipeDelete,
          color: colors.danger,
        }}
        swipeThreshold={88}
      >
        <View style={styles.draftRow}>
          <Pressable
            onPress={onPress}
            onPressIn={() => { if (!reduceMotion) thumbScale.value = withSpring(0.95, Motion.spring.tap); }}
            onPressOut={() => { if (!reduceMotion) thumbScale.value = withSpring(1, Motion.spring.tap); }}
            accessibilityLabel={`Open draft ${item.title}`}
            accessibilityRole="button"
          >
            <Reanimated.View style={[thumbAnimatedStyle]}>
              {doc ? (
                <View style={[styles.draftThumb, { width: finalThumbW, height: finalThumbH }]}>
                  <CreatorCanvas
                    document={doc}
                    page={doc.pages[0]}
                    canvasWidth={finalThumbW}
                    canvasHeight={finalThumbH}
                    mode="view"
                  />
                </View>
              ) : (
                <View style={[styles.draftIcon, { width: finalThumbW, height: finalThumbH, backgroundColor: item.type === 'look' ? colors.discoverySubtle : colors.bronzeSubtle }]}>
                  <Ionicons
                    name={item.type === 'look' ? 'shirt-outline' : 'film-outline'}
                    size={IconGrammar.hero}
                    color={item.type === 'look' ? colors.discovery : colors.bronze}
                  />
                </View>
              )}
            </Reanimated.View>
          </Pressable>
          <View style={styles.draftInfo}>
            <Text style={styles.draftTitle} numberOfLines={1}>{item.title}</Text>
            <View style={styles.draftMetaRow}>
              <View style={[styles.typeDot, { backgroundColor: item.type === 'poster' ? colors.antiqueGold : '#FFFFFF' }]} />
              <Text style={styles.draftMeta} numberOfLines={1}>
                {item.type === 'look' ? 'Look' : 'Poster'} · {formatRelativeTime(item.updatedAt)}
              </Text>
            </View>
          </View>
          <View style={styles.actions}>
            <Pressable
              onPress={onDuplicate}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={`Duplicate draft ${item.title}`}
              accessibilityRole="button"
            >
              <Ionicons name="copy-outline" size={IconGrammar.metadata} color={colors.textSecondary} />
            </Pressable>
            <Pressable
              onPress={onDelete}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={`Delete draft ${item.title}`}
              accessibilityRole="button"
            >
              <Ionicons name="trash-outline" size={IconGrammar.metadata} color={colors.danger} />
            </Pressable>
          </View>
        </View>
      </SwipeableRow>
    </Reanimated.View>
  );
}

// ── Empty state — static icon with one-shot entrance fade ──────────
// Per AGENTS.md §17, continuous pulsing/breathing is prohibited on
// empty states. A restrained entrance fade replaces the old breathing
// animation for a calmer, more premium empty-state.
interface EmptyDraftsStateProps {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  reduceMotion: boolean;
  onCreate: () => void;
}

function EmptyDraftsState({ colors, styles, reduceMotion, onCreate }: EmptyDraftsStateProps) {
  const { spring } = useMotionConfig();
  const entranceSV = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (!reduceMotion) {
      entranceSV.value = withDelay(100, withSpring(1, spring.entrance));
    }
  }, [reduceMotion, spring, entranceSV]);

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: entranceSV.value,
    transform: [{ translateY: interpolate(entranceSV.value, [0, 1], [12, 0], Extrapolation.CLAMP) }],
  }));

  return (
    <View style={styles.emptyState}>
      <Reanimated.View style={entranceStyle}>
        <Text style={styles.emptyTitle}>No drafts yet</Text>
      </Reanimated.View>
      <Text style={styles.emptySubtext}>Create your first poster to see it here</Text>
      <PressScale
        onPress={onCreate}
        style={styles.emptyCta}
        accessibilityLabel="Create your first poster"
        accessibilityRole="button"
        scale={0.95}
      >
        <Text style={styles.emptyCtaText}>Create Poster</Text>
      </PressScale>
    </View>
  );
}

// ── Delete confirmation ActionSheet ────────────────────────────────
interface DeleteConfirmSheetProps {
  draft: DraftMeta | null;
  colors: ThemeColors;
  reduceMotion: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function DeleteConfirmSheet({ draft, colors, reduceMotion, onCancel, onConfirm }: DeleteConfirmSheetProps) {
  const translateY = useSharedValue(400);
  const backdropOpacity = useSharedValue(0);
  const mounted = useRef(false);

  useEffect(() => {
    if (draft) {
      mounted.current = true;
      if (reduceMotion) {
        translateY.value = 0;
        backdropOpacity.value = 1;
      } else {
        translateY.value = withSpring(0, Motion.spring.entrance);
        backdropOpacity.value = withTiming(1, { duration: Motion.duration.normal, easing: Easing.out(Easing.ease) });
      }
    } else if (mounted.current) {
      if (reduceMotion) {
        translateY.value = 400;
        backdropOpacity.value = 0;
      } else {
        translateY.value = withTiming(400, { duration: Motion.duration.normal, easing: Easing.in(Easing.ease) });
        backdropOpacity.value = withTiming(0, { duration: Motion.duration.normal });
      }
    }
  }, [draft, reduceMotion, translateY, backdropOpacity]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  if (!draft && !mounted.current) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 500 }]} pointerEvents={draft ? 'auto' : 'none'}>
      <Reanimated.View style={[StyleSheet.absoluteFill, backdropStyle, { backgroundColor: colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Cancel delete" accessibilityRole="button" />
      </Reanimated.View>
      <Reanimated.View
        style={[
          {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: colors.surface,
            borderTopLeftRadius: Radius.xl,
            borderTopRightRadius: Radius.xl,
            paddingTop: Space.xs,
            paddingBottom: Space.lg,
            paddingHorizontal: Space.md,
          },
          sheetStyle,
        ]}
      >
        <View style={{ alignItems: 'center', paddingVertical: Space.xs }}>
          <View style={{ width: 32, height: 4, borderRadius: Radius.sm, backgroundColor: colors.borderSubtle }} />
        </View>
        <Text style={{ fontFamily: Typography.family.semibold, fontSize: Type.subtitle.size, color: colors.textPrimary, marginTop: Space.sm, textAlign: 'center' }}>
          Delete this draft?
        </Text>
        <Text style={{ fontFamily: Typography.family.regular, fontSize: Type.body.size, color: colors.textSecondary, textAlign: 'center', marginTop: Space.xs, marginBottom: Space.md }}>
          &ldquo;{draft?.title ?? ''}&rdquo; will be permanently deleted.
        </Text>
        <Pressable
          onPress={onConfirm}
          style={({ pressed }) => ({
            backgroundColor: pressed ? colors.danger : colors.danger,
            opacity: pressed ? 0.85 : 1,
            paddingVertical: Space.md,
            minHeight: 50,
            justifyContent: 'center',
            borderRadius: Radius.lg,
            alignItems: 'center',
            marginBottom: Space.sm,
          })}
          accessibilityLabel="Confirm delete"
          accessibilityRole="button"
        >
          <Text style={{ fontFamily: Typography.family.semibold, fontSize: Type.bodyStrong.size, color: colors.textInverse }}>
            Delete
          </Text>
        </Pressable>
        <Pressable
          onPress={onCancel}
          style={({ pressed }) => ({
            backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
            paddingVertical: Space.md,
            minHeight: 50,
            justifyContent: 'center',
            borderRadius: Radius.lg,
            alignItems: 'center',
          })}
          accessibilityLabel="Cancel"
          accessibilityRole="button"
        >
          <Text style={{ fontFamily: Typography.family.semibold, fontSize: Type.body.size, color: colors.textSecondary }}>
            Cancel
          </Text>
        </Pressable>
      </Reanimated.View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: Control.hit,
    height: Control.hit,
    justifyContent: 'center',
    alignItems: 'center',
  },
  organizeBtn: {
    width: Control.hit,
    height: Control.hit,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.title.size,
    color: colors.textPrimary,
  },
  // ── Folder tab bar ──
  folderTabBar: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
  },
  // ── Sort bar ──
  sortBar: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
  },
  listContent: {
    padding: Space.md,
  },
  // ── Draft row ──
  draftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    padding: Space.md,
    borderBottomWidth: Stroke.hairline,
    borderBottomColor: colors.borderSubtle,
  },
  draftRowPressed: {
    opacity: 0.85,
  },
  draftThumb: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  draftIcon: {
    borderRadius: Radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  draftInfo: {
    flex: 1,
    gap: Space.xxs,
  },
  draftTitle: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyStrong.size,
    color: colors.textPrimary,
  },
  draftMeta: {
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    color: colors.textSecondary,
  },
  draftMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xxs,
  },
  typeDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
  },
  actions: {
    flexDirection: 'row',
    gap: Space.xs,
  },
  actionBtn: {
    width: Control.hit,
    height: Control.hit,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  actionBtnPressed: {
    opacity: 0.6,
  },
  // ── Empty state ──
  emptyState: {
    alignItems: 'center',
    paddingVertical: Space.xl * 2,
    gap: Space.sm,
  },
  emptyTitle: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.subtitle.size,
    color: colors.textPrimary,
  },
  emptySubtext: {
    fontFamily: Typography.family.regular,
    fontSize: Type.body.size,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyCta: {
    backgroundColor: colors.brand,
    borderRadius: Radius.lg,
    paddingHorizontal: Space.lg,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.md,
    marginTop: Space.sm,
  },
  emptyCtaText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyStrong.size,
    color: colors.textInverse,
  },
  });
}