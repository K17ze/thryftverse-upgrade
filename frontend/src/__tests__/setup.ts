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

// Store tests exercise real Zustand actions, but analytics is an external
// observer of those actions. Mock the app-owned analytics boundary so a store
// import does not eagerly load PostHog and React Navigation's native runtime.
vi.mock('../analytics', () => ({
  identifyUser: vi.fn(),
  resetIdentity: vi.fn(),
}));

// react-native-mmkv loads React Native's Flow source through CommonJS when
// externalized by Vitest. Node cannot parse RN's `import typeof` syntax, and
// vi.mock('react-native') cannot intercept that nested CommonJS require. This
// in-memory adapter preserves the storage/listener contract used by Zustand.
vi.mock('react-native-mmkv', () => {
  type StoredValue = boolean | string | number | ArrayBuffer;
  const stores = new Map<string, Map<string, StoredValue>>();
  const listeners = new Map<string, Set<(key: string) => void>>();

  const createMMKV = ({ id = 'default' }: { id?: string } = {}) => {
    const store = stores.get(id) ?? new Map<string, StoredValue>();
    const storeListeners = listeners.get(id) ?? new Set<(key: string) => void>();
    stores.set(id, store);
    listeners.set(id, storeListeners);

    const notify = (key: string) => storeListeners.forEach((listener) => listener(key));
    return {
      id,
      set: (key: string, value: StoredValue) => {
        store.set(key, value);
        notify(key);
      },
      getBoolean: (key: string) => {
        const value = store.get(key);
        return typeof value === 'boolean' ? value : undefined;
      },
      getString: (key: string) => {
        const value = store.get(key);
        return typeof value === 'string' ? value : undefined;
      },
      getNumber: (key: string) => {
        const value = store.get(key);
        return typeof value === 'number' ? value : undefined;
      },
      contains: (key: string) => store.has(key),
      remove: (key: string) => {
        const removed = store.delete(key);
        if (removed) notify(key);
        return removed;
      },
      getAllKeys: () => Array.from(store.keys()),
      clearAll: () => {
        const keys = Array.from(store.keys());
        store.clear();
        keys.forEach(notify);
      },
      addOnValueChangedListener: (listener: (key: string) => void) => {
        storeListeners.add(listener);
        return { remove: () => storeListeners.delete(listener) };
      },
    };
  };

  return {
    createMMKV,
    MMKV: class {
      private readonly storage;

      constructor(configuration?: { id?: string }) {
        this.storage = createMMKV(configuration);
      }

      getString(key: string) {
        return this.storage.getString(key);
      }

      getBoolean(key: string) {
        return this.storage.getBoolean(key);
      }

      getNumber(key: string) {
        return this.storage.getNumber(key);
      }

      contains(key: string) {
        return this.storage.contains(key);
      }

      set(key: string, value: StoredValue) {
        this.storage.set(key, value);
      }

      remove(key: string) {
        return this.storage.remove(key);
      }

      getAllKeys() {
        return this.storage.getAllKeys();
      }

      clearAll() {
        this.storage.clearAll();
      }

      addOnValueChangedListener(listener: (key: string) => void) {
        return this.storage.addOnValueChangedListener(listener);
      }
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
    useWindowDimensions: () => ({ width: 375, height: 812, scale: 3, fontScale: 1 }),
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

vi.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: vi.fn(),
  launchCameraAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(() => Promise.resolve({ status: 'granted' })),
  requestCameraPermissionsAsync: vi.fn(() => Promise.resolve({ status: 'granted' })),
  MediaTypeOptions: { Images: 'Images', Videos: 'Videos', All: 'All' },
  cameraType: { back: 'back', front: 'front' },
}));

vi.mock('expo-haptics', () => ({
  impactAsync: vi.fn(),
  notificationAsync: vi.fn(),
  selectionAsync: vi.fn(),
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium', Heavy: 'Heavy' },
  NotificationFeedbackType: { Success: 'Success', Warning: 'Warning', Error: 'Error' },
}));

vi.mock('expo-image', () => {
  const React = require('react');
  return {
    default: React.forwardRef((props: any, ref: any) =>
      React.createElement('Image', { ref, ...props })
    ),
  };
});

vi.mock('expo-modules-core', () => {
  const React = require('react');
  return {
    EventEmitter: class {
      addListener() { return { remove: () => {} }; }
      emit() {}
      removeAllListeners() {}
    },
    requireNativeModule: () => ({
      addListener: () => ({ remove: () => {} }),
      removeListener: () => {},
    }),
    requireOptionalNativeModule: () => null,
    requireNativeViewManager: (name: string) =>
      React.forwardRef((props: any, ref: any) =>
        React.createElement(name, { ref, ...props })
      ),
    NativeModule: class {},
  };
});

vi.mock('expo-network', () => ({
  getNetworkStateAsync: vi.fn(() => Promise.resolve({ isConnected: true, type: 'wifi' })),
  addEventListener: () => () => {},
}));

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(() => Promise.resolve(null)),
  setItemAsync: vi.fn(() => Promise.resolve()),
  deleteItemAsync: vi.fn(() => Promise.resolve()),
}));

vi.mock('expo-notifications', () => ({
  getPermissionsAsync: vi.fn(() =>
    Promise.resolve({ status: 'granted', canAskAgain: true, expires: 'never', granted: true }),
  ),
  requestPermissionsAsync: vi.fn(() =>
    Promise.resolve({ status: 'granted', canAskAgain: true, expires: 'never', granted: true }),
  ),
  setNotificationChannelAsync: vi.fn(() => Promise.resolve()),
  AndroidImportance: { MAX: 'max', HIGH: 'high', DEFAULT: 'default', LOW: 'low', MIN: 'min' },
  addNotificationReceivedListener: () => ({ remove: () => {} }),
  addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
  getLastNotificationResponseAsync: vi.fn(() => Promise.resolve(null)),
  setNotificationHandler: vi.fn(),
}));
