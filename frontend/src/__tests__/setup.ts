import { vi } from 'vitest';

(globalThis as any).__DEV__ = true;

vi.mock('@react-native-async-storage/async-storage', () => {
  return {
    default: {
      setItem: vi.fn(() => Promise.resolve()),
      getItem: vi.fn(() => Promise.resolve(null)),
      removeItem: vi.fn(() => Promise.resolve()),
      clear: vi.fn(() => Promise.resolve()),
      getAllKeys: vi.fn(() => Promise.resolve([])),
      multiGet: vi.fn(() => Promise.resolve([])),
      multiSet: vi.fn(() => Promise.resolve()),
      multiRemove: vi.fn(() => Promise.resolve()),
    },
  };
});

// Minimal react-native mock for node test environment
vi.mock('react-native', async () => {
  const React = await import('react');
  const createMock = (name: string) =>
    React.forwardRef((props: any, ref: any) =>
      React.createElement(name, { ref, ...props })
    );
  return {
    View: createMock('View'),
    Text: createMock('Text'),
    TextInput: createMock('TextInput'),
    ScrollView: createMock('ScrollView'),
    FlatList: createMock('FlatList'),
    Pressable: createMock('Pressable'),
    TouchableOpacity: createMock('TouchableOpacity'),
    KeyboardAvoidingView: createMock('KeyboardAvoidingView'),
    SafeAreaView: createMock('SafeAreaView'),
    StatusBar: createMock('StatusBar'),
    ActivityIndicator: createMock('ActivityIndicator'),
    RefreshControl: createMock('RefreshControl'),
    Modal: createMock('Modal'),
    StyleSheet: {
      create: (s: any) => s,
    },
    Platform: { OS: 'ios', select: (obj: any) => obj.ios },
    Dimensions: {
      get: () => ({ width: 375, height: 812, scale: 3, fontScale: 1 }),
    },
    Appearance: {
      getColorScheme: () => 'light',
      addChangeListener: () => ({ remove: () => {} }),
    },
  };
});

vi.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaView: React.forwardRef((props: any, ref: any) =>
      React.createElement('SafeAreaView', { ref, ...props })
    ),
    useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
  };
});

vi.mock('react-native-reanimated', () => {
  const React = require('react');
  const createMock = (name: string) =>
    React.forwardRef((props: any, ref: any) =>
      React.createElement(name, { ref, ...props })
    );
  return {
    default: {
      View: createMock('ReanimatedView'),
      ScrollView: createMock('ReanimatedScrollView'),
      createAnimatedComponent: (Comp: any) => Comp,
    },
    useSharedValue: (v: any) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    useAnimatedScrollHandler: () => ({}),
    interpolate: () => 0,
    interpolateColor: () => 'black',
    Extrapolation: { CLAMP: 'clamp' },
    FadeInDown: { duration: () => ({ delay: () => ({}) }) },
    FadeIn: { duration: () => ({}) },
    FadeOut: { duration: () => ({}) },
    FadeInUp: { duration: () => ({}) },
    SlideInRight: { duration: () => ({}) },
    ZoomIn: { duration: () => ({}) },
    withSpring: (v: any) => v,
    withTiming: (v: any) => v,
    withSequence: (...args: any[]) => args,
    withDelay: (_d: any, v: any) => v,
    runOnJS: (fn: any) => fn,
  };
});

vi.mock('@expo/vector-icons', () => {
  const React = require('react');
  return {
    Ionicons: React.forwardRef((props: any, ref: any) =>
      React.createElement('Ionicons', { ref, ...props })
    ),
  };
});

vi.mock('@expo/vector-icons/Ionicons', () => {
  const React = require('react');
  return {
    default: React.forwardRef((props: any, ref: any) =>
      React.createElement('Ionicons', { ref, ...props })
    ),
  };
});

vi.mock('@sentry/react-native', () => ({
  init: vi.fn(),
  setTag: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  setUser: vi.fn(),
  setContext: vi.fn(),
  withScope: vi.fn(),
}));

vi.mock('@react-native-community/netinfo', () => ({
  default: {
    addEventListener: () => () => {},
  },
}));

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {},
      version: '1.0.0',
    },
  },
}));