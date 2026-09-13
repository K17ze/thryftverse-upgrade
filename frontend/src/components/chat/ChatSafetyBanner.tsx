import React, { useMemo } from "react";

import { View, Text, StyleSheet } from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { useAppTheme } from "../../theme/ThemeContext";
import { Space } from "../../theme/designTokens";
import { TypographyV2 } from "../../theme/typography.v2";

import { type ChatSafetyWarning } from "../../utils/chatSafetyWarnings";

export interface ChatSafetyBannerProps {
  warning: ChatSafetyWarning;
}

// Conversation-level safety banner — rendered above the message list
// as the highest-priority contextual element. Uses semantic tokens
// only; level emphasis comes from the icon/text colour, not alpha.
export function ChatSafetyBanner({ warning }: ChatSafetyBannerProps) {
  const { colors } = useAppTheme();

  const styles = useMemo(() => StyleSheet.create({
    safetyBannerWrap: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.xs + 1,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm - 1,
      backgroundColor: colors.surfaceAlt,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle },

    safetyBannerText: {
      flex: 1,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily } }), [colors]);

  return (
    <View
      style={styles.safetyBannerWrap}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Ionicons
        name={
          warning.level === "danger"
            ? "warning"
            : warning.level === "caution"
              ? "alert-circle-outline"
              : "lock-closed-outline"
        }
        size={14}
        color={
          warning.level === "danger"
            ? colors.danger
            : warning.level === "caution"
              ? colors.warning
              : colors.textMuted
        }
      />
      <Text
        style={[
          styles.safetyBannerText,
          {
            color:
              warning.level === "danger"
                ? colors.danger
                : warning.level === "caution"
                  ? colors.warning
                  : colors.textSecondary },
        ]}
        numberOfLines={2}
       maxFontSizeMultiplier={2}>
        {warning.message}
      </Text>
    </View>
  );
}
