import React, { useMemo } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { EmptyState } from '../EmptyState';
import { T } from '../ui/Text';

/** Full-screen loading state — first sync with an empty cache. */
export function OutfitBuilderLoadingState() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.stateContainer}>
      <ActivityIndicator size="large" color={colors.brand} />
      <T.Body color={colors.textMuted} style={{ marginTop: Space.md }}>
        Loading your closet…
      </T.Body>
    </View>
  );
}

export interface OutfitBuilderErrorStateProps {
  lastError: string | null;
  onRetry: () => void;
}

/** Full-screen error state — sync failed with nothing cached to show. */
export function OutfitBuilderErrorState({ lastError, onRetry }: OutfitBuilderErrorStateProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.stateContainer}>
      <EmptyState
        icon="cloud-offline-outline"
        title="Couldn't load items"
        subtitle={lastError ?? 'Check your connection and try again.'}
        ctaLabel="Retry"
        onCtaPress={onRetry}
      />
    </View>
  );
}

export interface OutfitBuilderEmptyStateProps {
  onBack: () => void;
}

/** Full-screen empty state — closet has no listings to compose from. */
export function OutfitBuilderEmptyState({ onBack }: OutfitBuilderEmptyStateProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.stateContainer}>
      <EmptyState
        icon="shirt-outline"
        title="Your closet is empty"
        subtitle="Add listings to your shop to start building outfits from your items."
        ctaLabel="Go back"
        onCtaPress={onBack}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  stateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.md } });
}
