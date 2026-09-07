import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

// Mock ThemeContext before importing components
vi.mock('../theme/ThemeContext', () => {
  const React = require('react');
  const mockColors = {
    background: '#0A0A0A',
    surface: '#141414',
    surfaceElevated: '#242424',
    surfaceAlt: '#1C1C1C',
    textPrimary: '#FFFFFF',
    textSecondary: '#A3A3A3',
    textMuted: '#7A7A7A',
    textInverse: '#0A0A0A',
    border: '#262626',
    borderSubtle: '#1E1E1E',
    brand: '#F4F0E8',
    brandSubtle: 'rgba(244,240,232,0.08)',
    success: '#215634',
    warning: '#8B6500',
    danger: '#9b0202',
    overlay: 'rgba(0,0,0,0.6)',
  };
  const ctx = {
    themePreference: 'dark' as const,
    resolvedTheme: 'dark' as const,
    colors: mockColors,
    isDark: true,
    setThemePreference: () => {},
  };
  return {
    useAppTheme: () => ctx,
    AppThemeProvider: ({ children }: any) => children,
  };
});

vi.mock('../lib/telemetry', () => ({
  trackTelemetryEvent: vi.fn(),
}));

vi.mock('../platform/monitoring/sentry', () => ({
  Sentry: {
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    captureMessage: vi.fn(),
  },
  isSentryAvailable: () => false,
  setSentryUser: vi.fn(),
}));

vi.mock('../platform/monitoring/appNavigation', () => ({
  resetNavigationToHome: vi.fn(),
  getAppNavigationRef: () => null,
}));

vi.mock('../hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

vi.mock('react-native-reanimated', () => {
  const React = require('react');
  return {
    FadeIn: { duration: () => ({}) },
    default: {
      View: React.forwardRef((props: any, ref: any) =>
        React.createElement('ReanimatedView', { ref, ...props })
      ),
      Text: React.forwardRef((props: any, ref: any) =>
        React.createElement('ReanimatedText', { ref, ...props })
      ),
    },
  };
});

vi.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

vi.mock('../components/AnimatedPressable', () => ({
  AnimatedPressable: 'AnimatedPressable',
}));

vi.mock('expo-linking', () => ({
  createURL: () => 'thryftverse://',
}));

vi.mock('expo-updates', () => ({
  reloadAsync: vi.fn(),
}));

import { AppErrorBoundary } from '../platform/monitoring/AppErrorBoundary';
import { trackTelemetryEvent } from '../lib/telemetry';

function CrashTrigger(): React.ReactElement {
  throw new Error('Test crash from CrashTrigger');
}

function SafeChild(): React.ReactElement {
  return React.createElement('Text', null, 'Safe content');
}

describe('AppErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(AppErrorBoundary, null, React.createElement(SafeChild))
      );
    });
    const jsonStr = JSON.stringify(renderer?.toJSON());
    expect(jsonStr).toContain('Safe content');
  });

  it('catches errors and renders the crash recovery UI', () => {
    // Suppress console.error for the expected crash
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(AppErrorBoundary, null, React.createElement(CrashTrigger))
      );
    });

    const json = renderer?.toJSON();
    // The crash recovery UI should contain "The app couldn't continue"
    const jsonStr = JSON.stringify(json);
    expect(jsonStr).toContain("The app couldn't continue");

    // The telemetry event should have been fired
    expect(trackTelemetryEvent).toHaveBeenCalledWith(
      'error_boundary_crash',
      expect.objectContaining({
        error_name: 'Error',
        error_message: 'Test crash from CrashTrigger',
      })
    );

    consoleSpy.mockRestore();
  });

  it('renders a custom fallback when provided', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const customFallback = React.createElement('Text', null, 'Custom fallback UI');
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(
          AppErrorBoundary,
          { fallback: customFallback, children: React.createElement(CrashTrigger) },
        )
      );
    });

    const json = renderer?.toJSON();
    const jsonStr = JSON.stringify(json);
    expect(jsonStr).toContain('Custom fallback UI');

    consoleSpy.mockRestore();
  });
});
