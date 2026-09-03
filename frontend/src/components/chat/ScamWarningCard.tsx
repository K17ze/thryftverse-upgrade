import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme } from '../../theme/ThemeContext';
import { useAppTranslation } from '../../i18n/useAppTranslation';

export interface ScamWarningCardProps {
  dismissed: boolean;
  onDismiss: () => void;
  isMe: boolean;
}

export function ScamWarningCard({ dismissed, onDismiss, isMe }: ScamWarningCardProps) {
  const { colors } = useAppTheme();
  const { t } = useAppTranslation('messaging');
  if (dismissed) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.warningSubtle, borderColor: colors.warningBorder }, isMe && styles.containerMe]}>
      <Ionicons name="shield-outline" size={18} color={colors.warning} />
      <View style={styles.textCol}>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          {t('safety.scamWarningBody')}
        </Text>
      </View>
      <Pressable
        style={styles.closeBtn}
        onPress={onDismiss}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel={t('safety.dismiss')}
      >
        <Ionicons name="close" size={14} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: Space.sm + 2,
    marginTop: Space.xs + 2,
    marginHorizontal: Space.md,
    paddingHorizontal: Space.md + 2,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
  },
  containerMe: {
    marginHorizontal: 0,
    alignSelf: 'flex-end',
    maxWidth: '85%',
  },
  textCol: {
    flex: 1,
    gap: Space.xs,
  },
  body: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 2,
    fontFamily: TypographyV2.meta.fontFamily,
  },
  closeBtn: {
    paddingTop: 2,
    flexShrink: 0,
    minHeight: 32,
  },
});
