import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Elevation } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { Caption, BodyEmphasis } from '../ui/Text';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export type AttachmentType = 'gallery' | 'camera' | 'file' | 'location';

interface AttachmentOption {
  id: AttachmentType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

const OPTIONS: AttachmentOption[] = [
  { id: 'gallery', label: 'Photo & Video', icon: 'images-outline', color: '#3B82F6' },
  { id: 'camera', label: 'Camera', icon: 'camera-outline', color: '#10B981' },
  { id: 'file', label: 'File', icon: 'document-outline', color: '#8B5CF6' },
  { id: 'location', label: 'Location', icon: 'location-outline', color: '#EF4444' },
];

interface AttachmentPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (type: AttachmentType) => void;
}

export function AttachmentPickerSheet({ visible, onClose, onSelect }: AttachmentPickerSheetProps) {
  const reducedMotion = useReducedMotion();
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const opacity = useSharedValue(0);
  const [rendered, setRendered] = React.useState(visible);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      opacity.value = withTiming(1, { duration: 180 });
      translateY.value = withSpring(0, { damping: 22, stiffness: 200 });
    } else if (rendered) {
      opacity.value = withTiming(0, { duration: 150 });
      translateY.value = withTiming(SCREEN_HEIGHT * 0.5, { duration: 200 });
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
        translateY.value = withSpring(0, { damping: 22, stiffness: 200 });
      }
    });

  const handleSelect = (type: AttachmentType) => {
    onSelect(type);
    onClose();
  };

  if (!rendered) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Reanimated.View style={[styles.backdrop, backdropStyle]}>
        <AnimatedPressable style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} disableAnimation />
      </Reanimated.View>

      <GestureDetector gesture={gesture}>
        <Reanimated.View style={[styles.sheet, sheetStyle]}>
          <View style={styles.handle} />

          <View style={styles.optionsGrid}>
            {OPTIONS.map((opt) => (
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
                <View style={[styles.iconCircle, { backgroundColor: `${opt.color}18` }]}>
                  <Ionicons name={opt.icon} size={24} color={opt.color} />
                </View>
                <Caption color={Colors.textPrimary} style={styles.optionLabel}>{opt.label}</Caption>
              </AnimatedPressable>
            ))}
          </View>

          <AnimatedPressable
            style={styles.cancelBtn}
            onPress={onClose}
            activeOpacity={0.8}
            scaleValue={0.98}
            hapticFeedback="light"
          >
            <BodyEmphasis color={Colors.textPrimary}>Cancel</BodyEmphasis>
          </AnimatedPressable>
        </Reanimated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 900,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl + 8,
    borderTopRightRadius: Radius.xl + 8,
    paddingHorizontal: Space.lg - 4,
    paddingTop: Space.sm + 4,
    paddingBottom: Space.xl + 20,
    ...Elevation.modal,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
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
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionLabel: {
    fontSize: 11,
    textAlign: 'center',
  },
  cancelBtn: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.lg,
    paddingVertical: Space.md,
    alignItems: 'center',
    marginTop: Space.sm,
  },
});
