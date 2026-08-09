import React from 'react';
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  Dimensions,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { POSTER_TEMPLATES, PosterTemplate } from '../../data/posters';
import { Typography, Radius, Type, Space, Stroke } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { Motion } from '../../theme/motionTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { GradientRing } from './shared/GradientRing';
import { useHaptic } from '../../hooks/useHaptic';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useMotionConfig } from '../../hooks/useMotionConfig';

const { height: SCREEN_H } = Dimensions.get('window');
const DRAWER_HEIGHT = SCREEN_H * 0.5;

export type TemplateCategory = 'all' | 'drop' | 'auction' | 'coown' | 'sale' | 'general';

interface TemplatePickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (template: PosterTemplate) => void;
  currentTemplateId?: string;
}

const CATEGORIES: { key: TemplateCategory; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'drop', label: 'Drops' },
  { key: 'auction', label: 'Auctions' },
  { key: 'coown', label: 'Co-Own' },
  { key: 'sale', label: 'Sales' },
  { key: 'general', label: 'General' },
];

const THUMB_SIZE = 72;
const NUM_COLUMNS = 4;

// ── Individual template card with spring entrance + gradient ring ────
interface TemplateCardProps {
  template: PosterTemplate;
  isActive: boolean;
  index: number;
  reducedMotion: boolean;
  staggerDelay: number;
  onSelect: (template: PosterTemplate) => void;
  onClose: () => void;
}

const TemplateCard = React.memo(function TemplateCard({
  template,
  isActive,
  index,
  reducedMotion,
  staggerDelay,
  onSelect,
  onClose,
}: TemplateCardProps) {
  const haptic = useHaptic();
  const { spring } = useMotionConfig();
  const { colors } = useAppTheme();

  // Per-card entrance: stagger by index using Motion.stagger.normal (60ms).
  // Spring-based scale 0.8 → 1.0 entrance with opacity fade-in.
  const cardEntrance = useSharedValue(reducedMotion ? 1 : 0);

  React.useEffect(() => {
    if (reducedMotion) {
      cardEntrance.value = 1;
    } else {
      cardEntrance.value = withDelay(
        staggerDelay,
        withSpring(1, spring.entrance),
      );
    }
  }, [staggerDelay, reducedMotion, spring.entrance, cardEntrance]);

  const entranceStyle = useAnimatedStyle(() => {
    'worklet';
    const scale = interpolate(
      cardEntrance.value,
      [0, 1],
      [0.8, 1],
      Extrapolation.CLAMP,
    );
    const opacity = interpolate(
      cardEntrance.value,
      [0, 1],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return {
      transform: [{ scale }],
      opacity,
    };
  });

  // Selection scale lift — subtle spring pop when becoming active.
  const selectionScale = useSharedValue(isActive ? 1.06 : 1);

  React.useEffect(() => {
    selectionScale.value = withSpring(isActive ? 1.06 : 1, spring.lift);
  }, [isActive, spring.lift, selectionScale]);

  const selectionStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [{ scale: selectionScale.value }],
    };
  });

  const handleSelect = React.useCallback(() => {
    // Selection haptic on template selection.
    haptic.selection();
    onSelect(template);
    onClose();
  }, [haptic, onSelect, onClose, template]);

  return (
    <Reanimated.View style={entranceStyle}>
      <AnimatedPressable
        style={styles.card}
        onPress={handleSelect}
        scaleValue={0.95}
        activeOpacity={0.85}
        hapticFeedback="selection"
        accessibilityLabel={`${template.name} template${isActive ? ', active' : ''}`}
        accessibilityHint={`Applies the ${template.name} template`}
        accessibilityRole="button"
        accessibilityState={{ selected: isActive }}
      >
        {/* Gradient ring — Instagram-style active indicator (shared component) */}
        <GradientRing isActive={isActive} strokeWidth={3} borderRadius={Radius.xl + 3}>
          <Reanimated.View style={selectionStyle}>
            <View
              style={[
                styles.thumb,
                { backgroundColor: template.thumbnailColor },
                isActive && styles.thumbActive,
              ]}
            >
              <Ionicons name={template.icon} size={28} color="#fff" />
              {isActive && (
                <View style={[styles.checkBadge, { backgroundColor: colors.success }]}>
                  <Ionicons name="checkmark" size={12} color="#fff" />
                </View>
              )}
            </View>
          </Reanimated.View>
        </GradientRing>
        <Text
          style={[styles.cardLabel, isActive && styles.cardLabelActive]}
          numberOfLines={1}
        >
          {template.name}
        </Text>
      </AnimatedPressable>
    </Reanimated.View>
  );
});

export default function TemplatePicker({
  visible,
  onClose,
  onSelect,
  currentTemplateId,
}: TemplatePickerProps) {
  const [category, setCategory] = React.useState<TemplateCategory>('all');
  const reducedMotion = useReducedMotion();
  const { spring, stagger } = useMotionConfig();
  const haptic = useHaptic();

  // Drawer slide-up + backdrop fade (Reanimated 4)
  const translateY = useSharedValue(DRAWER_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const contentOpacity = useSharedValue(0);

  const filtered = React.useMemo(() => {
    if (category === 'all') return POSTER_TEMPLATES;
    return POSTER_TEMPLATES.filter((t) => t.category === category);
  }, [category]);

  React.useEffect(() => {
    if (visible) {
      if (reducedMotion) {
        translateY.value = 0;
        backdropOpacity.value = 1;
        contentOpacity.value = 1;
      } else {
        translateY.value = withSpring(0, spring.entrance);
        backdropOpacity.value = withTiming(1, { duration: Motion.duration.normal });
        contentOpacity.value = withDelay(
          100,
          withTiming(1, { duration: Motion.duration.normal }),
        );
      }
    } else {
      if (reducedMotion) {
        translateY.value = DRAWER_HEIGHT;
        backdropOpacity.value = 0;
        contentOpacity.value = 0;
      } else {
        translateY.value = withSpring(DRAWER_HEIGHT, spring.entrance);
        backdropOpacity.value = withTiming(0, { duration: Motion.duration.fast });
        contentOpacity.value = withTiming(0, { duration: Motion.duration.fast });
      }
    }
  }, [visible, reducedMotion, spring.entrance, translateY, backdropOpacity, contentOpacity]);

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  const handleClose = React.useCallback(() => {
    haptic.light();
    onClose();
  }, [haptic, onClose]);

  const handleCategoryChange = React.useCallback(
    (key: TemplateCategory) => {
      // Light haptic on category change.
      haptic.light();
      setCategory(key);
    },
    [haptic],
  );

  const renderItem = React.useCallback(
    ({ item, index }: { item: PosterTemplate; index: number }) => {
      // Stagger by row so cards in the same row animate together, then
      // subsequent rows cascade. Motion.stagger.normal = 60ms.
      const rowIndex = Math.floor(index / NUM_COLUMNS);
      const staggerDelay = rowIndex * stagger.normal;
      return (
        <View style={styles.gridItem}>
          <TemplateCard
            template={item}
            isActive={currentTemplateId === item.id}
            index={index}
            reducedMotion={reducedMotion}
            staggerDelay={staggerDelay}
            onSelect={onSelect}
            onClose={onClose}
          />
        </View>
      );
    },
    [currentTemplateId, reducedMotion, stagger.normal, onSelect, onClose],
  );

  const keyExtractor = React.useCallback(
    (item: PosterTemplate) => item.id,
    [],
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      {/* Backdrop */}
      <Reanimated.View
        style={[styles.backdrop, backdropStyle]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <AnimatedPressable
          style={StyleSheet.absoluteFill}
          onPress={handleClose}
          activeOpacity={1}
          hapticFeedback="light"
          accessibilityLabel="Close template picker"
          accessibilityRole="button"
        />
      </Reanimated.View>

      {/* Drawer */}
      <Reanimated.View style={[styles.drawer, drawerStyle]}>
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>

        <Text style={styles.title}>Templates</Text>

        {/* Category tabs — horizontal scroll */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabRow}
          accessibilityRole="tablist"
          accessibilityLabel="Template categories"
        >
          {CATEGORIES.map((c) => (
            <AnimatedPressable
              key={c.key}
              style={[styles.tab, category === c.key && styles.tabActive]}
              onPress={() => handleCategoryChange(c.key)}
              scaleValue={0.96}
              activeOpacity={0.85}
              hapticFeedback="light"
              accessibilityLabel={`${c.label} templates`}
              accessibilityHint={`Filters templates by ${c.label.toLowerCase()}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: category === c.key }}
            >
              <Text style={[styles.tabText, category === c.key && styles.tabTextActive]}>
                {c.label}
              </Text>
            </AnimatedPressable>
          ))}
        </ScrollView>

        {/* Template grid — FlashList for virtualised rendering */}
        <Reanimated.View
          style={[styles.gridWrapper, contentStyle]}
          accessibilityRole="list"
          accessibilityLabel="Templates"
        >
          <FlashList
            data={filtered}
            numColumns={NUM_COLUMNS}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            contentContainerStyle={styles.gridContent}
            showsVerticalScrollIndicator={false}
          />
        </Reanimated.View>
      </Reanimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  drawer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: DRAWER_HEIGHT,
    backgroundColor: 'rgba(18,18,22,0.98)',
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    overflow: 'hidden',
    paddingBottom: Space.lg,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  title: {
    fontSize: 18,
    fontFamily: Typography.family.bold,
    color: '#fff',
    textAlign: 'center',
    marginBottom: Space.md,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: Space.md,
    paddingBottom: 10,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  tabActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  tabText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: 'rgba(255,255,255,0.6)',
  },
  tabTextActive: {
    color: '#fff',
  },
  gridWrapper: {
    flex: 1,
  },
  gridContent: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.lg,
  },
  gridItem: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Space.xs,
    paddingVertical: Space.xs,
  },
  card: {
    alignItems: 'center',
    gap: 6,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: Stroke.standard,
    borderColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  thumbActive: {
    borderColor: 'transparent',
  },
  checkBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  cardLabelActive: {
    color: '#fff',
  },
});
