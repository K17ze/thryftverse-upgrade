import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';

export type ChatAction = 'gallery' | 'camera';

interface ChatActionSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (action: ChatAction) => void;
}

interface ActionDef {
  id: ChatAction;
  icon: string;
  label: string;
  description: string;
}

export function ChatActionSheet({
  visible,
  onClose,
  onSelect,
}: ChatActionSheetProps) {
  const actions = useMemo<ActionDef[]>(() => [
    {
      id: 'gallery',
      icon: 'images-outline',
      label: 'Photo & Video',
      description: 'Choose from your library',
    },
    {
      id: 'camera',
      icon: 'camera-outline',
      label: 'Camera',
      description: 'Take a new photo or video',
    },
  ], []);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Attach</Text>
            <Text style={styles.subtitle}>Share photos and videos in this chat</Text>
          </View>

          <View style={styles.list}>
            {actions.map((action) => (
              <AnimatedPressable
                key={action.id}
                style={styles.row}
                onPress={() => {
                  onSelect(action.id);
                  onClose();
                }}
                activeOpacity={0.7}
                scaleValue={0.98}
                hapticFeedback="light"
                accessibilityRole="button"
                accessibilityLabel={action.label}
                accessibilityHint={action.description}
              >
                <View style={styles.iconCircle}>
                  <Ionicons name={action.icon as any} size={22} color={Colors.brand} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{action.label}</Text>
                  <Text style={styles.rowDescription}>{action.description}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
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
        </Pressable>
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: Space.sm,
  },
  header: {
    marginBottom: Space.xs,
  },
  title: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 2,
  },
  list: {
    gap: Space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 4,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.sm + 2,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceAlt,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: `${Colors.brand}14`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  rowDescription: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  cancelBtn: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: Space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  cancelText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
});