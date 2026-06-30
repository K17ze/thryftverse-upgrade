import React, { ErrorInfo, ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { RetryState } from '../../components/RetryState';
import { Colors } from '../../constants/colors';
import { trackTelemetryEvent } from '../../lib/telemetry';
import { Sentry } from './sentry';

interface AppErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  errorMsg: string;
}

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
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
      return (
        <View style={styles.container}>
          <RetryState onRetry={this.handleRetry} message={this.state.errorMsg} />
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
