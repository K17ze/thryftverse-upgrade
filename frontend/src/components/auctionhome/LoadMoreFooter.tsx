import React from 'react';
import { ActivityIndicator, Pressable, Text, View, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

/**
 * End-of-list pagination footer. Shows a spinner while the next page is
 * in flight and a truthful inline error + retry when pagination fails —
 * previously `paginationError` was written by the hooks but never rendered,
 * so a failed load-more was invisible to the user.
 */
export function LoadMoreFooter({
  isLoadingMore,
  error,
  onRetry,
}: {
  isLoadingMore: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const { colors } = useAppTheme();

  if (isLoadingMore) {
    return (
      <View style={styles.wrap} accessibilityLabel="Loading more auctions">
        <ActivityIndicator size="small" color={colors.textMuted} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.wrap}>
        <Text style={[TypographyV2.caption, { color: colors.textSecondary }]}>{error}</Text>
        <Pressable
          onPress={onRetry}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Retry loading more auctions"
          style={styles.retry}
        >
          <Text style={[TypographyV2.caption, { color: colors.textPrimary, fontWeight: '600' }]}>
            Retry
          </Text>
        </Pressable>
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Space.sm,
    justifyContent: 'center',
    paddingVertical: Space.lg,
  },
  retry: {
    paddingVertical: Space.xs,
  },
});
