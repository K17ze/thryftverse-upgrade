import React, { ErrorInfo, ReactNode } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { RetryState } from './RetryState';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { trackTelemetryEvent } from '../lib/telemetry';
import { Sentry } from '../lib/sentry';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMsg: string;
}

class ErrorBoundaryClass extends React.Component<Props & { colors: ThemeColors }, State> {
  constructor(props: Props & { colors: ThemeColors }) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }

  static getDerivedStateFromError(error: Error): State {
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

export function ErrorBoundary(props: Props) {
  const { colors } = useAppTheme();
  return <ErrorBoundaryClass {...props} colors={colors} />;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
  });
}
