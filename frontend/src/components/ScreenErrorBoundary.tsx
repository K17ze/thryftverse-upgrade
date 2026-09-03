import React, { ErrorInfo, ReactNode } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Sentry, isSentryAvailable } from '../platform/monitoring/sentry';
import { trackTelemetryEvent } from '../lib/telemetry';
import { ErrorFallback } from './ErrorFallback';

interface ScreenErrorBoundaryProps {
  children: ReactNode;
  /** Name of the screen being wrapped — attached to Sentry context and telemetry. */
  screenName: string;
}

interface ScreenErrorBoundaryState {
  hasError: boolean;
  // Monotonic counter bumped on every recovery attempt so the wrapped screen
  // re-mounts with a fresh key — prevents re-crashing on the same render.
  recoveryAttempt: number;
  // The error message from the most recent crash — shown in dev mode so the
  // developer can see what actually threw without the red screen.
  errorMessage?: string;
  // The error stack from the most recent crash — shown in dev mode so the
  // developer can see the exact call site that threw.
  errorStack?: string;
}

/**
 * ScreenErrorBoundary — a reusable per-screen error boundary for critical
 * screens.
 *
 * Catches render errors for the wrapped screen and shows a calm, factual
 * fallback UI (ErrorFallback) with "Try again" (re-mounts the screen) and
 * "Go back" (navigates to the previous screen) actions.
 *
 * Reports the error to Sentry with the screen name as a tag and the component
 * stack as context, so crash reports are attributable to the specific screen.
 *
 * This complements the top-level AppErrorBoundary: the app-level boundary is
 * the last-resort crash recovery surface; this per-screen boundary isolates
 * a single screen's render failure so the rest of the app stays usable.
 */
class ScreenErrorBoundaryInner extends React.Component<
  ScreenErrorBoundaryProps & { onGoBack: () => void },
  ScreenErrorBoundaryState
> {
  constructor(props: ScreenErrorBoundaryProps & { onGoBack: () => void }) {
    super(props);
    this.state = { hasError: false, recoveryAttempt: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<ScreenErrorBoundaryState> {
    return {
      hasError: true,
      errorMessage: error?.message ?? String(error),
      errorStack: error?.stack ?? '',
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Report to Sentry with the screen name as a tag and the component stack
    // as context. All Sentry calls are guarded so observability never crashes
    // the app.
    if (isSentryAvailable()) {
      try {
        Sentry.addBreadcrumb?.({
          category: 'ui.error',
          message: `Screen render error: ${this.props.screenName}`,
          level: 'error',
          data: { screen: this.props.screenName },
        });

        Sentry.captureException?.(error, {
          tags: { screen: this.props.screenName },
          contexts: {
            react: { componentStack: errorInfo.componentStack ?? '' },
            screen: { name: this.props.screenName },
          },
        });
      } catch {
        // Observability must never crash the app.
      }
    }

    trackTelemetryEvent('screen_error_boundary', {
      error_name: error.name,
      error_message: error.message,
      screen_name: this.props.screenName,
      component_stack: errorInfo.componentStack ?? '',
    });
  }

  handleRetry = () => {
    // Bump the recovery counter so the wrapped screen re-mounts with a fresh
    // key — this clears any stale state that may have caused the crash.
    this.setState((prev) => ({
      hasError: false,
      recoveryAttempt: prev.recoveryAttempt + 1,
    }));
  };

  handleGoBack = () => {
    // Clear the error state, then let the parent's onGoBack navigate back.
    this.setState((prev) => ({
      hasError: false,
      recoveryAttempt: prev.recoveryAttempt + 1,
    }));
    this.props.onGoBack();
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          screenName={this.props.screenName}
          errorMessage={this.state.errorMessage}
          errorStack={this.state.errorStack}
          onRetry={this.handleRetry}
          onGoBack={this.handleGoBack}
        />
      );
    }

    // Key the children with the recovery counter so "Try again" re-mounts
    // the screen from a clean slate.
    return (
      <React.Fragment key={this.state.recoveryAttempt}>
        {this.props.children}
      </React.Fragment>
    );
  }
}

/**
 * Functional wrapper that provides the navigation `goBack` action to the
 * class-based error boundary. Uses `useNavigation` from React Navigation so
 * the "Go back" button works regardless of which stack the screen lives in.
 */
export function ScreenErrorBoundary({
  children,
  screenName,
}: ScreenErrorBoundaryProps) {
  const navigation = useNavigation();

  const handleGoBack = React.useCallback(() => {
    try {
      if (navigation.canGoBack()) {
        navigation.goBack();
      }
    } catch {
      // Navigation must never crash during error recovery.
    }
  }, [navigation]);

  return (
    <ScreenErrorBoundaryInner screenName={screenName} onGoBack={handleGoBack}>
      {children}
    </ScreenErrorBoundaryInner>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// withScreenErrorBoundary — HOC factory for React Navigation's getComponent.
// ──────────────────────────────────────────────────────────────────────────
// Wraps a lazily-loaded screen component with ScreenErrorBoundary while
// preserving the lazy-loading semantics of `getComponent`. The factory
// returns a function compatible with `getComponent` that memoises the
// wrapped component so React Navigation sees a stable component reference.
//
// Usage:
//   <Stack.Screen
//     name="ItemDetail"
//     getComponent={withScreenErrorBoundary(
//       () => require('../screens/ItemDetailScreen').default,
//       'ItemDetail',
//     )}
//   />
// ──────────────────────────────────────────────────────────────────────────

type ScreenComponent = React.ComponentType<Record<string, unknown>>;

/**
 * Wrap a lazy-loaded screen with ScreenErrorBoundary. Returns a function
 * suitable for React Navigation's `getComponent` prop.
 */
export function withScreenErrorBoundary(
  loadScreen: () => ScreenComponent,
  screenName: string,
): () => ScreenComponent {
  let cached: ScreenComponent | null = null;
  return () => {
    if (cached) return cached;
    const Screen = loadScreen();
    const Wrapped: ScreenComponent = (props) => (
      <ScreenErrorBoundary screenName={screenName}>
        <Screen {...props} />
      </ScreenErrorBoundary>
    );
    Wrapped.displayName = `ScreenErrorBoundary.${screenName}`;
    cached = Wrapped;
    return Wrapped;
  };
}
