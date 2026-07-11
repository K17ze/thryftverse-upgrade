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
} from 'react-native';
import Reanimated, {
  FadeInDown,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Colors, ActiveTheme } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { EmptyState } from '../components/EmptyState';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { haptics } from '../utils/haptics';
import { AppButton } from '../components/ui/AppButton';
import { Typography, DockConstants } from '../theme/designTokens';
import { T } from '../components/ui/Text';
import { Space, Radius, Type } from '../theme/designTokens';
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

type NavT = StackNavigationProp<RootStackParamList>;
const { width: SCREEN_W } = Dimensions.get('window');
const SLOT_SIZE = (SCREEN_W - Space.md * 2 - Space.sm * 4) / 5;

const SLOTS: OutfitSlot[] = ['top', 'bottom', 'shoes', 'outerwear', 'accessory'];

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
          <Ionicons name={getSlotIcon(slot) as any} size={20} color={isActive ? Colors.brand : Colors.textMuted} />
        </View>
      )}
      {isActive && <View style={slotStyles.activeRing} />}
    </AnimatedPressable>
  );
}

const slotStyles = StyleSheet.create({
  circle: {
    width: SLOT_SIZE,
    height: SLOT_SIZE,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  circleActive: {
    borderColor: Colors.brand,
    borderWidth: 2,
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
    bottom: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.brand,
  },
});

function ItemThumb({
  item,
  onPress,
  isSelected,
}: {
  item: StyleItem;
  onPress: () => void;
  isSelected: boolean;
}) {
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
          <Ionicons name="image-outline" size={24} color={Colors.textMuted} />
        </View>
      )}
      <View style={thumbStyles.meta}>
        <T.Caption
          color={Colors.textPrimary}
          numberOfLines={1}
          style={{ fontFamily: Typography.family.semibold }}
        >
          {item.title}
        </T.Caption>
        <T.Meta color={Colors.textMuted} numberOfLines={1}>
          {item.brand ?? item.category}
        </T.Meta>
      </View>
      {isSelected && (
        <View style={thumbStyles.check}>
          <Ionicons name="checkmark-circle" size={20} color={Colors.brand} />
        </View>
      )}
    </AnimatedPressable>
  );
}

const thumbStyles = StyleSheet.create({
  card: {
    width: (SCREEN_W - Space.md * 2 - Space.sm) / 2,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: Space.sm,
  },
  cardSelected: {
    borderColor: Colors.brand,
    borderWidth: 2,
  },
  image: {
    width: '100%',
    height: 140,
    backgroundColor: Colors.surfaceAlt,
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
    backgroundColor: Colors.background,
    borderRadius: Radius.full,
  },
});

function ScoreBadge({ score }: { score: number }) {
  const scale = useSharedValue(1);
  React.useEffect(() => {
    scale.value = withSpring(1.15, { damping: 12 });
    const t = setTimeout(() => {
      scale.value = withSpring(1, { damping: 12 });
    }, 200);
    return () => clearTimeout(t);
  }, [score]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const color = score >= 80 ? Colors.success : score >= 50 ? Colors.brand : Colors.danger;

  return (
    <Reanimated.View style={[scoreStyles.badge, { borderColor: color }, animStyle]}>
      <T.Caption color={color} style={{ fontFamily: Typography.family.bold }}>
        {score}
      </T.Caption>
    </Reanimated.View>
  );
}

const scoreStyles = StyleSheet.create({
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
});

// ── Main Screen ──

export default function OutfitBuilderScreen() {
  const navigation = useNavigation<NavT>();
  const { listings } = useBackendData();
  const collections = useStore((s) => s.collections);
  const createCollectionFn = useStore((s) => s.createCollection);
  const addToCollection = useStore((s) => s.addToCollection);

  const [activeSlot, setActiveSlot] = useState<OutfitSlot>('top');
  const [outfitItems, setOutfitItems] = useState<Record<OutfitSlot, StyleItem | undefined>>({
    top: undefined,
    bottom: undefined,
    shoes: undefined,
    outerwear: undefined,
    accessory: undefined,
  });

  // Convert listings to StyleItems
  const availableItems = useMemo<StyleItem[]>(() => {
    return listings.map((l: any) => ({
      id: l.id,
      title: l.title,
      category: l.category,
      subcategory: l.subcategory,
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

    // Add each item to the new collection
    SLOTS.forEach((slot) => {
      const item = outfitItems[slot];
      if (item) addToCollection(collectionId, item.id);
    });

    haptics.success();
    Alert.alert('Outfit Saved', `"${collectionName}" added to your collections.`, [
      { text: 'OK', onPress: () => navigation.goBack() },
    ]);
  };

  const handleClear = () => {
    Alert.alert('Clear Outfit?', 'This will remove all selected items.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          setOutfitItems({ top: undefined, bottom: undefined, shoes: undefined, outerwear: undefined, accessory: undefined });
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
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

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
          <Ionicons name="close" size={28} color={Colors.textPrimary} />
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
          <Ionicons name="trash-outline" size={22} color={Colors.danger} />
        </AnimatedPressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Outfit Preview */}
        <Reanimated.View entering={FadeInDown.duration(300)} style={styles.previewWrap}>
          <View style={styles.slotRow}>
            {SLOTS.map((slot) => (
              <View key={slot} style={styles.slotWrap}>
                <SlotCircle
                  slot={slot}
                  item={outfitItems[slot]}
                  isActive={activeSlot === slot}
                  onPress={() => setActiveSlot(slot)}
                />
                <T.Meta color={activeSlot === slot ? Colors.brand : Colors.textMuted} style={styles.slotLabel}>
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
                <T.Caption color={Colors.textPrimary} style={{ fontFamily: Typography.family.bold }}>
                  Compatibility
                </T.Caption>
                <T.Meta color={Colors.textMuted}>
                  {compatibility.reasons.join(' · ') || 'Select items to score'}
                </T.Meta>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: Space.xs }}>
              <T.Meta color={Colors.textMuted}>{filledCount}/{SLOTS.length}</T.Meta>
            </View>
          </View>
        </Reanimated.View>

        {/* AI Suggestion */}
        {aiSuggestion && (
          <Reanimated.View entering={FadeInUp.duration(250)} style={{ marginHorizontal: Space.md, marginBottom: Space.md }}>
            <View style={styles.aiCard}>
              <View style={styles.aiRow}>
                <Ionicons name="sparkles" size={18} color={Colors.brand} />
                <T.Caption color={Colors.brand} style={{ fontFamily: Typography.family.bold }}>
                  AI Suggestion
                </T.Caption>
              </View>
              <T.Body color={Colors.textSecondary} style={{ marginBottom: Space.sm }}>
                Add a <Text style={{ fontFamily: Typography.family.bold, color: Colors.textPrimary }}>{getSlotLabel(aiSuggestion.slot)}</Text> to improve your outfit score by +{aiSuggestion.scoreImprovement}.
              </T.Body>
              <AppButton
                title={`Add ${aiSuggestion.item.brand ?? ''} ${aiSuggestion.item.title}`.trim()}
                variant="secondary"
                size="sm"
                onPress={handleAiSuggest}
                icon={<Ionicons name="add-circle-outline" size={16} color={Colors.brand} />}
              />
            </View>
          </Reanimated.View>
        )}

        {/* Section Header */}
        <View style={styles.sectionHeader}>
          <T.Title2 color={Colors.textPrimary}>{getSlotLabel(activeSlot)}s</T.Title2>
          <T.Meta color={Colors.textMuted}>{slotItems.length} items</T.Meta>
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
                entering={FadeInDown.delay(idx * 40).duration(250)}
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
        <AppButton
          title={filledCount >= 2 ? 'Save Outfit' : `Select ${2 - filledCount} more item${filledCount === 1 ? '' : 's'}`}
          variant={filledCount >= 2 ? 'primary' : 'secondary'}
          size="lg"
          onPress={handleSave}
          disabled={filledCount < 2}
          icon={<Ionicons name="bookmark-outline" size={18} color={filledCount >= 2 ? Colors.background : Colors.textPrimary} />}
          trailingIcon={<Ionicons name="arrow-forward" size={18} color={filledCount >= 2 ? Colors.background : Colors.textMuted} />}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    textTransform: 'uppercase',
    letterSpacing: 1,
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
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
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
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Space.md,
  },
  aiCard: {
    padding: Space.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
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
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});