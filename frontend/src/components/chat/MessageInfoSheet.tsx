import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Elevation } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { Caption, BodyEmphasis } from '../ui/Text';
import { AppIcon } from '../common/AppIcon';
import { Motion } from '../../theme/motionTokens';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import type { Message } from '../../hooks/chat/types';

interface MessageInfoSheetProps {
  visible: boolean;
  message: Message | null;
  onClose: () => void;
}

/**
 * MessageInfoSheet — WhatsApp-style message info sheet showing delivery
 * and read status for the user's own messages.
 *
 * Shows:
 * - Message preview (truncated)
 * - Sent time
 * - Current status (sending/sent/delivered/read/failed)
 *
 * Visual language:
 * - Bottom sheet with grab handle
 * - Message preview at top
 * - Status rows with icons and timestamps
 */
export function MessageInfoSheet({
  visible,
  message,
  onClose,
}: MessageInfoSheetProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const { height: screenHeight } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const slideAnim = React.useRef(new Animated.Value(screenHeight)).current;
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      if (reducedMotion) {
        fadeAnim.setValue(1);
        slideAnim.setValue(0);
      } else {
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: Motion.duration.fast,
            useNativeDriver: true,
          }),
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
            damping: Motion.spring.sheet.damping,
            stiffness: Motion.spring.sheet.stiffness,
            mass: Motion.spring.sheet.mass,
          }),
        ]).start();
      }
    } else {
      if (reducedMotion) {
        fadeAnim.setValue(0);
        slideAnim.setValue(screenHeight);
      } else {
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: Motion.duration.fast,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: screenHeight,
            duration: Motion.duration.slow,
            useNativeDriver: true,
          }),
        ]).start();
      }
    }
  }, [visible, reducedMotion, screenHeight, fadeAnim, slideAnim]);

  const statusInfo = useMemo(() => {
    if (!message) return null;
    const status = message.status;
    const readStatus = message.readStatus;

    if (status === 'sending') {
      return { label: 'Sending…', icon: 'time-outline' as const, color: colors.textMuted };
    }
    if (status === 'failed') {
      return { label: 'Failed to send', icon: 'alert-circle-outline' as const, color: colors.danger };
    }
    if (readStatus === 'read') {
      return { label: 'Read', icon: 'checkmark-done' as const, color: colors.brand };
    }
    if (readStatus === 'delivered') {
      return { label: 'Delivered', icon: 'checkmark-done' as const, color: colors.textMuted };
    }
    return { label: 'Sent', icon: 'checkmark' as const, color: colors.textMuted };
  }, [message, colors]);

  if (!visible || !message) return null;

  const formattedTime = message.date
    ? new Date(message.date).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
          <AnimatedPressable style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        </Animated.View>

        <Animated.View
          style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
        >
          <View style={styles.handle} />

          <BodyEmphasis color={colors.textPrimary} style={styles.title}>
            Message info
          </BodyEmphasis>

          {message.text ? (
            <View style={styles.previewWrap}>
              <Caption color={colors.textSecondary} numberOfLines={3}>
                {message.text}
              </Caption>
            </View>
          ) : null}

          <View style={styles.statusList}>
            {formattedTime ? (
              <View style={styles.statusRow}>
                <AppIcon name="time-outline" size={20} color={colors.textMuted} />
                <View style={styles.statusInfo}>
                  <BodyEmphasis color={colors.textPrimary}>Sent</BodyEmphasis>
                  <Caption color={colors.textMuted}>{formattedTime}</Caption>
                </View>
              </View>
            ) : null}

            {statusInfo ? (
              <View style={styles.statusRow}>
                <AppIcon name={statusInfo.icon} size={20} color={statusInfo.color} />
                <View style={styles.statusInfo}>
                  <BodyEmphasis color={statusInfo.color}>{statusInfo.label}</BodyEmphasis>
                  {message.readStatus === 'read' && formattedTime ? (
                    <Caption color={colors.textMuted}>Read at {formattedTime}</Caption>
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>

          <AnimatedPressable
            style={styles.closeBtn}
            onPress={onClose}
            activeOpacity={0.7}
            scaleValue={0.98}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <BodyEmphasis color={colors.textPrimary}>Close</BodyEmphasis>
          </AnimatedPressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.overlay,
    },
    sheet: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.surface,
      borderTopLeftRadius: Radius.xl + 8,
      borderTopRightRadius: Radius.xl + 8,
      paddingHorizontal: Space.lg - 4,
      paddingTop: Space.smMd,
      paddingBottom: Space.xl + 14,
      ...Elevation.floating,
    },
    handle: {
      width: 40,
      height: 4,
      backgroundColor: colors.border,
      borderRadius: Radius.sm,
      alignSelf: 'center',
      marginBottom: Space.md,
    },
    title: {
      marginBottom: Space.sm,
    },
    previewWrap: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.lg,
      padding: Space.smMd,
      marginBottom: Space.md,
    },
    statusList: {
      gap: Space.md,
      marginBottom: Space.md,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.smMd,
    },
    statusInfo: {
      flex: 1,
      gap: 2,
    },
    closeBtn: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.lg,
      paddingVertical: Space.md,
      alignItems: 'center',
    },
  });
