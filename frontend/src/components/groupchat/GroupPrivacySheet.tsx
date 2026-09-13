/**
 * GroupPrivacySheet — truthful message-storage transparency sheet.
 *
 * States exactly what the backend guarantees: encrypted transport, secure
 * storage, staff do not read private conversations — and explicitly does
 * NOT claim end-to-end encryption (none exists server-side).
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '../BottomSheet';
import { AppButton } from '../ui/AppButton';
import { AppIcon } from '../common/AppIcon';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export function GroupPrivacySheet({
  visible,
  onDismiss,
}: {
  visible: boolean;
  onDismiss: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} variant="transaction">
      <View style={styles.content}>
        <View style={styles.iconHeader}>
          <AppIcon name="shield-checkmark" size={40} color="brand" accessible={false} />
        </View>
        <Text style={[styles.title, { color: colors.textPrimary }]}>How your messages are stored</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Your messages are transmitted over encrypted connections and stored securely on ThryftVerse servers. ThryftVerse staff do not read your private conversations, but messages are not end-to-end encrypted.
        </Text>
        <AppButton title="Understood" onPress={onDismiss} variant="primary" />
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
  iconHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: Space.md,
  },
  title: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: TypographyV2.meta.lineHeight,
    textAlign: 'center',
    marginBottom: Space.lg,
  },
});
