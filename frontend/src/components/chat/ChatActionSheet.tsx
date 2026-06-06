import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';

export type ChatAction =
  | 'gallery'
  | 'camera'
  | 'report'
  | 'makeOffer'
  | 'shareListing'
  | 'orderStatus'
  | 'bot'
  | 'groupInfo';

interface ChatActionSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (action: ChatAction) => void;
  isGroup?: boolean;
  hasLinkedItem?: boolean;
  hasOrder?: boolean;
}

interface ActionDef {
  id: ChatAction;
  icon: string;
  label: string;
  tint?: string;
}

export function ChatActionSheet({
  visible,
  onClose,
  onSelect,
  isGroup,
  hasLinkedItem,
  hasOrder,
}: ChatActionSheetProps) {
  const actions = useMemo(() => {
    const list: ActionDef[] = [];

    // Media — always available
    list.push(
      { id: 'gallery', icon: 'images-outline', label: 'Photo / Video' },
      { id: 'camera', icon: 'camera-outline', label: 'Camera' }
    );

    // Group-specific
    if (isGroup) {
      list.push({ id: 'bot', icon: 'hardware-chip-outline', label: 'Bots' });
      list.push({ id: 'groupInfo', icon: 'people-outline', label: 'Group info' });
    }

    // Linked item
    if (hasLinkedItem && !isGroup) {
      list.push({ id: 'makeOffer', icon: 'pricetag-outline', label: 'Make offer' });
      list.push({ id: 'shareListing', icon: 'share-outline', label: 'Share listing' });
    }

    // Order-linked
    if (hasOrder && !isGroup) {
      list.push({ id: 'orderStatus', icon: 'cube-outline', label: 'Order status' });
    }

    // Report — available everywhere
    list.push({ id: 'report', icon: 'flag-outline', label: 'Report', tint: Colors.danger });

    return list;
  }, [isGroup, hasLinkedItem, hasOrder]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>
            {isGroup ? 'Group actions' : 'Add to message'}
          </Text>

          <View style={styles.grid}>
            {actions.map((action) => (
              <AnimatedPressable
                key={action.id}
                style={styles.actionBtn}
                onPress={() => {
                  onSelect(action.id);
                  onClose();
                }}
                activeOpacity={0.7}
                scaleValue={0.95}
                hapticFeedback="light"
                accessibilityRole="button"
                accessibilityLabel={action.label}
              >
                <View style={[styles.iconCircle, action.tint ? { backgroundColor: action.tint + '12' } : undefined]}>
                  <Ionicons
                    name={action.icon as any}
                    size={24}
                    color={action.tint || Colors.textPrimary}
                  />
                </View>
                <Text style={[styles.actionLabel, action.tint ? { color: action.tint } : undefined]}>
                  {action.label}
                </Text>
              </AnimatedPressable>
            ))}
          </View>

          <AnimatedPressable
            style={styles.cancelBtn}
            onPress={onClose}
            activeOpacity={0.7}
            scaleValue={0.98}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </AnimatedPressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xxl,
    gap: Space.md,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: Space.sm,
  },
  title: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Space.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.md,
    justifyContent: 'flex-start',
    paddingVertical: Space.sm,
  },
  actionBtn: {
    alignItems: 'center',
    gap: Space.xs,
    minWidth: 72,
    flex: 1,
    maxWidth: '25%',
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  cancelBtn: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: Space.sm,
  },
  cancelText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
});
