import React, { useMemo } from "react";

import { View, StyleSheet } from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { AnimatedPressable } from "../AnimatedPressable";
import { Caption } from "../ui/Text";

import { useAppTheme } from "../../theme/ThemeContext";
import { Space, Control } from "../../theme/designTokens";

export interface ChatSelectionToolbarProps {
  selectedCount: number;
  onExit: () => void;
  onDelete: () => void;
}

// Multi-select toolbar — replaces the standard chrome while selection mode
// is active: exit affordance, live selected count, bulk delete.
export function ChatSelectionToolbar({
  selectedCount,
  onExit,
  onDelete }: ChatSelectionToolbarProps) {
  const { colors } = useAppTheme();

  const styles = useMemo(() => StyleSheet.create({
    selectionToolbar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm - 1,
      backgroundColor: colors.surfaceAlt,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border } }), [colors]);

  return (
    <View style={styles.selectionToolbar}>
      <AnimatedPressable
        onPress={onExit}
        activeOpacity={0.7}
        scaleValue={0.92}
        hapticFeedback="light"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel="Exit selection mode"
        accessibilityHint="Closes the message selection toolbar"
      >
        <Ionicons
          name="close-outline"
          size={24}
          color={colors.textPrimary}
        />
      </AnimatedPressable>
      <Caption
        color={colors.textMuted}
        accessibilityLiveRegion="polite"
      >
        {selectedCount} selected
      </Caption>
      <AnimatedPressable
        onPress={onDelete}
        activeOpacity={0.7}
        scaleValue={0.92}
        hapticFeedback="medium"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityLabel="Delete selected messages"
        accessibilityRole="button"
        accessibilityHint="Permanently removes the selected messages from this conversation"
      >
        <Ionicons name="trash-outline" size={Control.icon} color={colors.danger} />
      </AnimatedPressable>
    </View>
  );
}
