import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { FlagshipState } from './flagship';
import { Space } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useAppTheme } from '../theme/ThemeContext';

interface ErrorFallbackProps {
  /** Screen name for Sentry context — passed through as an accessibility hint. */
  screenName?: string;
  /** The actual error message — shown in dev mode so the crash is debuggable. */
  errorMessage?: string;
  /** The error stack trace — shown in dev mode to pinpoint the throw site. */
  errorStack?: string;
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
 *
 * In development mode (__DEV__), the actual error message is shown below
 * the subtitle so the developer can see what threw without the red screen.
 */
export function ErrorFallback({ screenName, errorMessage, errorStack, onRetry, onGoBack }: ErrorFallbackProps) {
  const { colors } = useAppTheme();
  const showDevMessage = __DEV__ && errorMessage;

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
    >
      {showDevMessage ? (
        <Text
          style={styles.devMessage}
          accessibilityLabel={`Error detail: ${errorMessage}`}
        >
          {screenName ? `[${screenName}] ` : ''}{errorMessage}
          {errorStack ? `\n\n${errorStack}` : ''}
        </Text>
      ) : null}
    </FlagshipState>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: Space.xxl,
  },
  devMessage: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: '#888',
    marginTop: Space.sm,
    paddingHorizontal: Space.lg,
  },
});
