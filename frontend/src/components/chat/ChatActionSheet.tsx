import React, { useMemo } from "react";
import { View, Text, StyleSheet, Modal, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Space, Radius, Type, Typography } from "../../theme/designTokens";
import { useAppTheme } from "../../theme/ThemeContext";
import { AnimatedPressable } from "../AnimatedPressable";

export type ChatAction = "gallery" | "camera";

interface ChatActionSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (action: ChatAction) => void;
}

interface ActionDef {
  id: ChatAction;
  icon: React.ComponentProps<typeof Ionicons>['name'];
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
  const { colors } = useAppTheme();
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
    ],
    [],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surface }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Attach</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              Share photos and videos in this chat
            </Text>
          </View>

          <View style={styles.list}>
            {actions.map((action) => (
              <AnimatedPressable
                key={action.id}
                style={[styles.row, { backgroundColor: colors.surfaceAlt }, action.disabled && styles.rowDisabled]}
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
                    { backgroundColor: `${colors.brand}14` },
                    action.disabled && { backgroundColor: colors.surfaceAlt },
                  ]}
                >
                  <Ionicons
                    name={action.icon}
                    size={22}
                    color={action.disabled ? colors.textMuted : colors.brand}
                  />
                </View>
                <View style={styles.rowText}>
                  <Text
                    style={[
                      styles.rowLabel,
                      { color: colors.textPrimary },
                      action.disabled && { color: colors.textMuted },
                    ]}
                  >
                    {action.label}
                  </Text>
                  <Text style={[styles.rowDescription, { color: colors.textMuted }]}>
                    {action.description}
                  </Text>
                </View>
                {action.disabled ? (
                  <View style={[styles.disabledBadge, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                    <Text style={[styles.disabledBadgeText, { color: colors.textMuted }]}>
                      {action.disabledReason}
                    </Text>
                  </View>
                ) : (
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.textMuted}
                  />
                )}
              </AnimatedPressable>
            ))}
          </View>

          <Pressable
            style={[styles.cancelBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={[styles.cancelText, { color: colors.textPrimary }]}>
              Cancel
            </Text>
          </Pressable>
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
    borderRadius: Radius.full,
    alignSelf: "center",
    marginBottom: Space.sm,
  },
  header: {
    marginBottom: Space.xs,
  },
  title: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.subtitle.letterSpacing,
  },
  subtitle: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
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
  },
  rowDisabled: {
    opacity: 0.6,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    justifyContent: "center",
    alignItems: "center",
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  rowDescription: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
  },
  disabledBadge: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  disabledBadgeText: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.meta.letterSpacing,
  },
  cancelBtn: {
    borderRadius: Radius.lg,
    paddingVertical: Space.md + 2,
    alignItems: "center",
    marginTop: Space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
    justifyContent: "center",
  },
  cancelText: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.semibold,
  },
});
