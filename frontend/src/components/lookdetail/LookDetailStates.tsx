import React, { useMemo } from 'react';
import { StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { EmptyState } from '../EmptyState';
import { LookDetailSkeleton } from '../skeletons/LookDetailSkeleton';
import { LookDetailNavBar } from './LookDetailNavBar';
import type { LookLoadError } from '../../hooks/lookdetail/useLookDetailData';

export interface LookDetailLoadingStateProps {
  onBack: () => void;
}

/** Loading fallback — solid header (back only) over the skeleton scroll. */
function LookDetailLoadingStateImpl({ onBack }: LookDetailLoadingStateProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LookDetailNavBar onBack={onBack} iconColor="textPrimary" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <LookDetailSkeleton />
      </ScrollView>
    </SafeAreaView>
  );
}

export const LookDetailLoadingState = React.memo(LookDetailLoadingStateImpl);

export interface LookDetailErrorStateProps {
  loadError: LookLoadError | null;
  onRetry: () => void;
  onBack: () => void;
}

/** Error / not-found fallback — solid header + EmptyState with retry CTA
 *  for recoverable (connection/offline) failures, back-nav otherwise. */
function LookDetailErrorStateImpl({ loadError, onRetry, onBack }: LookDetailErrorStateProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const canRetry = loadError?.kind === 'connection' || loadError?.kind === 'offline';
  const isMissing = loadError?.kind === 'missing' || loadError?.kind === 'not-found';
  const errorIcon = loadError?.kind === 'offline'
    ? 'offline' as const
    : isMissing
      ? 'trash' as const
      : 'offline' as const;
  const errorTitle = loadError?.kind === 'offline'
    ? "You're offline"
    : isMissing
      ? 'This content is no longer available'
      : "Couldn't load this look";

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LookDetailNavBar onBack={onBack} iconColor="textPrimary" />
      <EmptyState
        icon={errorIcon}
        title={errorTitle}
        subtitle={loadError?.message ?? 'This look may have been removed or is unavailable.'}
        ctaLabel={canRetry ? 'Try again' : 'Back to Explore'}
        onCtaPress={canRetry ? onRetry : onBack}
      />
    </SafeAreaView>
  );
}

export const LookDetailErrorState = React.memo(LookDetailErrorStateImpl);

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: { paddingBottom: Space.lg } });
}
