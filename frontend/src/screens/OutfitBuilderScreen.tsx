/**
 * OutfitBuilderScreen — Build outfits from saved/owned items
 * Uses StyleGraph for compatibility scoring and AI suggestions.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Dimensions,
  Alert,
  Platform,
  Share,
} from 'react-native';
import Reanimated, {
  FadeInDown,
  FadeInUp,
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
import { useReducedMotion } from '../hooks/useReducedMotion';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { EmptyState } from '../components/EmptyState';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { haptics } from '../utils/haptics';
import { AppButton } from '../components/ui/AppButton';
import { T } from '../components/ui/Text';
import { Typography, DockConstants, Radius, Type, Space, Stroke, LetterSpacing } from '../theme/designTokens';
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

const BG_COLORS = ['#F5F5F0', '#E8E4DF', '#D4C9BE', '#C9D9E8', '#D9D0E1', '#E8D4D4', '#D4E8D6', '#1A1A1A'];

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
    borderRadius: Radius.lg,
    backgroundColor: colors.surface,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: Space.sm,
  },
  cardSelected: {
    borderColor: colors.brand,
    borderWidth: Stroke.emphasis,
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
  const scoreStyles = useMemo(() => createScoreStyles(colors), [colors]);
  const scale = useSharedValue(1);
  React.useEffect(() => {
    scale.value = withTiming(1.12, { duration: 150, easing: Easing.out(Easing.quad) });
    const t = setTimeout(() => {
      scale.value = withTiming(1, { duration: 150, easing: Easing.inOut(Easing.quad) });
    }, 200);
    return () => clearTimeout(t);
  }, [score]);

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
  const { listings } = useBackendData();
  const collections = useStore((s) => s.collections);
  const createCollectionFn = useStore((s) => s.createCollection);
  const addToCollection = useStore((s) => s.addToCollection);
  const addOutfitToStore = useStore((s) => s.addOutfit);
  const { colors, isDark } = useAppTheme();
  const reducedMotionEnabled = useReducedMotion();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [activeSlot, setActiveSlot] = useState<OutfitSlot>('top');
  const [outfitItems, setOutfitItems] = useState<Record<OutfitSlot, StyleItem | undefined>>({
    top: undefined,
    bottom: undefined,
    shoes: undefined,
    outerwear: undefined,
    accessory: undefined,
  });
  const [backgroundColor, setBackgroundColor] = useState<string | undefined>(undefined);

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
      if (current?.id === item.id) {
        return { ...prev, [slot]: undefined };
      }
      return { ...prev, [slot]: item };
    });
    haptics.press();
  }, []);

  const handleSave = () => {
    if (filledCount < 2) {
      Alert.alert('Need more items', 'Select at least 2 items to save an outfit.');
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
    Alert.alert('Outfit Saved', `"${collectionName}" added to your outfits.`, [
      { text: 'OK', onPress: () => navigation.goBack() },
    ]);
  };

  const handleShare = async () => {
    if (filledCount < 1) {
      Alert.alert('No items', 'Add at least one item to share your outfit.');
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
    Alert.alert('Clear Outfit?', 'This will remove all selected items.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          setOutfitItems({ top: undefined, bottom: undefined, shoes: undefined, outerwear: undefined, accessory: undefined });
          setBackgroundColor(undefined);
          haptics.error();
        },
      },
    ]);
  };

  const handleAiSuggest = () => {
    if (!aiSuggestion) return;
    setOutfitItems((prev) => ({ ...prev, [aiSuggestion.slot]: aiSuggestion.item }));
    setActiveSlot(aiSuggestion.slot);
    haptics.success();
  };

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

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Outfit Preview */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)} style={[styles.previewWrap, backgroundColor ? { backgroundColor } : undefined]}>
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
        </Reanimated.View>

        {/* AI Suggestion */}
        {aiSuggestion && (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInUp.duration(250)} style={{ marginHorizontal: Space.md, marginBottom: Space.md }}>
            <View style={styles.aiCard}>
              <View style={styles.aiRow}>
                <Ionicons name="bulb-outline" size={18} color={colors.brand} />
                <T.Caption color={colors.brand} style={{ fontFamily: Typography.family.bold }}>
                  Suggestion
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
          </Reanimated.View>
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
              <Reanimated.View
                key={item.id}
                entering={reducedMotionEnabled ? undefined : FadeInDown.delay(idx * 40).duration(250)}
              >
                <ItemThumb
                  item={item}
                  onPress={() => toggleItem(item)}
                  isSelected={outfitItems[activeSlot]?.id === item.id}
                />
              </Reanimated.View>
            ))}
          </View>
        )}

        <View style={{ height: DockConstants.singleActionHeight }} />
      </ScrollView>

      {/* Footer CTA */}
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
  scrollContent: {
    paddingTop: Space.sm,
  },
  previewWrap: {
    marginHorizontal: Space.md,
    marginBottom: Space.md,
    padding: Space.md,
    borderRadius: Radius.lg,
    backgroundColor: colors.surface,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
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
    padding: Space.md,
    borderRadius: Radius.lg,
    backgroundColor: colors.surface,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
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