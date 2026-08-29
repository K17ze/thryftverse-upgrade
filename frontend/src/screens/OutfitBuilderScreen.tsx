/**
 * OutfitBuilderScreen — Build outfits from saved/owned items
 * Uses StyleGraph for heuristic compatibility scoring (color, formality,
 * season, and style-tag matching rules — not ML) and rule-based
 * completion suggestions.
 */

import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Dimensions,
  Platform,
  Share,
  ActivityIndicator,
} from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { EmptyState } from '../components/EmptyState';
import { OfflineBanner } from '../components/OfflineBanner';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { haptics } from '../utils/haptics';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { AppButton } from '../components/ui/AppButton';
import { T } from '../components/ui/Text';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { Typography, DockConstants, Radius, Type, Space, Stroke, LetterSpacing, Control, OutfitColors } from '../theme/designTokens';
import {
  OutfitSlot,
  StyleItem,
  inferSlot,
  scoreOutfit,
  suggestCompletion,
  createOutfit,
  getSlotLabel,
  getSlotIcon,
} from '../services/styleGraph';

type NavT = NativeStackNavigationProp<RootStackParamList>;
const { width: SCREEN_W } = Dimensions.get('window');
const SLOT_SIZE = (SCREEN_W - Space.md * 2 - Space.sm * 4) / 5;

const SLOTS: OutfitSlot[] = ['top', 'bottom', 'shoes', 'outerwear', 'accessory'];

/** Background swatches for the outfit preview — pastels + dark from the design token system. */
const BG_COLORS = [...OutfitColors.pastels, OutfitColors.dark];

// ── Helper Components ──

function SlotCircle({
  slot,
  item,
  isActive,
  onPress,
}: {
  slot: OutfitSlot;
  item?: StyleItem;
  isActive: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const slotStyles = useMemo(() => createSlotStyles(colors), [colors]);
  return (
    <AnimatedPressable
      style={[slotStyles.circle, isActive && slotStyles.circleActive]}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${getSlotLabel(slot)} slot`}
      accessibilityState={{ selected: isActive }}
    >
      {item?.imageUri ? (
        <CachedImage
          uri={item.imageUri}
          style={slotStyles.image}
          priority="low"
        />
      ) : (
        <View style={slotStyles.empty}>
          <Ionicons name={getSlotIcon(slot)} size={20} color={isActive ? colors.brand : colors.textMuted} />
        </View>
      )}
      {isActive && <View style={slotStyles.activeRing} />}
    </AnimatedPressable>
  );
}

function createSlotStyles(colors: ThemeColors) {
  return StyleSheet.create({
  circle: {
    width: SLOT_SIZE,
    height: SLOT_SIZE,
    borderRadius: Radius.lg,
    backgroundColor: colors.surface,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  circleActive: {
    borderColor: colors.brand,
    borderWidth: Stroke.emphasis,
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: Radius.lg,
  },
  empty: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeRing: {
    position: 'absolute',
    bottom: Space.xs,
    width: Space.xs + 2,
    height: Space.xs + 2,
    borderRadius: Radius.sm,
    backgroundColor: colors.brand,
  },
  });
}

function ItemThumb({
  item,
  onPress,
  isSelected,
}: {
  item: StyleItem;
  onPress: () => void;
  isSelected: boolean;
}) {
  const { colors } = useAppTheme();
  const thumbStyles = useMemo(() => createThumbStyles(colors), [colors]);
  return (
    <AnimatedPressable
      style={[thumbStyles.card, isSelected && thumbStyles.cardSelected]}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      {item.imageUri ? (
        <CachedImage uri={item.imageUri} style={thumbStyles.image} priority="low" />
      ) : (
        <View style={[thumbStyles.image, thumbStyles.placeholder]}>
          <Ionicons name="image-outline" size={24} color={colors.textMuted} />
        </View>
      )}
      <View style={thumbStyles.meta}>
        <T.Caption
          color={colors.textPrimary}
          numberOfLines={1}
          style={{ fontFamily: Typography.family.semibold }}
        >
          {item.title}
        </T.Caption>
        <T.Meta color={colors.textMuted} numberOfLines={1}>
          {item.brand ?? item.category}
        </T.Meta>
      </View>
      {isSelected && (
        <View style={thumbStyles.check}>
          <Ionicons name="checkmark-circle" size={20} color={colors.brand} />
        </View>
      )}
    </AnimatedPressable>
  );
}

function createThumbStyles(colors: ThemeColors) {
  return StyleSheet.create({
  card: {
    width: (SCREEN_W - Space.md * 2 - Space.sm) / 2,
    overflow: 'hidden',
    marginBottom: Space.sm,
    borderBottomWidth: Stroke.hairline,
    borderBottomColor: colors.border,
    paddingBottom: Space.sm,
  },
  cardSelected: {
    borderBottomWidth: Stroke.hairline,
    borderBottomColor: colors.border,
    borderWidth: Stroke.emphasis,
    borderColor: colors.brand,
  },
  image: {
    width: '100%',
    height: Space.xxl * 3 - Space.xs,
    backgroundColor: colors.surfaceAlt,
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  meta: {
    padding: Space.sm,
  },
  check: {
    position: 'absolute',
    top: Space.xs,
    right: Space.xs,
    backgroundColor: colors.background,
    borderRadius: Radius.full,
  },
  });
}

function ScoreBadge({ score }: { score: number }) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const scoreStyles = useMemo(() => createScoreStyles(colors), [colors]);
  const scale = useSharedValue(1);
  React.useEffect(() => {
    if (reducedMotion) {
      scale.value = 1;
      return;
    }
    scale.value = withTiming(1.12, { duration: 150, easing: Easing.out(Easing.quad) });
    const t = setTimeout(() => {
      scale.value = withTiming(1, { duration: 150, easing: Easing.inOut(Easing.quad) });
    }, 200);
    return () => clearTimeout(t);
  }, [score, reducedMotion]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const scoreColor = score >= 80 ? colors.success : score >= 50 ? colors.brand : colors.danger;

  return (
    <Reanimated.View style={[scoreStyles.badge, { borderColor: scoreColor }, animStyle]}>
      <T.Caption color={scoreColor} style={{ fontFamily: Typography.family.bold }}>
        {score}
      </T.Caption>
    </Reanimated.View>
  );
}

function createScoreStyles(colors: ThemeColors) {
  return StyleSheet.create({
  badge: {
    width: Space.xl + Space.sm,
    height: Space.xl + Space.sm,
    borderRadius: Radius.xxl,
    borderWidth: Stroke.emphasis,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  });
}

// ── Main Screen ──

export default function OutfitBuilderScreen() {
  const navigation = useNavigation<NavT>();
  const { listings, isSyncing, lastError, refreshListings } = useBackendData();
  const collections = useStore((s) => s.collections);
  const createCollectionFn = useStore((s) => s.createCollection);
  const addToCollection = useStore((s) => s.addToCollection);
  const addOutfitToStore = useStore((s) => s.addOutfit);
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [activeSlot, setActiveSlot] = useState<OutfitSlot>('top');
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmLabel?: string;
    variant?: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });
  const [outfitItems, setOutfitItems] = useState<Record<OutfitSlot, StyleItem | undefined>>({
    top: undefined,
    bottom: undefined,
    shoes: undefined,
    outerwear: undefined,
    accessory: undefined,
  });
  const [backgroundColor, setBackgroundColor] = useState<string | undefined>(undefined);

  // ── Undo / Redo history ──
  // A snapshot captures the outfit items + background color. We keep a
  // pointer into the history array; undo moves the pointer back, redo
  // moves it forward. New changes truncate any redo tail.
  type OutfitSnapshot = {
    items: Record<OutfitSlot, StyleItem | undefined>;
    bg: string | undefined;
  };
  const historyRef = useRef<OutfitSnapshot[]>([
    { items: { top: undefined, bottom: undefined, shoes: undefined, outerwear: undefined, accessory: undefined }, bg: undefined },
  ]);
  const historyIndexRef = useRef(0);
  // Force re-render when history pointers change (refs don't trigger renders).
  const [, setHistoryTick] = useState(0);
  const bumpHistory = useCallback(() => setHistoryTick((t) => t + 1), []);

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  const pushHistory = useCallback(
    (items: Record<OutfitSlot, StyleItem | undefined>, bg: string | undefined) => {
      const snapshot: OutfitSnapshot = {
        items: { ...items },
        bg,
      };
      // Truncate any redo tail before pushing.
      historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
      historyRef.current.push(snapshot);
      historyIndexRef.current = historyRef.current.length - 1;
      bumpHistory();
    },
    [bumpHistory],
  );

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    const snapshot = historyRef.current[historyIndexRef.current];
    setOutfitItems(snapshot.items);
    setBackgroundColor(snapshot.bg);
    haptics.tap();
    bumpHistory();
  }, [bumpHistory]);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    const snapshot = historyRef.current[historyIndexRef.current];
    setOutfitItems(snapshot.items);
    setBackgroundColor(snapshot.bg);
    haptics.tap();
    bumpHistory();
  }, [bumpHistory]);

  // Convert listings to StyleItems
  const availableItems = useMemo<StyleItem[]>(() => {
    return listings.map((l: any) => ({
      id: l.id,
      title: l.title,
      category: l.category,
      subcategory: l.subcategory ?? undefined,
      brand: l.brand,
      color: l.color ?? 'black',
      condition: l.condition,
      imageUri: l.images?.[0] ?? l.imageUri,
      price: l.price,
      styleTags: l.styleTags,
    }));
  }, [listings]);

  const slotItems = useMemo(() => {
    return availableItems.filter((it) => inferSlot(it) === activeSlot);
  }, [availableItems, activeSlot]);

  const compatibility = useMemo(() => scoreOutfit(outfitItems), [outfitItems]);

  const aiSuggestion = useMemo(() => {
    return suggestCompletion(outfitItems, availableItems);
  }, [outfitItems, availableItems]);

  const filledCount = SLOTS.filter((s) => outfitItems[s]).length;

  const toggleItem = useCallback((item: StyleItem) => {
    const slot = inferSlot(item);
    setOutfitItems((prev) => {
      const current = prev[slot];
      const next = current?.id === item.id
        ? { ...prev, [slot]: undefined }
        : { ...prev, [slot]: item };
      pushHistory(next, backgroundColor);
      return next;
    });
    haptics.press();
  }, [backgroundColor, pushHistory]);

  const handleSave = () => {
    if (filledCount < 2) {
      setConfirmSheet({
        visible: true,
        title: 'Need more items',
        message: 'Select at least 2 items to save an outfit.',
        confirmLabel: 'OK',
        onConfirm: () => {},
      });
      return;
    }

    const outfit = createOutfit(outfitItems);
    const collectionName = outfit.name;
    const collectionId = createCollectionFn(collectionName, `Outfit with ${filledCount} items — score ${outfit.score}`);

    SLOTS.forEach((slot) => {
      const item = outfitItems[slot];
      if (item) addToCollection(collectionId, item.id);
    });

    const itemIds = SLOTS.map((slot) => outfitItems[slot]?.id).filter(Boolean) as string[];
    addOutfitToStore({
      id: outfit.id,
      name: outfit.name,
      itemIds,
      backgroundColor,
      createdAt: outfit.createdAt,
      updatedAt: outfit.createdAt,
    });

    haptics.success();
    setConfirmSheet({
      visible: true,
      title: 'Outfit Saved',
      message: `"${collectionName}" added to your outfits.`,
      confirmLabel: 'OK',
      onConfirm: () => navigation.goBack(),
    });
  };

  const handleShare = async () => {
    if (filledCount < 1) {
      setConfirmSheet({
        visible: true,
        title: 'No items',
        message: 'Add at least one item to share your outfit.',
        confirmLabel: 'OK',
        onConfirm: () => {},
      });
      return;
    }
    const outfit = createOutfit(outfitItems);
    const itemNames = SLOTS.map((slot) => outfitItems[slot])
      .filter(Boolean)
      .map((it) => it!.title)
      .join(', ');
    try {
      await Share.share({
        message: `Check out my outfit "${outfit.name}" on Thryftverse — ${itemNames}`,
      });
    } catch { /* user cancelled */ }
  };

  const handleClear = () => {
    setConfirmSheet({
      visible: true,
      title: 'Clear Outfit?',
      message: 'This will remove all selected items.',
      confirmLabel: 'Clear',
      variant: 'danger',
      onConfirm: () => {
        const cleared = { top: undefined, bottom: undefined, shoes: undefined, outerwear: undefined, accessory: undefined };
        setOutfitItems(cleared);
        setBackgroundColor(undefined);
        pushHistory(cleared, undefined);
        haptics.error();
      },
    });
  };

  const handleAiSuggest = () => {
    if (!aiSuggestion) return;
    setOutfitItems((prev) => {
      const next = { ...prev, [aiSuggestion.slot]: aiSuggestion.item };
      pushHistory(next, backgroundColor);
      return next;
    });
    setActiveSlot(aiSuggestion.slot);
    haptics.success();
  };

  // ── Screen-level state coverage (loading / empty / error / offline) ──
  const showLoading = isSyncing && listings.length === 0;
  const showError = !isSyncing && !!lastError && listings.length === 0;
  const showEmpty = !isSyncing && !lastError && listings.length === 0;
  const showContent = listings.length > 0;

  const handleRetry = useCallback(() => {
    refreshListings();
  }, [refreshListings]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <AnimatedPressable
          style={styles.iconBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Close outfit builder"
          hapticFeedback="light"
        >
          <Ionicons name="close" size={28} color={colors.textPrimary} />
        </AnimatedPressable>
        <T.Headline style={styles.headerTitle}>Outfit Builder</T.Headline>
        <AnimatedPressable
          style={styles.iconBtn}
          onPress={handleClear}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Clear outfit"
          hapticFeedback="light"
        >
          <Ionicons name="trash-outline" size={22} color={colors.danger} />
        </AnimatedPressable>
      </View>

      {/* Offline banner — non-blocking; cached items may still be visible */}
      <OfflineBanner onRetry={handleRetry} />

      {/* Undo / Redo toolbar — progressive disclosure: only visible when
          there is history to traverse. Disabled states are truthful. */}
      {showContent && (canUndo || canRedo) && (
        <View style={styles.undoRedoBar}>
          <AnimatedPressable
            style={[styles.undoRedoBtn, !canUndo && styles.undoRedoBtnDisabled]}
            onPress={handleUndo}
            activeOpacity={0.7}
            disabled={!canUndo}
            accessibilityRole="button"
            accessibilityLabel="Undo last change"
            accessibilityHint="Reverts the outfit to its previous state"
            hapticFeedback="light"
          >
            <Ionicons name="arrow-undo" size={18} color={canUndo ? colors.textPrimary : colors.textMuted} />
            <Text style={[styles.undoRedoLabel, !canUndo && styles.undoRedoLabelDisabled]}>Undo</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.undoRedoBtn, !canRedo && styles.undoRedoBtnDisabled]}
            onPress={handleRedo}
            activeOpacity={0.7}
            disabled={!canRedo}
            accessibilityRole="button"
            accessibilityLabel="Redo change"
            accessibilityHint="Re-applies a change that was undone"
            hapticFeedback="light"
          >
            <Text style={[styles.undoRedoLabel, !canRedo && styles.undoRedoLabelDisabled]}>Redo</Text>
            <Ionicons name="arrow-redo" size={18} color={canRedo ? colors.textPrimary : colors.textMuted} />
          </AnimatedPressable>
        </View>
      )}

      {/* ── Loading state ── */}
      {showLoading && (
        <View style={styles.stateContainer}>
          <ActivityIndicator size="large" color={colors.brand} />
          <T.Body color={colors.textMuted} style={{ marginTop: Space.md }}>
            Loading your closet…
          </T.Body>
        </View>
      )}

      {/* ── Error state ── */}
      {showError && (
        <View style={styles.stateContainer}>
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load items"
            subtitle={lastError ?? 'Check your connection and try again.'}
            ctaLabel="Retry"
            onCtaPress={handleRetry}
          />
        </View>
      )}

      {/* ── Empty state ── */}
      {showEmpty && (
        <View style={styles.stateContainer}>
          <EmptyState
            icon="shirt-outline"
            title="Your closet is empty"
            subtitle="Add listings to your shop to start building outfits from your items."
            ctaLabel="Go back"
            onCtaPress={() => navigation.goBack()}
          />
        </View>
      )}

      {/* ── Populated content ── */}
      {showContent && (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Outfit Preview */}
        <View style={[styles.previewWrap, backgroundColor ? { backgroundColor } : undefined]}>
          <View style={styles.slotRow}>
            {SLOTS.map((slot) => (
              <View key={slot} style={styles.slotWrap}>
                <SlotCircle
                  slot={slot}
                  item={outfitItems[slot]}
                  isActive={activeSlot === slot}
                  onPress={() => setActiveSlot(slot)}
                />
                <T.Meta color={activeSlot === slot ? colors.brand : colors.textMuted} style={styles.slotLabel}>
                  {getSlotLabel(slot)}
                </T.Meta>
              </View>
            ))}
          </View>

          {/* Score & Tags */}
          <View style={styles.scoreRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Space.sm }}>
              <ScoreBadge score={compatibility.score} />
              <View>
                <T.Caption color={colors.textPrimary} style={{ fontFamily: Typography.family.bold }}>
                  Compatibility
                </T.Caption>
                <T.Meta color={colors.textMuted}>
                  {compatibility.reasons.join(' · ') || 'Select items to score'}
                </T.Meta>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: Space.xs }}>
              <T.Meta color={colors.textMuted}>{filledCount}/{SLOTS.length}</T.Meta>
            </View>
          </View>

          {/* Background color picker */}
          <View style={styles.bgRow}>
            <T.Meta color={colors.textMuted}>Background</T.Meta>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bgSwatches}>
              <AnimatedPressable
                style={[styles.swatch, !backgroundColor && styles.swatchActive]}
                onPress={() => { haptics.tap(); setBackgroundColor(undefined); }}
                accessibilityRole="button"
                accessibilityLabel="Default background"
                accessibilityState={{ selected: !backgroundColor }}
              >
                <Ionicons name="close" size={14} color={colors.textMuted} />
              </AnimatedPressable>
              {BG_COLORS.map((c) => (
                <AnimatedPressable
                  key={c}
                  style={[
                    styles.swatch,
                    { backgroundColor: c },
                    backgroundColor === c && styles.swatchActive,
                  ]}
                  onPress={() => { haptics.tap(); setBackgroundColor(c); }}
                  accessibilityRole="button"
                  accessibilityLabel={`Background color ${c}`}
                  accessibilityState={{ selected: backgroundColor === c }}
                />
              ))}
            </ScrollView>
          </View>
        </View>

        {/* Style suggestion — heuristic, not ML */}
        {aiSuggestion && (
          <View style={[styles.aiCard, { marginHorizontal: Space.md, marginBottom: Space.md }]}>
            <View style={styles.aiRow}>
              <Ionicons name="bulb-outline" size={18} color={colors.brand} />
              <T.Caption color={colors.brand} style={{ fontFamily: Typography.family.bold }}>
                Style suggestion
              </T.Caption>
            </View>
            <T.Body color={colors.textSecondary} style={{ marginBottom: Space.sm }}>
              Add a <Text style={{ fontFamily: Typography.family.bold, color: colors.textPrimary }}>{getSlotLabel(aiSuggestion.slot)}</Text> to improve your outfit score by +{aiSuggestion.scoreImprovement}.
            </T.Body>
            <AppButton
              title={`Add ${aiSuggestion.item.brand ?? ''} ${aiSuggestion.item.title}`.trim()}
              variant="secondary"
              size="sm"
              onPress={handleAiSuggest}
              icon={<Ionicons name="add-circle-outline" size={16} color={colors.brand} />}
            />
          </View>
        )}

        {/* Section Header */}
        <View style={styles.sectionHeader}>
          <T.Title2 color={colors.textPrimary}>{getSlotLabel(activeSlot)}s</T.Title2>
          <T.Meta color={colors.textMuted}>{slotItems.length} items</T.Meta>
        </View>

        {/* Item Grid */}
        {slotItems.length === 0 ? (
          <EmptyState
            icon="shirt-outline"
            title="No items"
            subtitle={`You don't have any ${getSlotLabel(activeSlot).toLowerCase()}s in your closet yet.`}
          />
        ) : (
          <View style={styles.grid}>
            {slotItems.map((item, idx) => (
              <View key={item.id}>
                <ItemThumb
                  item={item}
                  onPress={() => toggleItem(item)}
                  isSelected={outfitItems[activeSlot]?.id === item.id}
                />
              </View>
            ))}
          </View>
        )}

        <View style={{ height: DockConstants.singleActionHeight }} />
      </ScrollView>
      )}

      {/* Footer CTA */}
      {showContent && (
      <View style={styles.footer}>
        <View style={styles.footerRow}>
          <AnimatedPressable
            style={styles.shareBtn}
            onPress={handleShare}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Share outfit"
            hapticFeedback="light"
          >
            <Ionicons name="share-outline" size={22} color={colors.textPrimary} />
          </AnimatedPressable>
          <View style={{ flex: 1 }}>
            <AppButton
              title={filledCount >= 2 ? 'Save Outfit' : `Select ${2 - filledCount} more item${filledCount === 1 ? '' : 's'}`}
              variant={filledCount >= 2 ? 'primary' : 'secondary'}
              size="lg"
              onPress={handleSave}
              disabled={filledCount < 2}
              icon={<Ionicons name="bookmark-outline" size={18} color={filledCount >= 2 ? colors.background : colors.textPrimary} />}
              trailingIcon={<Ionicons name="arrow-forward" size={18} color={filledCount >= 2 ? colors.background : colors.textMuted} />}
            />
          </View>
        </View>
      </View>
      )}

      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((prev) => ({ ...prev, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        variant={confirmSheet.variant ?? 'default'}
        onConfirm={confirmSheet.onConfirm}
      />
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  iconBtn: {
    width: Space.xl + Space.sm,
    height: Space.xl + Space.sm,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    textTransform: 'uppercase',
    letterSpacing: LetterSpacing.caps,
    fontSize: Type.subtitle.size,
  },
  undoRedoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.lg,
    paddingVertical: Space.xs,
    paddingHorizontal: Space.md,
    borderBottomWidth: Stroke.hairline,
    borderBottomColor: colors.border,
  },
  undoRedoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs,
    borderRadius: Radius.md,
    minHeight: Control.hit,
  },
  undoRedoBtnDisabled: {
    opacity: 0.4,
  },
  undoRedoLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    letterSpacing: LetterSpacing.wide,
  },
  undoRedoLabelDisabled: {
    color: colors.textMuted,
  },
  scrollContent: {
    paddingTop: Space.sm,
  },
  stateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.md,
  },
  previewWrap: {
    marginHorizontal: Space.md,
    marginBottom: Space.md,
    padding: Space.md,
  },
  slotRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Space.md,
  },
  slotWrap: {
    alignItems: 'center',
    gap: Space.xs,
  },
  slotLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: Stroke.standard,
    borderTopColor: colors.border,
    paddingTop: Space.md,
  },
  bgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: Stroke.hairline,
    borderTopColor: colors.border,
    paddingTop: Space.md,
    marginTop: Space.md,
  },
  bgSwatches: {
    flexDirection: 'row',
    gap: Space.xs,
    alignItems: 'center',
  },
  swatch: {
    width: Space.lg + Space.xs,
    height: Space.lg + Space.xs,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  swatchActive: {
    borderWidth: Stroke.emphasis,
    borderColor: colors.brand,
  },
  aiCard: {
    paddingVertical: Space.md,
    borderTopWidth: Stroke.hairline,
    borderTopColor: colors.border,
  },
  aiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginBottom: Space.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Platform.OS === 'ios' ? Space.md : Space.sm,
    backgroundColor: colors.background,
    borderTopWidth: Stroke.standard,
    borderTopColor: colors.border,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  shareBtn: {
    width: Space.xl + Space.sm,
    height: Space.xl + Space.sm,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  });
}