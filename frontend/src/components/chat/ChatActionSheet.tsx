import React, { useMemo } from "react";
import { View, Text, StyleSheet, Modal, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../constants/colors";
import { Space, Radius, Type, Typography } from "../../theme/designTokens";
import { AnimatedPressable } from "../AnimatedPressable";

export type ChatAction = "gallery" | "camera" | "document";

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
  disabled?: boolean;
  disabledReason?: string;
}

export function ChatActionSheet({
  visible,
  onClose,
  onSelect,
}: ChatActionSheetProps) {
  const actions = useMemo<ActionDef[]>(
    () => [
      {
        id: "gallery",
        icon: "images-outline",
        label: "Photo & Video",
        description: "Choose from your library",
      },
      {
        id: "camera",
        icon: "camera-outline",
        label: "Camera",
        description: "Take a new photo or video",
      },
      {
        id: "document",
        icon: "document-outline",
        label: "Document",
        description: "Backend support required",
        disabled: true,
        disabledReason: "Coming soon",
      },
    ],
    [],
  );

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
                style={[styles.row, action.disabled && styles.rowDisabled]}
                onPress={() => {
                  if (action.disabled) return;
                  onSelect(action.id);
                  onClose();
                }}
                activeOpacity={0.7}
                scaleValue={action.disabled ? 1 : 0.98}
                hapticFeedback={action.disabled ? undefined : "light"}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                accessibilityHint={action.description}
                accessibilityState={action.disabled ? { disabled: true } : undefined}
                disabled={action.disabled}
              >
                <View
                  style={[
                    styles.iconCircle,
                    action.disabled && styles.iconCircleDisabled,
                  ]}
                >
                  <Ionicons
                    name={action.icon as any}
                    size={22}
                    color={action.disabled ? Colors.textMuted : Colors.brand}
                  />
                </View>
                <View style={styles.rowText}>
                  <Text
                    style={[
                      styles.rowLabel,
                      action.disabled && styles.rowLabelDisabled,
                    ]}
                  >
                    {action.label}
                  </Text>
                  <Text style={styles.rowDescription}>
                    {action.description}
                  </Text>
                </View>
                {action.disabled ? (
                  <View style={styles.disabledBadge}>
                    <Text style={styles.disabledBadgeText}>
                      {action.disabledReason}
                    </Text>
                  </View>
                ) : (
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={Colors.textMuted}
                  />
                )}
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
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xxl,
    gap: Space.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
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
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm + 4,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.sm + 2,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceAlt,
  },
  rowDisabled: {
    opacity: 0.6,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: `${Colors.brand}14`,
    justifyContent: "center",
    alignItems: "center",
  },
  iconCircleDisabled: {
    backgroundColor: Colors.surfaceAlt,
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
  rowLabelDisabled: {
    color: Colors.textMuted,
  },
  rowDescription: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  disabledBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  disabledBadgeText: {
    fontSize: 11,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
  },
  cancelBtn: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    alignItems: "center",
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
