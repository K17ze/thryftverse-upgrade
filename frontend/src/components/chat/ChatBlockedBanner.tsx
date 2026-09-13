import React, { useMemo } from "react";

import { View, Text, StyleSheet } from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { useAppTheme } from "../../theme/ThemeContext";
import { Space } from "../../theme/designTokens";
import { TypographyV2 } from "../../theme/typography.v2";

export interface ChatBlockedBannerProps {
  onUnblock: () => void;
}

// Blocked-partner banner — shown in DMs when the current user has blocked
// the other participant. Offers an inline unblock action.
export function ChatBlockedBanner({ onUnblock }: ChatBlockedBannerProps) {
  const { colors } = useAppTheme();

  const styles = useMemo(() => StyleSheet.create({
    blockBannerWrap: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.xs + 1,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm - 1,
      backgroundColor: colors.surfaceAlt,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle },

    blockBannerText: {
      flex: 1,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily },

    blockBannerAction: {
      fontFamily: TypographyV2.meta.fontFamily,
      fontWeight: '600' } }), [colors]);

  return (
    <View
      style={styles.blockBannerWrap}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Ionicons
        name="lock-closed-outline"
        size={14}
        color={colors.textMuted}
      />
      <Text
        style={[styles.blockBannerText, { color: colors.textSecondary }]}
        numberOfLines={2}
       maxFontSizeMultiplier={2}>
        You blocked this user.{" "}
        <Text
          style={[styles.blockBannerAction, { color: colors.textPrimary }]}
          onPress={onUnblock}
         maxFontSizeMultiplier={2}>
          Unblock to continue.
        </Text>
      </Text>
    </View>
  );
}
