import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useToast, ToastType } from '../context/ToastContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedPressable } from './AnimatedPressable';
import { Typography, Radius, Space, Type } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS, Easing } from 'react-native-reanimated';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Motion } from '../theme/motionTokens';
import { BottomSheet } from './BottomSheet';
import { AppButton } from './ui/AppButton';
import { useHaptic } from '../hooks/useHaptic';
import {
  setSoftAskPresenter,
  SOFT_ASK_COPY,
  type PushPermissionContext,
} from '../lib/pushPermission';

// Info toast uses a warm brand-gold accent (#d7b98f) — a ThryftVerse signature color
// not yet in the token system. Success and error use theme tokens.
const INFO_ACCENT = '#d7b98f';

function getTypeConfig(colors: ReturnType<typeof useAppTheme>['colors']): Record<ToastType, { borderColor: string; icon: keyof typeof Ionicons.glyphMap; iconColor: string }> {
  return {
    success: { borderColor: colors.success, icon: 'checkmark-circle', iconColor: colors.success },
    error: { borderColor: colors.danger, icon: 'alert-circle', iconColor: colors.danger },
    info: { borderColor: INFO_ACCENT, icon: 'information-circle', iconColor: INFO_ACCENT },
  };
}

interface ToastItemProps {
  id: string;
  message: string;
  type: ToastType;
}

function ToastItem({ id, message, type }: ToastItemProps) {
  const { dismiss } = useToast();
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const config = getTypeConfig(colors)[type];

  const translateY = useSharedValue(-60);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateY.value = withTiming(0, { duration: reducedMotion ? 0 : Motion.duration.slow, easing: Easing.out(Easing.quad) });
    opacity.value = withTiming(1, { duration: reducedMotion ? 0 : Motion.duration.fast });

    const timer = setTimeout(() => {
      handleDismiss();
    }, 3200);

    return () => clearTimeout(timer);
  }, [reducedMotion]);

  const handleDismiss = () => {
    translateY.value = withTiming(-60, { duration: reducedMotion ? 0 : Motion.duration.slow });
    opacity.value = withTiming(0, { duration: reducedMotion ? 0 : Motion.duration.normal }, (finished) => {
      if (finished) {
        runOnJS(dismiss)(id);
      }
    });
  };

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Reanimated.View style={[styles.toast, { borderLeftColor: config.borderColor }, animStyle]}>
      <Ionicons name={config.icon} size={20} color={config.iconColor} />
      <Text style={styles.message} numberOfLines={2}>{message}</Text>
      <AnimatedPressable
        onPress={handleDismiss}
        style={styles.closeBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        disableAnimation
        activeOpacity={1}
      >
        <Ionicons name="close" size={16} color="#888" />
      </AnimatedPressable>
    </Reanimated.View>
  );
}

export function ToastContainer() {
  const { toasts } = useToast();
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  return (
    <View style={[styles.container, { top: insets.top + 12 }]} pointerEvents="box-none">
      {toasts.map(t => (
        <ToastItem key={t.id} {...t} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    gap: 8,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    // Toast is always dark with warm tint — intentional design for transient overlay
    backgroundColor: '#191714',
    borderRadius: Radius.xl,
    paddingHorizontal: Space.md,
    paddingVertical: 14,
    borderLeftWidth: 4,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  message: {
    flex: 1,
    fontSize: Typography.size.body,
    fontFamily: Typography.family.medium,
    // Warm off-white text on always-dark toast — intentional
    color: '#f3ede3',
    letterSpacing: Typography.tracking.normal,
    lineHeight: 19,
  },
  closeBtn: {
    padding: 2,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Push permission soft-ask pre-prompt (flagship research §M4 / §2)
//
// A designed in-app sheet that explains the value of push notifications before
// the one-shot OS prompt fires. The overlay registers a presenter with the
// pushPermission module on mount; contextual flows call
// `requestPushPermissionWithSoftAsk` which routes through this sheet. Only on
// "Allow" does the OS prompt fire — "Not now" preserves the one-shot prompt
// for a future contextual moment.
//
// Design (AGENTS.md §4): flat composition, one dominant panel (the sheet
// itself), max two non-avatar radii (sheet corners + button radius), max three
// type sizes (title / body / button), no decorative chrome — a single
// notifications glyph anchors the prompt without a container.
// ─────────────────────────────────────────────────────────────────────────────

interface SoftAskState {
  context: PushPermissionContext;
  resolve: (accepted: boolean) => void;
}

export function PushSoftAskOverlay() {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const [state, setState] = React.useState<SoftAskState | null>(null);

  React.useEffect(() => {
    // Register the app-wide soft-ask presenter. The promise resolves with the
    // user's conceptual consent; only an "Allow" resolution triggers the OS
    // prompt inside requestPushPermissionWithSoftAsk.
    setSoftAskPresenter(
      (context) =>
        new Promise<boolean>((resolve) => {
          setState({ context, resolve });
        }),
    );
    return () => setSoftAskPresenter(null);
  }, []);

  const close = React.useCallback(
    (accepted: boolean) => {
      haptic.selection();
      setState((prev) => {
        prev?.resolve(accepted);
        return null;
      });
    },
    [haptic],
  );

  const copy = state ? SOFT_ASK_COPY[state.context] : null;

  return (
    <BottomSheet
      visible={state !== null}
      onDismiss={() => close(false)}
      snapPoint={0.42}
      variant="system"
      topRadius={Radius.xl}
    >
      {copy ? (
        <View style={softAskStyles.content}>
          <Ionicons
            name="notifications-outline"
            size={28}
            color={colors.brand}
            style={softAskStyles.icon}
          />
          <Text style={[softAskStyles.title, { color: colors.textPrimary }]}>
            {copy.title}
          </Text>
          <Text style={[softAskStyles.body, { color: colors.textSecondary }]}>
            {copy.body}
          </Text>
          <View style={softAskStyles.actions}>
            <AppButton
              title="Allow"
              variant="primary"
              size="md"
              onPress={() => close(true)}
              accessibilityLabel="Allow push notifications"
              accessibilityHint="Shows the system permission prompt"
              style={softAskStyles.allowBtn}
            />
            <AppButton
              title="Not now"
              variant="ghost"
              size="md"
              onPress={() => close(false)}
              accessibilityLabel="Skip push notifications for now"
              accessibilityHint="Asks again at a later moment"
            />
          </View>
        </View>
      ) : null}
    </BottomSheet>
  );
}

const softAskStyles = StyleSheet.create({
  content: {
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.lg,
    gap: Space.sm,
  },
  icon: {
    marginBottom: Space.xs,
  },
  title: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.subtitle.letterSpacing,
    textAlign: 'center',
  },
  body: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.body.lineHeight,
    textAlign: 'center',
    paddingHorizontal: Space.sm,
  },
  actions: {
    width: '100%',
    marginTop: Space.md,
    gap: Space.sm,
    alignItems: 'center',
  },
  allowBtn: {
    width: '100%',
  },
});
