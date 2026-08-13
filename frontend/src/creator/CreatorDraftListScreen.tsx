import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
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
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { CreatorDraftService, type DraftMeta } from './drafts';
import { createStableId } from '../utils/createStableId';
import { CreatorCanvas } from './CreatorCanvas';
import { SwipeableRow } from '../components/SwipeableRow';
import { PressScale } from './CreatorAnimations';
import { useHaptic } from '../hooks/useHaptic';
import { useMotionConfig } from '../hooks/useMotionConfig';
import { Motion } from '../theme/motionTokens';
import type { CreatorDocument } from './composition';

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
  const navigation = useNavigation<any>();
  const [drafts, setDrafts] = useState<DraftMeta[]>([]);
  const [draftDocs, setDraftDocs] = useState<Record<string, CreatorDocument | null>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('recent');
  const [undoDraft, setUndoDraft] = useState<{ meta: DraftMeta; doc: CreatorDocument | null } | null>(null);
  const [deleteConfirmDraft, setDeleteConfirmDraft] = useState<DraftMeta | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toastTranslateY = useSharedValue(100);
  const toastOpacity = useSharedValue(0);

  const showToast = useCallback(() => {
    toastTranslateY.value = withSpring(0, spring.entrance);
    toastOpacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.ease) });
  }, [toastTranslateY, toastOpacity, spring.entrance]);

  const hideToast = useCallback(() => {
    toastTranslateY.value = withTiming(100, { duration: 180, easing: Easing.in(Easing.ease) });
    toastOpacity.value = withTiming(0, { duration: 180 });
  }, [toastTranslateY, toastOpacity]);

  const loadDrafts = useCallback(async () => {
    const items = await CreatorDraftService.listDrafts();
    setDrafts(items);
    const docs: Record<string, CreatorDocument | null> = {};
    await Promise.all(items.map(async (item) => {
      docs[item.id] = await CreatorDraftService.loadDraft(item.id);
    }));
    setDraftDocs(docs);
    setLoading(false);
    setRefreshing(false);
  }, []);

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
        id: `page_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        layers: p.layers.map((l) => ({
          ...l,
          id: `${l.id}_dup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.brand} />
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
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Drafts</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Sort toggle pills */}
      <View style={styles.sortBar}>
        {SORT_OPTIONS.map((opt) => {
          const isActive = sortBy === opt.key;
          return (
            <Pressable
              key={opt.key}
              onPress={() => setSortBy(opt.key)}
              style={({ pressed }) => [
                styles.sortPill,
                isActive ? styles.sortPillActive : styles.sortPillInactive,
                pressed && { opacity: 0.7, transform: [{ scale: 0.96 }] },
              ]}
              accessibilityLabel={`Sort by ${opt.label}`}
              accessibilityRole="button"
            >
              <Text style={[styles.sortPillText, isActive ? styles.sortPillTextActive : styles.sortPillTextInactive]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FlashList
        data={sortedDrafts}
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
            borderRadius: Radius.md,
            backgroundColor: pressed ? colors.brandPressed : colors.brand,
          },
        ]}
        accessibilityLabel="Undo delete"
        accessibilityRole="button"
      >
        <Text
          style={{
            fontFamily: Typography.family.semibold,
            fontSize: Type.body.size,
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
        <Ionicons name="close" size={18} color={colors.textSecondary} />
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
  // Stagger entrance: 50ms delay per card
  const cardScale = useSharedValue(reduceMotion ? 1 : 0.92);
  const cardOpacity = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) return;
    const delay = Math.min(index * 50, 400);
    const timer = setTimeout(() => {
      cardScale.value = withSpring(1, springCfg);
      cardOpacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.ease) });
    }, delay);
    return () => clearTimeout(timer);
  }, [cardScale, cardOpacity, reduceMotion, springCfg, index]);

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
    opacity: cardOpacity.value,
  }));

  // Thumbnail press spring scale
  const thumbScale = useSharedValue(1);
  const thumbAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: thumbScale.value }],
  }));

  return (
    <Reanimated.View style={cardAnimatedStyle}>
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
                  {/* Title overlay on thumbnail */}
                  <View style={styles.thumbOverlay}>
                    <Text style={styles.thumbOverlayText} numberOfLines={1}>{item.title}</Text>
                  </View>
                </View>
              ) : (
                <View style={[styles.draftIcon, { width: finalThumbW, height: finalThumbH, backgroundColor: item.type === 'look' ? colors.discovery + '20' : colors.bronze + '20' }]}>
                  <Ionicons
                    name={item.type === 'look' ? 'shirt-outline' : 'film-outline'}
                    size={36}
                    color={item.type === 'look' ? colors.discovery : colors.bronze}
                  />
                  <View style={styles.thumbOverlay}>
                    <Text style={styles.thumbOverlayText} numberOfLines={1}>{item.title}</Text>
                  </View>
                </View>
              )}
            </Reanimated.View>
          </Pressable>
          <View style={styles.draftInfo}>
            <Text style={styles.draftTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.draftMeta} numberOfLines={1}>
              {item.type === 'look' ? 'Look' : 'Poster'} · {new Date(item.updatedAt).toLocaleDateString()}
            </Text>
            <View style={styles.statusRow}>
              <View style={[styles.typeBadge, item.type === 'look' ? styles.typeBadgeLook : styles.typeBadgePoster]}>
                <Text style={styles.typeBadgeText}>{item.type === 'look' ? 'Look' : 'Poster'}</Text>
              </View>
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
              <Ionicons name="copy-outline" size={18} color={colors.textSecondary} />
            </Pressable>
            <Pressable
              onPress={onDelete}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={`Delete draft ${item.title}`}
              accessibilityRole="button"
            >
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
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
        <Ionicons name="document-outline" size={56} color={colors.textMuted} />
      </Reanimated.View>
      <Text style={styles.emptyTitle}>No drafts yet</Text>
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
        backdropOpacity.value = withTiming(1, { duration: 160, easing: Easing.out(Easing.ease) });
      }
    } else if (mounted.current) {
      if (reduceMotion) {
        translateY.value = 400;
        backdropOpacity.value = 0;
      } else {
        translateY.value = withTiming(400, { duration: 180, easing: Easing.in(Easing.ease) });
        backdropOpacity.value = withTiming(0, { duration: 160 });
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
            borderRadius: Radius.lg,
            alignItems: 'center',
            marginBottom: Space.sm,
          })}
          accessibilityLabel="Confirm delete"
          accessibilityRole="button"
        >
          <Text style={{ fontFamily: Typography.family.semibold, fontSize: Type.bodyEmphasis.size, color: colors.textInverse }}>
            Delete
          </Text>
        </Pressable>
        <Pressable
          onPress={onCancel}
          style={({ pressed }) => ({
            backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
            paddingVertical: Space.md,
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
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.title.size,
    color: colors.textPrimary,
  },
  // ── Sort bar ──
  sortBar: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: Space.xs,
  },
  sortPill: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.lg,
  },
  sortPillActive: {
    backgroundColor: colors.brand,
  },
  sortPillInactive: {
    backgroundColor: colors.surfaceAlt,
  },
  sortPillText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  sortPillTextActive: {
    color: colors.textInverse,
  },
  sortPillTextInactive: {
    color: colors.textSecondary,
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
    marginBottom: Space.sm,
    borderRadius: Radius.xl,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  draftRowPressed: {
    opacity: 0.85,
  },
  draftThumb: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  thumbOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: Space.xs,
    paddingVertical: 3,
  },
  thumbOverlayText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.meta.size,
    color: '#FFFFFF',
  },
  draftIcon: {
    borderRadius: Radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  draftInfo: {
    flex: 1,
    gap: 3,
  },
  draftTitle: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyEmphasis.size,
    color: colors.textPrimary,
  },
  draftMeta: {
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    color: colors.textSecondary,
  },
  statusRow: {
    flexDirection: 'row',
    marginTop: Space.xs,
  },
  typeBadge: {
    paddingHorizontal: Space.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  typeBadgeLook: {
    backgroundColor: colors.discovery + '20',
  },
  typeBadgePoster: {
    backgroundColor: colors.bronze + '20',
  },
  typeBadgeText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.meta.size,
    color: colors.textSecondary,
    letterSpacing: Type.meta.letterSpacing,
  },
  actions: {
    flexDirection: 'row',
    gap: Space.xs,
  },
  actionBtn: {
    width: 36,
    height: 36,
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
    marginTop: Space.xs,
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
    paddingVertical: Space.md,
    marginTop: Space.sm,
  },
  emptyCtaText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyEmphasis.size,
    color: colors.textInverse,
  },
  });
}