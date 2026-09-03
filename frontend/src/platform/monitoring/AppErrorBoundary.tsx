import React, { ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, Linking, Pressable } from 'react-native';
import * as ExpoLinking from 'expo-linking';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { trackTelemetryEvent } from '../../lib/telemetry';
import { Sentry, isSentryAvailable } from './sentry';
import { resetNavigationToHome, getAppNavigationRef } from './appNavigation';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

interface AppErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  colors: ThemeColors;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  errorMsg: string;
  // Monotonic counter bumped on every recovery attempt so the crash UI
  // remounts with a fresh key — prevents re-crashing on the same screen.
  recoveryAttempt: number;
}

/**
 * Reload the app. Prefer expo-updates OTA reload so the user gets a fresh JS
 * bundle; fall back to Linking to re-open the app, and finally a no-op.
 */
function reloadApp(): void {
  try {
    // expo-updates is an optional dependency — require lazily so the boundary
    // never crashes if the module is absent (bare builds, dev without OTA).
    const Updates = require('expo-updates');
    if (Updates?.reloadAsync) {
      Updates.reloadAsync().catch(() => {
        // Last-resort: ask the OS to re-open the app URL.
        Linking.openURL(ExpoLinking.createURL('')).catch(() => undefined);
      });
      return;
    }
  } catch {
    // expo-updates not available — continue to fallback.
  }

  // Fallback for builds without expo-updates: re-open the app deep link.
  try {
    Linking.openURL(ExpoLinking.createURL('')).catch(() => undefined);
  } catch {
    // Observability/recovery must never crash the app.
  }
}

class AppErrorBoundaryInner extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMsg: '', recoveryAttempt: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { hasError: true, errorMsg: error.message };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Capture the current route name as a Sentry breadcrumb so crash reports
    // include the screen the user was on when the crash occurred.
    if (isSentryAvailable()) {
      try {
        const ref = getAppNavigationRef();
        if (ref && ref.isReady()) {
          const currentRoute = ref.getCurrentRoute();
          if (currentRoute?.name) {
            Sentry.addBreadcrumb?.({
              category: 'navigation',
              message: `crash on screen: ${currentRoute.name}`,
              level: 'error' });
          }
        }
      } catch {
        // Breadcrumb capture must never crash the app.
      }
    }

    trackTelemetryEvent('error_boundary_crash', {
      error_name: error.name,
      error_message: error.message,
      component_stack: errorInfo.componentStack ?? '' });

    Sentry.captureException?.(error, {
      contexts: {
        react: { componentStack: errorInfo.componentStack ?? '' } } });
  }

  handleRetry = () => {
    // Clear the error state so the app can re-render from a clean slate.
    this.setState((prev) => ({ hasError: false, errorMsg: '', recoveryAttempt: prev.recoveryAttempt + 1 }));
  };

  handleGoHome = () => {
    // Reset navigation to the MainTabs root to avoid re-crashing on the same
    // screen, then clear the error state.
    resetNavigationToHome();
    this.setState((prev) => ({ hasError: false, errorMsg: '', recoveryAttempt: prev.recoveryAttempt + 1 }));
  };

  handleReload = () => {
    // Report the user-initiated reload as a breadcrumb before reloading.
    if (isSentryAvailable()) {
      try {
        Sentry.addBreadcrumb?.({
          category: 'ui.action',
          message: 'crash recovery: user tapped reload',
          level: 'info' });
      } catch {
        // Observability must never crash the app.
      }
    }
    reloadApp();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return <>{this.props.fallback}</>;
      }
      return (
        <CrashRecoveryUI
          key={`recovery_${this.state.recoveryAttempt}`}
          message={this.state.errorMsg}
          onRetry={this.handleRetry}
          onGoHome={this.handleGoHome}
          onReload={this.handleReload}
          colors={this.props.colors}
        />
      );
    }
    return this.props.children;
  }
}

interface CrashRecoveryUIProps {
  message: string;
  onRetry: () => void;
  onGoHome: () => void;
  onReload: () => void;
  colors: ThemeColors;
}

function CrashRecoveryUI({
  message,
  onRetry,
  onGoHome,
  onReload,
  colors,
}: CrashRecoveryUIProps) {
  return (
    <View style={styles(colors).container}>
      <View style={styles(colors).content}>
        <Text style={styles(colors).title}>
          The app needs to restart
        </Text>

        <Text style={styles(colors).subtitle}>
          Reload to continue, or go back to home.
        </Text>

        {__DEV__ && message ? (
          <Text style={styles(colors).devMessage} numberOfLines={4}>
            {message}
          </Text>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles(colors).primaryBtn,
            { backgroundColor: colors.brand, opacity: pressed ? 0.86 : 1 },
          ]}
          onPress={onReload}
          accessibilityRole="button"
          accessibilityLabel="Reload app"
          accessibilityHint="Reloads the app to recover"
        >
          <Text style={styles(colors).primaryBtnText}>Reload</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles(colors).secondaryBtn,
            { opacity: pressed ? 0.7 : 1 },
          ]}
          onPress={onGoHome}
          accessibilityRole="button"
          accessibilityLabel="Go to home"
          accessibilityHint="Resets to the home screen"
        >
          <Text style={styles(colors).secondaryBtnText}>Go to home</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles(colors).tertiaryBtn,
            { opacity: pressed ? 0.7 : 1 },
          ]}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Try again"
          accessibilityHint="Attempts to re-render the current screen"
        >
          <Text style={styles(colors).tertiaryBtnText}>Try again</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function AppErrorBoundary({ children, fallback }: Omit<AppErrorBoundaryProps, 'colors'>) {
  const { colors } = useAppTheme();
  return (
    <AppErrorBoundaryInner colors={colors} fallback={fallback}>
      {children}
    </AppErrorBoundaryInner>
  );
}

function styles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: Space.xl,
    },
    content: {
      alignItems: 'center',
      width: '100%',
      maxWidth: 320,
    },
    title: {
      fontSize: TypographyV2.screenTitle.size,
      fontFamily: TypographyV2.screenTitle.fontFamily,
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: Space.sm,
    },
    subtitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: Space.xl,
      lineHeight: TypographyV2.body.lineHeight,
    },
    devMessage: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.danger,
      textAlign: 'center',
      marginBottom: Space.lg,
      lineHeight: TypographyV2.meta.lineHeight,
      opacity: 0.8,
    },
    primaryBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.brand,
      paddingVertical: Space.md,
      borderRadius: Radius.full,
      width: '100%',
      minHeight: 52,
      marginBottom: Space.sm,
    },
    primaryBtnText: {
      color: colors.textInverse,
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
    },
    secondaryBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Space.sm,
      width: '100%',
      minHeight: 44,
      marginBottom: Space.xs,
    },
    secondaryBtnText: {
      color: colors.textPrimary,
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
    },
    tertiaryBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Space.sm,
      width: '100%',
      minHeight: 44,
    },
    tertiaryBtnText: {
      color: colors.textSecondary,
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
    },
  });
}
