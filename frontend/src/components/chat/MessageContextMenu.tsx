import React from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Elevation } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { Caption, BodyEmphasis } from '../ui/Text';
import { deriveMessageActions } from '../../utils/messageContextMenuCapabilities';
import type { ActionDef } from '../../utils/messageContextMenuCapabilities';
import { Motion } from '../../theme/motionTokens';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useAppTranslation } from '../../i18n/useAppTranslation';

export type MessageAction = 'copy' | 'reply' | 'react' | 'askAgent' | 'edit' | 'delete' | 'retry' | 'report';

interface MessageContextMenuProps {
  visible: boolean;
  onClose: () => void;
  onAction: (action: MessageAction) => void;
  messageText?: string;
  isOwnMessage?: boolean;
  isFailed?: boolean;
  /** P2-03: Whether the message is still within the edit window. */
  canEdit?: boolean;
}

export function MessageContextMenu({
  visible,
  onClose,
  onAction,
  messageText,
  isOwnMessage,
  isFailed,
  canEdit,
}: MessageContextMenuProps) {
  const { colors } = useAppTheme();
  const { t } = useAppTranslation('messaging');
  const reducedMotion = useReducedMotion();
  const { height: screenHeight } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const actions = React.useMemo<ActionDef[]>(() => {
    return deriveMessageActions({
      isOwnMessage: Boolean(isOwnMessage),
      isFailed: Boolean(isFailed),
      messageText,
      canEdit: Boolean(canEdit),
    });
  }, [messageText, isOwnMessage, isFailed, canEdit]);
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
  }, [visible, reducedMotion, screenHeight]);

  const handleAction = (action: MessageAction) => {
    onAction(action);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
          <AnimatedPressable style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={styles.handle} />

          {messageText ? (
            <View style={styles.previewRow}>
              <Caption color={colors.textSecondary} numberOfLines={2}>
                {messageText}
              </Caption>
            </View>
          ) : null}

          <View style={styles.actionsList}>
            {actions.map((action, index) => (
              <React.Fragment key={action.id}>
                {action.destructive && index > 0 && <View style={styles.destructiveDivider} />}
                <AnimatedPressable
                  style={styles.actionRow}
                  onPress={() => handleAction(action.id)}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  activeOpacity={0.7}
                  scaleValue={0.98}
                  hapticFeedback="light"
                >
                  <Ionicons
                    name={action.icon}
                    size={22}
                    color={action.destructive ? colors.danger : colors.textPrimary}
                  />
                  <BodyEmphasis
                    color={action.destructive ? colors.danger : colors.textPrimary}
                    style={styles.actionLabel}
                  >
                    {action.label}
                  </BodyEmphasis>
                </AnimatedPressable>
              </React.Fragment>
            ))}
          </View>

          <AnimatedPressable
            style={styles.cancelBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            activeOpacity={0.7}
            scaleValue={0.98}
            hapticFeedback="light"
          >
            <BodyEmphasis color={colors.textPrimary}>{t('common.cancel')}</BodyEmphasis>
          </AnimatedPressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
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
  previewRow: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.lg,
    padding: Space.smMd,
    marginBottom: Space.smMd,
  },
  actionsList: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginBottom: Space.smMd,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.smMd,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  actionLabel: {
    flex: 1,
  },
  cancelBtn: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.lg,
    paddingVertical: Space.md,
    alignItems: 'center',
  },
  destructiveDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: Space.md,
  },
});
