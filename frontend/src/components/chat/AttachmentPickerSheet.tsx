import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Elevation, Type } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { Caption, BodyEmphasis } from '../ui/Text';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { Motion } from '../../theme/motionTokens';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export type AttachmentType =
  | 'gallery'
  | 'camera'
  | 'file'
  | 'location'
  | 'offer'
  | 'shareListing'
  | 'shareOrder'
  | 'requestPayment'
  | 'inviteBot'
  | 'report';

interface AttachmentOption {
  id: AttachmentType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  colorKey: 'brand' | 'success' | 'warning' | 'discovery' | 'social' | 'danger';
}

const OPTIONS: AttachmentOption[] = [
  { id: 'gallery', label: 'Photo & Video', icon: 'images-outline', colorKey: 'brand' },
  { id: 'camera', label: 'Camera', icon: 'camera-outline', colorKey: 'success' },
  { id: 'offer', label: 'Make Offer', icon: 'pricetag-outline', colorKey: 'warning' },
  { id: 'shareListing', label: 'Share Listing', icon: 'share-outline', colorKey: 'discovery' },
  { id: 'shareOrder', label: 'Order Status', icon: 'cube-outline', colorKey: 'brand' },
  { id: 'requestPayment', label: 'Payment', icon: 'card-outline', colorKey: 'success' },
  { id: 'inviteBot', label: 'Agent', icon: 'hardware-chip-outline', colorKey: 'social' },
  { id: 'report', label: 'Report', icon: 'flag-outline', colorKey: 'danger' },
];

interface AttachmentPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (type: AttachmentType) => void;
  isGroup?: boolean;
  hasLinkedItem?: boolean;
  hasLinkedOrder?: boolean;
}

export function AttachmentPickerSheet({ visible, onClose, onSelect, isGroup = false, hasLinkedItem = false, hasLinkedOrder = false }: AttachmentPickerSheetProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const opacity = useSharedValue(0);
  const [rendered, setRendered] = React.useState(visible);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      opacity.value = withTiming(1, { duration: Motion.duration.normal });
      translateY.value = withTiming(0, { duration: Motion.duration.slow, easing: Easing.out(Easing.cubic) });
    } else if (rendered) {
      opacity.value = withTiming(0, { duration: Motion.duration.fast });
      translateY.value = withTiming(SCREEN_HEIGHT * 0.5, { duration: Motion.duration.normal });
      setTimeout(() => setRendered(false), 220);
    }
  }, [visible, rendered, opacity, translateY, reducedMotion]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const gesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY > 100 || e.velocityY > 600) {
        runOnJS(onClose)();
      } else {
        translateY.value = withTiming(0, { duration: Motion.duration.slow, easing: Easing.out(Easing.cubic) });
      }
    });

  const handleSelect = (type: AttachmentType) => {
    onSelect(type);
    onClose();
  };

  const visibleOptions = OPTIONS.filter((opt) => {
    if (opt.id === 'inviteBot') return isGroup;
    if (opt.id === 'offer' || opt.id === 'shareListing') return hasLinkedItem;
    if (opt.id === 'shareOrder' || opt.id === 'requestPayment') return hasLinkedOrder;
    return true;
  });

  if (!rendered) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Reanimated.View style={[styles.backdrop, { backgroundColor: colors.overlay }, backdropStyle]}>
        <AnimatedPressable style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} disableAnimation />
      </Reanimated.View>

      <GestureDetector gesture={gesture}>
        <Reanimated.View style={[styles.sheet, { backgroundColor: colors.surfaceAlt }, sheetStyle]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <View style={styles.optionsGrid}>
            {visibleOptions.map((opt) => (
              <AnimatedPressable
                key={opt.id}
                style={styles.optionBtn}
                onPress={() => handleSelect(opt.id)}
                activeOpacity={0.8}
                scaleValue={0.92}
                hapticFeedback="light"
                accessibilityRole="button"
                accessibilityLabel={opt.label}
              >
                <View style={[styles.iconCircle, { backgroundColor: colors[opt.colorKey] + '18' }]}>
                  <Ionicons name={opt.icon} size={24} color={colors[opt.colorKey]} />
                </View>
                <Caption color={colors.textPrimary} style={styles.optionLabel}>{opt.label}</Caption>
              </AnimatedPressable>
            ))}
          </View>

          <AnimatedPressable
            style={[styles.cancelBtn, { backgroundColor: colors.surfaceAlt }]}
            onPress={onClose}
            activeOpacity={0.8}
            scaleValue={0.98}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <BodyEmphasis color={colors.textPrimary}>Cancel</BodyEmphasis>
          </AnimatedPressable>
        </Reanimated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 900,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    borderTopLeftRadius: Radius.xl + 8,
    borderTopRightRadius: Radius.xl + 8,
    paddingHorizontal: Space.lg - 4,
    paddingTop: Space.smMd,
    paddingBottom: Space.xl + 20,
    ...Elevation.modal,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: Radius.full,
    alignSelf: 'center',
    marginBottom: Space.md,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: Space.md,
  },
  optionBtn: {
    width: '23%',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    minHeight: 44,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionLabel: {
    fontSize: Type.meta.size,
    textAlign: 'center',
  },
  cancelBtn: {
    borderRadius: Radius.lg,
    paddingVertical: Space.md,
    alignItems: 'center',
    marginTop: Space.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
});
