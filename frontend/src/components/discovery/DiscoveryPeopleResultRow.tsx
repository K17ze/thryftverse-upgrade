import React, { useMemo } from 'react';
import { View, Text } from 'react-native';

import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import type { UserSearchResult } from '../../services/profileApi';
import { createUnifiedDiscoveryStyles } from './unifiedDiscoveryStyles';

// ============================================================================
// PEOPLE RESULT ROW
// ============================================================================

export function DiscoveryPeopleResultRow({
  user,
  onPress }: {
  user: UserSearchResult;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createUnifiedDiscoveryStyles(colors), [colors]);
  return (
    <AnimatedPressable
      style={styles.peopleRow}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`View profile: ${user.displayName || user.username}`}
    >
      {user.avatar ? (
        <CachedImage
          uri={user.avatar}
          style={styles.peopleAvatar}
          contentFit="cover"
          downscaleWidth={96}
        />
      ) : (
        <View style={[styles.peopleAvatarFallback, { backgroundColor: colors.surfaceAlt }]}>
          <AppIcon name="person" variant="filled" size={IconSize.sm} color="textMuted" accessible={false} />
        </View>
      )}
      <View style={styles.peopleInfo}>
        <Text style={styles.peopleName} numberOfLines={1} maxFontSizeMultiplier={2}>
          {user.displayName || `@${user.username}`}
        </Text>
        {user.displayName && (
          <Text style={styles.peopleUsername} numberOfLines={1} maxFontSizeMultiplier={2}>
            @{user.username}
          </Text>
        )}
      </View>
      <AppIcon name="chevron-forward" size={IconSize.sm} color="textMuted" accessible={false} />
    </AnimatedPressable>
  );
}
