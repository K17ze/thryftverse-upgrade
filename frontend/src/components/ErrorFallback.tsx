import React from 'react';
import { StyleSheet } from 'react-native';
import { FlagshipState } from './flagship';
import { Space } from '../theme/designTokens';

interface ErrorFallbackProps {
  /** Screen name for Sentry context — passed through as an accessibility hint. */
  screenName?: string;
  /** Re-mounts the wrapped screen (resets the error boundary state). */
  onRetry: () => void;
  /** Navigates back to the previous screen. */
  onGoBack: () => void;
}

/**
 * ErrorFallback — the calm, factual error state shown by ScreenErrorBoundary
 * when a screen's render throws.
 *
 * Copy (AGENTS §4 anti-AI design):
 *   Headline: "This screen couldn't load"
 *   Body:     "Try again, or go back to the previous screen."
 *
 * No "Oops!", no "Something went wrong", no sad robots, no decorative
 * illustrations. Uses FlagshipState with variant="error" so the visual
 * treatment is consistent with every other error surface in the app.
 */
export function ErrorFallback({ screenName, onRetry, onGoBack }: ErrorFallbackProps) {
  return (
    <FlagshipState
      variant="error"
      title="This screen couldn't load"
      subtitle="Try again, or go back to the previous screen."
      actionLabel="Try again"
      onAction={onRetry}
      secondaryActionLabel="Go back"
      onSecondaryAction={onGoBack}
      style={styles.container}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: Space.xxl,
  },
});
