import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Radius } from '../../theme/designTokens';
import { SkeletonLoader } from '../SkeletonLoader';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { t } from '../../i18n';
import { editListingStyles as styles, useEditListingThemedStyles } from './editListingStyles';

/**
 * Non-form states for the edit-listing screen — the skeleton placeholder
 * shown while the listing is fetched and the retryable error surface. The
 * screen wraps these in FlagshipScreen + FlagshipHeader; extracted verbatim
 * from EditListingScreen.
 */

export function EditListingLoadingState() {
  return (
    <View style={styles.loadingContainer}>
      <SkeletonLoader width="100%" height={200} borderRadius={Radius.lg} />
      <View style={styles.skeletonFormGap}>
        <SkeletonLoader width="100%" height={48} borderRadius={Radius.md} />
        <SkeletonLoader width="100%" height={48} borderRadius={Radius.md} />
        <SkeletonLoader width="60%" height={48} borderRadius={Radius.md} />
        <SkeletonLoader width="100%" height={120} borderRadius={Radius.md} />
      </View>
    </View>
  );
}

export function EditListingErrorState({ onRetry }: { onRetry: () => void }) {
  const themed = useEditListingThemedStyles();
  return (
    <View style={styles.errorContainer}>
      <AppIcon name="cloud-offline-outline" size={IconSize.xl} color="textMuted" opticalCenter accessible={false} />
      <Text style={[styles.errorTitle, themed.errorTitle]}>{t('listing.edit.couldNotLoad')}</Text>
      <Pressable
        style={({ pressed }) => [styles.retryBtn, themed.retryBtn, pressed && { opacity: 0.85 }]}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={t('listing.edit.retryLoad')}
      >
        <Text style={[styles.retryBtnText, themed.retryBtnText]}>{t('listing.edit.retry')}</Text>
      </Pressable>
    </View>
  );
}
