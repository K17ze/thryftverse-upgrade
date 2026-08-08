import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { CreatorDraftService, type DraftMeta } from './drafts';
import { createStableId } from '../utils/createStableId';
import { CreatorCanvas } from './CreatorCanvas';
import { SwipeableRow } from '../components/SwipeableRow';
import { useHaptic } from '../hooks/useHaptic';
import { useMotionConfig } from '../hooks/useMotionConfig';
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
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const [drafts, setDrafts] = useState<DraftMeta[]>([]);
  const [draftDocs, setDraftDocs] = useState<Record<string, CreatorDocument | null>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('recent');
  const [undoDraft, setUndoDraft] = useState<{ meta: DraftMeta; doc: CreatorDocument | null } | null>(null);
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
    Alert.alert(
      'Delete draft?',
      `"${draft.title}" will be permanently deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await CreatorDraftService.deleteDraft(draft.id);
            setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
          },
        },
      ],
    );
  }, []);

  const handleSwipeDelete = useCallback(async (draft: DraftMeta) => {
    haptic.medium();
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

  const renderItem = useCallback(({ item }: { item: DraftMeta }) => {
    const doc = draftDocs[item.id];
    const thumbW = 72;
    const thumbH = doc ? Math.floor(thumbW / doc.canvas.aspectRatio) : 72;
    const isPortrait = thumbH > thumbW;
    const finalThumbW = isPortrait ? 80 : thumbW;
    const finalThumbH = isPortrait ? Math.min(100, Math.floor(finalThumbW / (doc?.canvas.aspectRatio ?? 0.8))) : thumbH;
    return (
    <SwipeableRow
      accessibilityLabel={`Open draft ${item.title}`}
      accessibilityHint="Swipe left to delete"
      onPress={() => handleOpenDraft(item)}
      rightAction={{
        icon: 'trash-outline',
        label: 'Delete',
        onPress: () => handleSwipeDelete(item),
        color: colors.danger,
      }}
      swipeThreshold={88}
    >
      <View style={styles.draftRow}>
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
          <View style={[styles.draftIcon, { width: finalThumbW, height: finalThumbH, backgroundColor: item.type === 'look' ? colors.discovery + '20' : colors.bronze + '20' }]}>
            <Ionicons
              name={item.type === 'look' ? 'shirt-outline' : 'film-outline'}
              size={28}
              color={item.type === 'look' ? colors.discovery : colors.bronze}
            />
          </View>
        )}
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
            onPress={() => handleDuplicateDraft(item)}
            style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={`Duplicate draft ${item.title}`}
            accessibilityRole="button"
          >
            <Ionicons name="copy-outline" size={18} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            onPress={() => handleDeleteDraft(item)}
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
  ); }, [handleOpenDraft, handleDeleteDraft, handleSwipeDelete, handleDuplicateDraft, draftDocs, styles, colors]);

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

      <FlatList
        data={sortedDrafts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadDrafts(); }} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="document-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No drafts yet</Text>
            <Text style={styles.emptySubtext}>Start creating to see your drafts here</Text>
            <Pressable
              onPress={handleStartCreating}
              style={({ pressed }) => [styles.emptyCta, pressed && { opacity: 0.85 }]}
              accessibilityLabel="Start creating"
              accessibilityRole="button"
            >
              <Text style={styles.emptyCtaText}>Start Creating</Text>
            </Pressable>
          </View>
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
