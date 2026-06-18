import React from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { Caption, BodyEmphasis } from '../ui/Text';

export type MessageAction = 'copy' | 'reply' | 'react' | 'delete' | 'select';

interface MessageContextMenuProps {
  visible: boolean;
  onClose: () => void;
  onAction: (action: MessageAction) => void;
  messageText?: string;
}

const ACTIONS: Array<{
  id: MessageAction;
  label: string;
  icon: string;
  color?: string;
  destructive?: boolean;
}> = [
  { id: 'select', label: 'Select', icon: 'checkbox-outline' },
  { id: 'reply', label: 'Reply', icon: 'arrow-undo-outline' },
  { id: 'react', label: 'React', icon: 'happy-outline' },
  { id: 'copy', label: 'Copy', icon: 'copy-outline' },
  { id: 'delete', label: 'Delete', icon: 'trash-outline', color: Colors.danger, destructive: true },
];

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export function MessageContextMenu({
  visible,
  onClose,
  onAction,
  messageText,
}: MessageContextMenuProps) {
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
            <Caption color={Colors.textSecondary} numberOfLines={2}>
              {messageText}
            </Caption>
          </View>
        ) : null}

        <View style={styles.actionsList}>
          {ACTIONS.map((action) => (
            <AnimatedPressable
              key={action.id}
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
                color={action.destructive ? Colors.danger : Colors.textPrimary}
              />
              <BodyEmphasis
                color={action.destructive ? Colors.danger : Colors.textPrimary}
                style={styles.actionLabel}
              >
                {action.label}
              </BodyEmphasis>
            </AnimatedPressable>
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
          <BodyEmphasis color={Colors.textPrimary}>Cancel</BodyEmphasis>
        </AnimatedPressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.surfaceAlt,
    borderTopLeftRadius: Radius.xl + 8,
    borderTopRightRadius: Radius.xl + 8,
    paddingHorizontal: Space.lg - 4,
    paddingTop: Space.sm + 4,
    paddingBottom: Space.xl + 14,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Space.md,
  },
  previewRow: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.lg,
    padding: Space.sm + 4,
    marginBottom: Space.sm + 4,
  },
  actionsList: {
    backgroundColor: Colors.surfaceAlt,
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
    borderBottomColor: Colors.border,
  },
  actionLabel: {
    flex: 1,
  },
  cancelBtn: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.lg,
    paddingVertical: Space.md,
    alignItems: 'center',
  },
});