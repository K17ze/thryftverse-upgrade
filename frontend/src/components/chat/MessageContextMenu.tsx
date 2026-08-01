import React from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { Caption, BodyEmphasis } from '../ui/Text';
import { deriveMessageActions } from '../../utils/messageContextMenuCapabilities';
import type { ActionDef } from '../../utils/messageContextMenuCapabilities';

export type MessageAction = 'copy' | 'reply' | 'react' | 'delete' | 'retry' | 'report' | 'translate';

interface MessageContextMenuProps {
  visible: boolean;
  onClose: () => void;
  onAction: (action: MessageAction) => void;
  messageText?: string;
  isOwnMessage?: boolean;
  isFailed?: boolean;
  isTranslated?: boolean;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export function MessageContextMenu({
  visible,
  onClose,
  onAction,
  messageText,
  isOwnMessage,
  isFailed,
  isTranslated,
}: MessageContextMenuProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const actions = React.useMemo<ActionDef[]>(() => {
    return deriveMessageActions({
      isOwnMessage: Boolean(isOwnMessage),
      isFailed: Boolean(isFailed),
      messageText,
      isTranslated: Boolean(isTranslated),
    });
  }, [messageText, isOwnMessage, isFailed, isTranslated]);
  const slideAnim = React.useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          friction: 8,
          tension: 40,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleAction = (action: MessageAction) => {
    onAction(action);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
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
                  name={action.icon as any}
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
          accessibilityLabel="Cancel"
          activeOpacity={0.7}
          scaleValue={0.98}
          hapticFeedback="light"
        >
          <BodyEmphasis color={colors.textPrimary}>Cancel</BodyEmphasis>
        </AnimatedPressable>
      </Animated.View>
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
    paddingTop: Space.sm + 4,
    paddingBottom: Space.xl + 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 12,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Space.md,
  },
  previewRow: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.lg,
    padding: Space.sm + 4,
    marginBottom: Space.sm + 4,
  },
  actionsList: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginBottom: Space.sm + 4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 4,
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
