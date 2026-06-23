import React, { useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  Pressable,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHaptic } from '../hooks/useHaptic';
import { Colors } from '../constants/colors';
import { Motion } from '../constants/motion';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_BG = Colors.surface;
const HANDLE_BG = Colors.textMuted + '80'; // 50% opacity

interface BottomSheetProps {
  visible: boolean;
  onDismiss: () => void;
  children: React.ReactNode;
  snapPoint?: number; // percentage of screen height (default 0.55)
  /** Blur intensity on backdrop (0-100, default 25) */
  blurIntensity?: number;
  /** Spring damping for open/close (default 18) */
  springDamping?: number;
}

export function BottomSheet({
  visible,
  onDismiss,
  children,
  snapPoint = 0.55,
  blurIntensity = 25,
  springDamping = 18,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const sheetHeight = SCREEN_HEIGHT * snapPoint;
  const translateY = useSharedValue(sheetHeight);
  const backdropOpacity = useSharedValue(0);
  const contextY = useSharedValue(0);

  const open = useCallback(() => {
    translateY.value = withSpring(0, {
      damping: springDamping,
      stiffness: 260,
    });
    backdropOpacity.value = withTiming(1, { duration: 250 });
  }, [translateY, backdropOpacity, springDamping]);

  const close = useCallback(() => {
    translateY.value = withSpring(sheetHeight, {
      damping: springDamping,
      stiffness: 260,
    });
    backdropOpacity.value = withTiming(0, { duration: 200 });
    // Call onDismiss after close animation
    const t = setTimeout(() => runOnJS(onDismiss)(), 280);
    return () => clearTimeout(t);
  }, [translateY, backdropOpacity, sheetHeight, onDismiss, springDamping]);

  useEffect(() => {
    if (visible) {
      open();
    } else {
      translateY.value = sheetHeight;
      backdropOpacity.value = 0;
    }
  }, [visible, open, translateY, backdropOpacity, sheetHeight]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [visible, close]);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      contextY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateY.value = Math.max(0, contextY.value + e.translationY);
    })
    .onEnd((e) => {
      const threshold = sheetHeight * 0.35;
      const shouldClose = translateY.value > threshold || e.velocityY > 600;

      if (shouldClose) {
        runOnJS(haptic.medium)();
        runOnJS(close)();
      } else {
        // Snap back to open with spring
        translateY.value = withSpring(0, Motion.spring.flagship);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
    pointerEvents: backdropOpacity.value > 0.01 ? 'auto' : 'none',
  }));

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop with blur */}
      <Reanimated.View style={[styles.backdrop, backdropStyle]}>
        <BlurView
          intensity={blurIntensity}
          tint={Colors.background === '#FFFFFF' ? 'light' : 'dark'}
          style={StyleSheet.absoluteFill}
        />
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      </Reanimated.View>

      {/* Sheet */}
      <GestureDetector gesture={panGesture}>
        <Reanimated.View
          style={[
            styles.sheet,
            {
              height: sheetHeight + insets.bottom,
              paddingBottom: insets.bottom,
            },
            sheetStyle,
          ]}
        >
          {/* Drag handle */}
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.contentWrap}
          >
            {children}
          </KeyboardAvoidingView>
        </Reanimated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: SHEET_BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    // iOS native sheet shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 24,
    // Subtle top border for glass separation
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 8,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: HANDLE_BG,
  },
  contentWrap: {
    flex: 1,
    paddingHorizontal: 20,
  },
});