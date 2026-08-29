import React, { ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ExpoLinking from 'expo-linking';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { trackTelemetryEvent } from '../../lib/telemetry';
import { Sentry, isSentryAvailable } from './sentry';
import { resetNavigationToHome, getAppNavigationRef } from './appNavigation';
import { AnimatedPressable } from '../../components/AnimatedPressable';
import { Typography, Radius, Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useReducedMotion } from '../../hooks/useReducedMotion';

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

  handleReportFeedback = () => {
    if (!isSentryAvailable()) return;
    try {
      // Sentry's React Native SDK exposes a user feedback form via
      // captureMessage with a dedicated level; this is best-effort.
      Sentry.captureMessage?.('User feedback from crash recovery screen', {
        level: 'info',
        tags: { source: 'crash_recovery_feedback' } });
    } catch {
      // Observability must never crash the app.
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return <>{this.props.fallback}</>;
      }
      const styles = createStyles(this.props.colors);
      return (
        <CrashRecoveryUI
          key={`recovery_${this.state.recoveryAttempt}`}
          message={this.state.errorMsg}
          onRetry={this.handleRetry}
          onGoHome={this.handleGoHome}
          onReload={this.handleReload}
          onReportFeedback={this.handleReportFeedback}
          canReportFeedback={isSentryAvailable()}
          colors={this.props.colors}
          styles={styles}
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
  onReportFeedback: () => void;
  canReportFeedback: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}

function CrashRecoveryUI({
  message,
  onRetry,
  onGoHome,
  onReload,
  onReportFeedback,
  canReportFeedback,
  colors,
  styles }: CrashRecoveryUIProps) {
  const reducedMotionEnabled = useReducedMotion();
  const enter = reducedMotionEnabled ? undefined : FadeIn.duration(300);

  return (
    <View style={styles.container}>
      <Reanimated.View entering={enter} style={styles.content}>
        {/* App wordmark */}
        <Reanimated.View entering={enter} style={styles.logoWrap}>
          <Text style={styles.logoText}>Thryftverse</Text>
        </Reanimated.View>

        {/* Warning icon */}
        <Reanimated.View entering={enter} style={styles.iconBox}>
          <Ionicons name="warning-outline" size={56} color={colors.danger} />
        </Reanimated.View>

        <Reanimated.Text entering={enter} style={styles.title}>
          Something went wrong
        </Reanimated.Text>

        <Reanimated.Text entering={enter} style={styles.subtext}>
          The app encountered an unexpected error. Try again, go home, or reload the app.
        </Reanimated.Text>

        {__DEV__ && message ? (
          <Reanimated.Text entering={enter} style={styles.devMessage} numberOfLines={4}>
            {message}
          </Reanimated.Text>
        ) : null}

        {/* Primary action: Reload app */}
        <Reanimated.View entering={enter}>
          <AnimatedPressable
            style={styles.primaryBtn}
            onPress={onReload}
            accessibilityRole="button"
            accessibilityLabel="Reload app"
            accessibilityHint="Reloads the entire app to recover from the crash"
            activeOpacity={0.85}
            scaleValue={0.97}
            autoHaptic
          >
            <Ionicons name="refresh-outline" size={20} color={colors.background} style={styles.btnIcon} />
            <Text style={styles.primaryBtnText}>Reload app</Text>
          </AnimatedPressable>
        </Reanimated.View>

        {/* Secondary action: Go to home */}
        <Reanimated.View entering={enter}>
          <AnimatedPressable
            style={styles.secondaryBtn}
            onPress={onGoHome}
            accessibilityRole="button"
            accessibilityLabel="Go to home"
            accessibilityHint="Resets navigation to the home screen"
            activeOpacity={0.85}
            scaleValue={0.97}
            autoHaptic
          >
            <Ionicons name="home-outline" size={20} color={colors.textPrimary} style={styles.btnIcon} />
            <Text style={styles.secondaryBtnText}>Go to home</Text>
          </AnimatedPressable>
        </Reanimated.View>

        {/* Tertiary action: Try again (re-render same screen) */}
        <Reanimated.View entering={enter}>
          <AnimatedPressable
            style={styles.tertiaryBtn}
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel="Try again"
            accessibilityHint="Attempts to re-render the current screen"
            activeOpacity={0.85}
            scaleValue={0.97}
            autoHaptic
          >
            <Text style={styles.tertiaryBtnText}>Try again</Text>
          </AnimatedPressable>
        </Reanimated.View>

        {/* Optional: Report feedback */}
        {canReportFeedback ? (
          <Reanimated.View entering={enter}>
            <AnimatedPressable
              style={styles.feedbackBtn}
              onPress={onReportFeedback}
              accessibilityRole="button"
              accessibilityLabel="Report feedback"
              accessibilityHint="Sends a feedback note to the development team"
              activeOpacity={0.85}
              scaleValue={0.97}
            >
              <Text style={styles.feedbackBtnText}>Report feedback</Text>
            </AnimatedPressable>
          </Reanimated.View>
        ) : null}
      </Reanimated.View>
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: Space.xl },
    content: {
      alignItems: 'center',
      width: '100%',
      maxWidth: 360 },
    logoWrap: {
      marginBottom: Space.xl },
    logoText: {
      color: colors.textPrimary,
      fontFamily: Typography.family.bold,
      fontSize: TypographyV2.display.size,
      letterSpacing: -0.4,
      textAlign: 'center' },
    iconBox: {
      width: 96,
      height: 96,
      borderRadius: Radius.full,
      backgroundColor: colors.dangerSubtle,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: Space.lg,
      overflow: 'hidden' },
    title: {
      fontSize: TypographyV2.screenTitle.size,
      fontFamily: TypographyV2.screenTitle.fontFamily,
      color: colors.textPrimary,
      marginBottom: 12,
      textAlign: 'center' },
    subtext: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: Space.xl,
      lineHeight: 21 },
    devMessage: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.danger,
      textAlign: 'center',
      marginBottom: Space.lg,
      lineHeight: 18,
      opacity: 0.8 },
    primaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.textPrimary,
      paddingVertical: Space.md,
      borderRadius: Radius.xl,
      width: '100%',
      marginBottom: 12 },
    primaryBtnText: {
      color: colors.background,
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily },
    secondaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      paddingVertical: Space.md,
      borderRadius: Radius.xl,
      width: '100%',
      marginBottom: 12 },
    secondaryBtnText: {
      color: colors.textPrimary,
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily },
    tertiaryBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      borderRadius: Radius.xl,
      width: '100%',
      marginBottom: 12 },
    tertiaryBtnText: {
      color: colors.textSecondary,
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily },
    feedbackBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      marginTop: Space.sm },
    feedbackBtnText: {
      color: colors.textSecondary,
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      textDecorationLine: 'underline' },
    btnIcon: {
      marginRight: Space.sm } });
}
