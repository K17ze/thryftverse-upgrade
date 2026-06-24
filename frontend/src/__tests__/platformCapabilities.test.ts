import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const PLATFORM_DIR = path.resolve(__dirname, '../platform');

function readFile(rel: string): string {
  return fs.readFileSync(path.join(PLATFORM_DIR, rel), 'utf-8');
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(PLATFORM_DIR, rel));
}

describe('Platform: Native UI adapters', () => {
  it('NativeSheet wraps @expo/ui BottomSheet', () => {
    const src = readFile('native/NativeSheet.tsx');
    expect(src).toContain('BottomSheet');
    expect(src).toContain('@expo/ui');
    expect(src).toContain('export function NativeSheet');
  });

  it('NativeSheet wraps children in ExpoUIHost', () => {
    const src = readFile('native/NativeSheet.tsx');
    expect(src).toContain('ExpoUIHost');
  });

  it('NativePicker wraps @expo/ui Picker', () => {
    const src = readFile('native/NativePicker.tsx');
    expect(src).toContain('Picker');
    expect(src).toContain('@expo/ui');
    expect(src).toContain('export function NativePicker');
  });

  it('NativeMenu provides a menu overlay', () => {
    const src = readFile('native/NativeMenu.tsx');
    expect(src).toContain('export function NativeMenu');
    expect(src).toContain('NativeMenuOption');
  });

  it('NativeSegmentedControl provides segmented selection', () => {
    const src = readFile('native/NativeSegmentedControl.tsx');
    expect(src).toContain('export function NativeSegmentedControl');
    expect(src).toContain('NativeSegmentedControlOption');
  });

  it('NativePager provides paged navigation', () => {
    const src = readFile('native/NativePager.tsx');
    expect(src).toContain('export function NativePager');
    expect(src).toContain('NativePagerPage');
  });

  it('ExpoUIHost wraps @expo/ui Host and RNHostView', () => {
    const src = readFile('native/ExpoUIHost.tsx');
    expect(src).toContain('Host');
    expect(src).toContain('RNHostView');
    expect(src).toContain('export function ExpoUIHost');
  });

  it('native barrel exports all adapters including ExpoUIHost and Platform aliases', () => {
    const src = readFile('native/index.ts');
    expect(src).toContain('NativeSheet');
    expect(src).toContain('NativeMenu');
    expect(src).toContain('NativeSegmentedControl');
    expect(src).toContain('NativePager');
    expect(src).toContain('NativePicker');
    expect(src).toContain('ExpoUIHost');
    expect(src).toContain('PlatformMenu');
    expect(src).toContain('PlatformSegmentedControl');
    expect(src).toContain('PlatformPager');
  });
});

describe('Platform: Keyboard adapters', () => {
  it('KeyboardProvider wraps react-native-keyboard-controller', () => {
    const src = readFile('keyboard/KeyboardProvider.tsx');
    expect(src).toContain('react-native-keyboard-controller');
    expect(src).toContain('KeyboardProvider');
  });

  it('KeyboardDock wraps KeyboardStickyView', () => {
    const src = readFile('keyboard/KeyboardDock.tsx');
    expect(src).toContain('KeyboardStickyView');
    expect(src).toContain('KeyboardDock');
  });

  it('KeyboardAwareStickyAction composes scroll + sticky action', () => {
    const src = readFile('keyboard/KeyboardAwareStickyAction.tsx');
    expect(src).toContain('KeyboardAwareScrollView');
    expect(src).toContain('KeyboardAwareStickyAction');
  });

  it('keyboard barrel exports all adapters', () => {
    const src = readFile('keyboard/index.ts');
    expect(src).toContain('KeyboardProvider');
    expect(src).toContain('KeyboardDock');
    expect(src).toContain('KeyboardAwareStickyAction');
  });
});

describe('Platform: Server state adapters', () => {
  it('ServerStateProvider wraps QueryClientProvider', () => {
    const src = readFile('server/ServerStateProvider.tsx');
    expect(src).toContain('QueryClientProvider');
    expect(src).toContain('ServerStateProvider');
  });

  it('queryClient has retry function and default options', () => {
    const src = readFile('server/queryClient.ts');
    expect(src).toContain('QueryClient');
    expect(src).toContain('staleTime');
    expect(src).toContain('retry');
    expect(src).toContain('shouldRetry');
    expect(src).toContain('NON_RETRYABLE_STATUS_CODES');
  });

  it('queryKeys provides typed key factory with notifications', () => {
    const src = readFile('server/queryKeys.ts');
    expect(src).toContain('queryKeys');
    expect(src).toContain('user');
    expect(src).toContain('listing');
    expect(src).toContain('auction');
    expect(src).toContain('chat');
    expect(src).toContain('discover');
    expect(src).toContain('notifications');
  });

  it('useMobileQueryLifecycle wires NetInfo and AppState', () => {
    const src = readFile('server/useMobileQueryLifecycle.ts');
    expect(src).toContain('NetInfo');
    expect(src).toContain('onlineManager');
    expect(src).toContain('AppState');
    expect(src).toContain('focusManager');
  });

  it('clearUserScopedQueryCache cancels and removes user queries', () => {
    const src = readFile('server/clearUserCache.ts');
    expect(src).toContain('cancelQueries');
    expect(src).toContain('removeQueries');
    expect(src).toContain('user');
    expect(src).toContain('chat');
  });

  it('usePublicProfileQuery provides pilot query hook', () => {
    const src = readFile('server/usePublicProfileQuery.ts');
    expect(src).toContain('useQuery');
    expect(src).toContain('fetchPublicProfile');
    expect(src).toContain('queryKeys');
  });

  it('server barrel exports all adapters', () => {
    const src = readFile('server/index.ts');
    expect(src).toContain('ServerStateProvider');
    expect(src).toContain('queryClient');
    expect(src).toContain('queryKeys');
    expect(src).toContain('useMobileQueryLifecycle');
    expect(src).toContain('clearUserScopedQueryCache');
    expect(src).toContain('usePublicProfileQuery');
  });
});

describe('Platform: Form adapters', () => {
  it('ControlledAppInput uses react-hook-form Controller', () => {
    const src = readFile('forms/ControlledAppInput.tsx');
    expect(src).toContain('Controller');
    expect(src).toContain('ControlledAppInput');
  });

  it('ControlledSelect uses NativePicker', () => {
    const src = readFile('forms/ControlledSelect.tsx');
    expect(src).toContain('Controller');
    expect(src).toContain('NativePicker');
  });

  it('ControlledToggle uses @expo/ui Switch', () => {
    const src = readFile('forms/ControlledToggle.tsx');
    expect(src).toContain('Controller');
    expect(src).toContain('Switch');
    expect(src).toContain('@expo/ui');
  });

  it('FormErrorSummary renders field errors', () => {
    const src = readFile('forms/FormErrorSummary.tsx');
    expect(src).toContain('FormErrorSummary');
    expect(src).toContain('FieldErrors');
  });

  it('useUnsavedFormGuard provides dirty state guard', () => {
    const src = readFile('forms/useUnsavedFormGuard.ts');
    expect(src).toContain('useUnsavedFormGuard');
    expect(src).toContain('isDirty');
  });

  it('forms barrel exports all adapters', () => {
    const src = readFile('forms/index.ts');
    expect(src).toContain('ControlledAppInput');
    expect(src).toContain('ControlledSelect');
    expect(src).toContain('ControlledToggle');
    expect(src).toContain('FormErrorSummary');
    expect(src).toContain('useUnsavedFormGuard');
  });
});

describe('Platform: Media transforms', () => {
  it('mediaTransforms wraps expo-image-manipulator with all 10 operations', () => {
    const src = readFile('media/mediaTransforms.ts');
    expect(src).toContain('manipulateAsync');
    expect(src).toContain('expo-image-manipulator');
    expect(src).toContain('compressImage');
    expect(src).toContain('resizeImage');
    expect(src).toContain('cropImage');
    expect(src).toContain('rotateImage');
    expect(src).toContain('flipImage');
    expect(src).toContain('normalizeImage');
    expect(src).toContain('resizeForUpload');
    expect(src).toContain('cropToAspectRatio');
    expect(src).toContain('createThumbnail');
    expect(src).toContain('exportImage');
  });

  it('mediaTransforms exports MediaTransformResult type', () => {
    const src = readFile('media/mediaTransforms.ts');
    expect(src).toContain('MediaTransformResult');
    expect(src).toContain('mimeType');
    expect(src).toContain('fileExtension');
  });

  it('media barrel exports all transform functions', () => {
    const src = readFile('media/index.ts');
    expect(src).toContain('mediaTransforms');
    expect(src).toContain('normalizeImage');
    expect(src).toContain('resizeForUpload');
    expect(src).toContain('cropToAspectRatio');
    expect(src).toContain('createThumbnail');
    expect(src).toContain('exportImage');
  });
});

describe('Platform: Monitoring adapters', () => {
  it('sentry.ts provides initSentry, isSentryInitialised, and Sentry proxy', () => {
    const src = readFile('monitoring/sentry.ts');
    expect(src).toContain('initSentry');
    expect(src).toContain('Sentry');
    expect(src).toContain('@sentry/react-native');
    expect(src).toContain('isSentryInitialised');
    expect(src).toContain('resetSentryForTesting');
    expect(src).toContain('SentryInitOptions');
  });

  it('sentry.ts has beforeSend that strips sensitive data', () => {
    const src = readFile('monitoring/sentry.ts');
    expect(src).toContain('beforeSend');
    expect(src).toContain('headers');
    expect(src).toContain('cookies');
  });

  it('AppErrorBoundary extends React.Component', () => {
    const src = readFile('monitoring/AppErrorBoundary.tsx');
    expect(src).toContain('AppErrorBoundary');
    expect(src).toContain('componentDidCatch');
    expect(src).toContain('Sentry');
  });

  it('monitoring barrel exports all adapters', () => {
    const src = readFile('monitoring/index.ts');
    expect(src).toContain('AppErrorBoundary');
    expect(src).toContain('Sentry');
    expect(src).toContain('initSentry');
    expect(src).toContain('isSentryInitialised');
  });
});

describe('Platform: Root barrel', () => {
  it('exports all platform modules', () => {
    const src = readFile('index.ts');
    expect(src).toContain('./native');
    expect(src).toContain('./keyboard');
    expect(src).toContain('./server');
    expect(src).toContain('./forms');
    expect(src).toContain('./media');
    expect(src).toContain('./monitoring');
  });
});

describe('Platform: SDK 56 configuration', () => {
  it('app.json has EAS Update config', () => {
    const appJson = fs.readFileSync(path.resolve(__dirname, '../../app.json'), 'utf-8');
    const config = JSON.parse(appJson);
    expect(config.expo.updates).toBeDefined();
    expect(config.expo.updates.url).toContain('u.expo.dev');
    expect(config.expo.runtimeVersion).toBeDefined();
    expect(config.expo.runtimeVersion.policy).toBe('sdkVersion');
  });

  it('app.json has expo-updates plugin', () => {
    const appJson = fs.readFileSync(path.resolve(__dirname, '../../app.json'), 'utf-8');
    const config = JSON.parse(appJson);
    expect(config.expo.plugins).toContain('expo-updates');
  });

  it('app.json has @sentry/react-native plugin', () => {
    const appJson = fs.readFileSync(path.resolve(__dirname, '../../app.json'), 'utf-8');
    const config = JSON.parse(appJson);
    expect(config.expo.plugins).toContain('@sentry/react-native');
  });

  it('app.json has splash config in expo-splash-screen plugin (not top-level)', () => {
    const appJson = fs.readFileSync(path.resolve(__dirname, '../../app.json'), 'utf-8');
    const config = JSON.parse(appJson);
    expect(config.expo.splash).toBeUndefined();
    const splashPlugin = config.expo.plugins.find(
      (p: any) => Array.isArray(p) && p[0] === 'expo-splash-screen'
    );
    expect(splashPlugin).toBeDefined();
    expect(splashPlugin[1].image).toBeDefined();
  });

  it('eas.json has channels for all build profiles', () => {
    const easJson = fs.readFileSync(path.resolve(__dirname, '../../eas.json'), 'utf-8');
    const config = JSON.parse(easJson);
    expect(config.build.development.channel).toBe('development');
    expect(config.build.preview.channel).toBe('preview');
    expect(config.build.production.channel).toBe('production');
  });
});
