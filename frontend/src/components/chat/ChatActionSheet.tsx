import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Type } from '../../theme/designTokens';
import { Typography } from '../../constants/typography';
import { AnimatedPressable } from '../AnimatedPressable';

export type ChatAction = 'gallery' | 'camera' | 'location' | 'contact';

interface ChatActionSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (action: ChatAction) => void;
  isGroup?: boolean;
}

const ACTIONS: { id: ChatAction; icon: string; label: string }[] = [
  { id: 'gallery', icon: 'images-outline', label: 'Gallery' },
  { id: 'camera', icon: 'camera-outline', label: 'Camera' },
  { id: 'location', icon: 'location-outline', label: 'Location' },
  { id: 'contact', icon: 'person-outline', label: 'Contact' },
];

export function ChatActionSheet({ visible, onClose, onSelect, isGroup }: ChatActionSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Add to message</Text>
          <View style={styles.grid}>
            {ACTIONS.map((action) => (
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
              >
                <View style={styles.iconCircle}>
                  <Ionicons name={action.icon as any} size={24} color={Colors.textPrimary} />
                </View>
                <Text style={styles.actionLabel}>{action.label}</Text>
              </AnimatedPressable>
            ))}
          </View>
          <AnimatedPressable
            style={styles.cancelBtn}
            onPress={onClose}
            activeOpacity={0.7}
            scaleValue={0.98}
            hapticFeedback="light"
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
    paddingBottom: Space.xl,
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
    justifyContent: 'center',
    paddingVertical: Space.sm,
  },
  actionBtn: {
    alignItems: 'center',
    gap: Space.xs,
    minWidth: 72,
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
