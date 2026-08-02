import React, { ErrorInfo, ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { RetryState } from '../../components/RetryState';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { trackTelemetryEvent } from '../../lib/telemetry';
import { Sentry } from './sentry';

interface AppErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  colors: ThemeColors;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  errorMsg: string;
}

class AppErrorBoundaryInner extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { hasError: true, errorMsg: error.message };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    trackTelemetryEvent('error_boundary_crash', {
      error_name: error.name,
      error_message: error.message,
      component_stack: errorInfo.componentStack ?? '',
    });

    Sentry.captureException?.(error, {
      contexts: {
        react: { componentStack: errorInfo.componentStack ?? '' },
      },
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMsg: '' });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return <>{this.props.fallback}</>;
      }
      const styles = createStyles(this.props.colors);
      return (
        <View style={styles.container}>
          <RetryState onRetry={this.handleRetry} message={this.state.errorMsg} />
        </View>
      );
    }
    return this.props.children;
  }
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
  },
  });
}
