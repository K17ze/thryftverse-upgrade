import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { CachedImage } from '../CachedImage';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Typography, Radius, Type } from '../../theme/designTokens';
import { t } from '../../i18n';

// Compact row showing what is in the parcel — thumbnail + title — so the buyer
// can see WHAT is being tracked without scrolling to a separate section.

export function PackageContents({
  title,
  imageUrl,
  subtitle,
  onPress,
}: {
  title: string;
  imageUrl: string;
  subtitle?: string;
  onPress?: () => void;
}) {
  const { colors } = useAppTheme();
  const themed = useMemo(() => ({
    label: { color: colors.textMuted },
    title: { color: colors.textPrimary },
    subtitle: { color: colors.textSecondary },
  }), [colors]);

  const content = (
    <View style={styles.packageContentsRow}>
      <CachedImage
        uri={imageUrl}
        style={styles.packageThumb}
        contentFit="cover"
      />
      <View style={styles.packageContentsText}>
        <Text style={[styles.packageContentsTitle, themed.title]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.packageContentsSub, themed.subtitle]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t('orderDetail.package.viewItemA11y', { title })}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  packageContentsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  packageThumb: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
  },
  packageContentsText: {
    flex: 1,
    gap: Space.xxs,
  },
  packageContentsTitle: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
  packageContentsSub: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
  },
});
