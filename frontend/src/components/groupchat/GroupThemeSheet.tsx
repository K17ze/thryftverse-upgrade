/**
 * GroupThemeSheet — per-conversation chat theme picker.
 *
 * The theme list is supplied by the caller (the canonical CHAT_THEMES
 * contract) and the selection is driven by the persisted preference, never
 * by local-only state, so the checkmark always reflects server truth.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '../BottomSheet';
import { AppIcon } from '../common/AppIcon';
import { useAppTheme } from '../../theme/ThemeContext';
import { FontFamily, Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { ChatTheme } from '../../services/chatPreferencesApi';

export interface GroupThemeSheetProps {
  visible: boolean;
  onDismiss: () => void;
  themes: readonly ChatTheme[];
  selected: ChatTheme;
  error?: string | null;
  onSelect: (theme: ChatTheme) => void;
}

export function GroupThemeSheet({
  visible,
  onDismiss,
  themes,
  selected,
  error,
  onSelect,
}: GroupThemeSheetProps) {
  const { colors } = useAppTheme();

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} variant="system">
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Chat Theme</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Customize the accent tones of this conversation on this device. Not synced to other devices.
        </Text>
        {error ? (
          <Text style={[styles.subtitle, { color: colors.danger, marginTop: 4 }]}>{error}</Text>
        ) : null}
        {themes.map((theme) => {
          const isSelected = selected === theme;
          return (
            <Pressable
              key={theme}
              onPress={() => onSelect(theme)}
              style={styles.optionRow}
              accessibilityRole="button"
              accessibilityLabel={`Chat theme ${theme}`}
              accessibilityState={{ selected: isSelected }}
            >
              <Text
                style={[
                  styles.optionLabel,
                  { color: colors.textPrimary },
                  isSelected && { color: colors.brand, fontFamily: FontFamily.bold },
                ]}
              >
                {theme}
              </Text>
              {isSelected ? <AppIcon name="check" size="md" color="brand" accessible={false} /> : null}
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
    gap: Space.sm,
  },
  title: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: FontFamily.bold,
  },
  subtitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.meta.lineHeight,
    marginBottom: Space.xs,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingVertical: Space.xs,
  },
  optionLabel: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
  },
});
