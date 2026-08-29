import React from 'react';
import { Radius, Space, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import {
  View,
  StyleSheet,
  Text,
  Dimensions,
  ScrollView,
  Platform } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  type SharedValue,
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  interpolate,
  Extrapolation,
  runOnJS,
  cancelAnimation } from 'react-native-reanimated';
import { AnimatedPressable } from '../AnimatedPressable';
import { GradientRing } from './shared/GradientRing';
import { useHaptic } from '../../hooks/useHaptic';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useMotionConfig } from '../../hooks/useMotionConfig';

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');
const DRAWER_HEIGHT = SCREEN_H * 0.55;

export type LayoutType =
  | 'single'
  | 'split-h'
  | 'split-v'
  | 'triple-h'
  | 'grid-2x2'
  | 'photo-booth';

interface LayoutPickerProps {
  visible: boolean;
  currentLayout: LayoutType;
  onSelect: (layout: LayoutType) => void;
  onClose: () => void;
  previewUri?: string;
}

const LAYOUTS: { type: LayoutType; label: string; slots: number }[] = [
  { type: 'single', label: 'Full', slots: 1 },
  { type: 'split-h', label: 'Split H', slots: 2 },
  { type: 'split-v', label: 'Split V', slots: 2 },
  { type: 'triple-h', label: 'Triple H', slots: 3 },
  { type: 'grid-2x2', label: '2x2 Grid', slots: 4 },
  { type: 'photo-booth', label: 'Photo Booth', slots: 4 },
];

const THUMB_SIZE = 88;
const THUMB_GAP = 14;
const SNAP_INTERVAL = THUMB_SIZE + THUMB_GAP;

// ── Layout preview mock ──────────────────────────────────────────────
function LayoutPreview({ type }: { type: LayoutType }) {
  const { colors } = useAppTheme();
  const boxStyle = {
    backgroundColor: colors.glassBorder,
    borderRadius: Radius.sm,
    flex: 1 };

  switch (type) {
    case 'single':
      return <View style={boxStyle} />;
    case 'split-h':
      return (
        <View style={{ flex: 1, flexDirection: 'row', gap: 2 }}>
          <View style={boxStyle} />
          <View style={boxStyle} />
        </View>
      );
    case 'split-v':
      return (
        <View style={{ flex: 1, flexDirection: 'column', gap: 2 }}>
          <View style={boxStyle} />
          <View style={boxStyle} />
        </View>
      );
    case 'triple-h':
      return (
        <View style={{ flex: 1, flexDirection: 'row', gap: 2 }}>
          <View style={boxStyle} />
          <View style={boxStyle} />
          <View style={boxStyle} />
        </View>
      );
    case 'grid-2x2':
      return (
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flex: 1, flexDirection: 'row', gap: 2 }}>
            <View style={boxStyle} />
            <View style={boxStyle} />
          </View>
          <View style={{ flex: 1, flexDirection: 'row', gap: 2 }}>
            <View style={boxStyle} />
            <View style={boxStyle} />
          </View>
        </View>
      );
    case 'photo-booth':
      return (
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flex: 1, flexDirection: 'row', gap: 2 }}>
            <View style={boxStyle} />
            <View style={boxStyle} />
          </View>
          <View style={{ flex: 1, flexDirection: 'row', gap: 2 }}>
            <View style={boxStyle} />
            <View style={boxStyle} />
          </View>
        </View>
      );
  }
}

// ── Individual layout card with spring entrance + gradient ring ──────
interface LayoutCardProps {
  layout: { type: LayoutType; label: string; slots: number };
  isActive: boolean;
  index: number;
  reducedMotion: boolean;
  entranceProgress: SharedValue<number>;
  onSelect: (layout: LayoutType) => void;
  onClose: () => void;
}

const LayoutCard = React.memo(function LayoutCard({
  layout,
  isActive,
  index,
  reducedMotion,
  entranceProgress,
  onSelect,
  onClose }: LayoutCardProps) {
  const haptic = useHaptic();
  const { spring } = useMotionConfig();
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // Per-card entrance: stagger by index (50ms delay per item)
  const cardEntrance = useSharedValue(reducedMotion ? 1 : 0);

  React.useEffect(() => {
    if (reducedMotion) {
      cardEntrance.value = 1;
    } else {
      cardEntrance.value = withDelay(
        index * 50,
        withSpring(1, spring.entrance),
      );
    }
  }, [index, reducedMotion, spring.entrance, cardEntrance]);

  const entranceStyle = useAnimatedStyle(() => {
    'worklet';
    const scale = interpolate(
      cardEntrance.value,
      [0, 1],
      [0.85, 1],
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
      opacity };
  });

  const handleSelect = React.useCallback(() => {
    haptic.light();
    onSelect(layout.type);
    onClose();
  }, [haptic, onSelect, onClose, layout.type]);

  return (
    <Reanimated.View style={entranceStyle}>
      <AnimatedPressable
        style={styles.layoutCard}
        onPress={handleSelect}
        scaleValue={0.95}
        activeOpacity={0.85}
        hapticFeedback="light"
        accessibilityLabel={`${layout.label} layout, ${layout.slots} slots${isActive ? ', active' : ''}`}
        accessibilityHint={`Selects the ${layout.label.toLowerCase()} layout with ${layout.slots} photo slot${layout.slots !== 1 ? 's' : ''}`}
        accessibilityRole="button"
        accessibilityState={{ selected: isActive }}
      >
        {/* Gradient ring — Instagram-style active indicator (shared component) */}
        <GradientRing isActive={isActive} strokeWidth={2} borderRadius={Radius.xl + 2}>
          <View
            style={[
              styles.layoutPreview,
              isActive && styles.layoutPreviewActive,
            ]}
          >
            <LayoutPreview type={layout.type} />
          </View>
        </GradientRing>
        <Text style={[styles.layoutLabel, isActive && styles.layoutLabelActive]}>
          {layout.label}
        </Text>
      </AnimatedPressable>
    </Reanimated.View>
  );
});

export default function LayoutPicker({
  visible,
  currentLayout,
  onSelect,
  onClose }: LayoutPickerProps) {
  const reducedMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  const haptic = useHaptic();
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // Drawer slide-up + backdrop fade (Reanimated)
  const translateY = useSharedValue(DRAWER_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const contentOpacity = useSharedValue(0);
  const scrollRef = React.useRef<ScrollView>(null);

  // Track which layout index to snap to when visible
  React.useEffect(() => {
    if (visible) {
      const activeIndex = LAYOUTS.findIndex((l) => l.type === currentLayout);
      if (activeIndex >= 0) {
        // Snap after a short delay to let the drawer animate in
        setTimeout(() => {
          scrollRef.current?.scrollTo({
            x: Math.max(0, activeIndex * SNAP_INTERVAL - (SCREEN_W - THUMB_SIZE) / 2),
            animated: true });
        }, 300);
      }
    }
  }, [visible, currentLayout]);

  React.useEffect(() => {
    if (visible) {
      if (reducedMotion) {
        translateY.value = 0;
        backdropOpacity.value = 1;
        contentOpacity.value = 1;
      } else {
        translateY.value = withSpring(0, spring.entrance);
        backdropOpacity.value = withTiming(1, { duration: 200 });
        contentOpacity.value = withDelay(100, withTiming(1, { duration: 200 }));
      }
    } else {
      if (reducedMotion) {
        translateY.value = DRAWER_HEIGHT;
        backdropOpacity.value = 0;
        contentOpacity.value = 0;
      } else {
        translateY.value = withSpring(DRAWER_HEIGHT, spring.entrance);
        backdropOpacity.value = withTiming(0, { duration: 150 });
        contentOpacity.value = withTiming(0, { duration: 100 });
      }
    }
  }, [visible, reducedMotion, spring.entrance, translateY, backdropOpacity, contentOpacity]);

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }] }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value }));

  const handleClose = React.useCallback(() => {
    haptic.light();
    onClose();
  }, [haptic, onClose]);

  const entranceProgress = useSharedValue(0);

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
          accessibilityLabel="Close layout picker"
          accessibilityRole="button"
        />
      </Reanimated.View>

      {/* Drawer */}
      <Reanimated.View style={[styles.drawer, drawerStyle]}>
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>

        <Text style={styles.title}>Layout</Text>

        {/* Horizontal scroll with snap-to-position */}
        <Reanimated.View style={contentStyle}>
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={SNAP_INTERVAL}
            snapToAlignment="center"
            decelerationRate="fast"
            contentContainerStyle={styles.scrollContent}
            accessibilityRole="list"
            accessibilityLabel="Layout options"
          >
            {LAYOUTS.map((layout, index) => (
              <LayoutCard
                key={layout.type}
                layout={layout}
                isActive={currentLayout === layout.type}
                index={index}
                reducedMotion={reducedMotion}
                entranceProgress={entranceProgress}
                onSelect={onSelect}
                onClose={onClose}
              />
            ))}
          </ScrollView>
        </Reanimated.View>
      </Reanimated.View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.overlay },
    drawer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: DRAWER_HEIGHT,
      backgroundColor: colors.surface,
      borderTopLeftRadius: Radius.xxl,
      borderTopRightRadius: Radius.xxl,
      overflow: 'hidden',
      paddingBottom: Space.lg },
    handleRow: {
      alignItems: 'center',
      paddingTop: 10,
      paddingBottom: 6 },
    handle: {
      width: 36,
      height: 4,
      borderRadius: Radius.sm,
      backgroundColor: colors.glassBorder },
    title: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      color: colors.scrimTextPrimary,
      textAlign: 'center',
      marginBottom: Space.md },
    scrollContent: {
      flexDirection: 'row',
      gap: THUMB_GAP,
      paddingHorizontal: (SCREEN_W - THUMB_SIZE) / 2,
      paddingVertical: Space.sm },
    layoutCard: {
      width: THUMB_SIZE,
      alignItems: 'center',
      gap: 8 },
    layoutPreview: {
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      borderRadius: Radius.xl,
      borderWidth: Stroke.standard,
      borderColor: colors.glassBorder,
      backgroundColor: colors.glassBorder,
      padding: Space.xs,
      overflow: 'hidden' },
    layoutPreviewActive: {
      borderColor: 'transparent',
      backgroundColor: colors.glassBorder },
    layoutLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.scrimTextSecondary },
    layoutLabelActive: {
      color: colors.scrimTextPrimary } });
}
