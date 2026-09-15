// Hermes polyfill must run before ANY module evaluation.
// This fixes the "property is not configurable" error from RN 0.85 Event constants.
import './polyfills/hermes-defineProperty';

// Sentry must initialise before any other code runs.
import './src/lib/sentry';

import { Platform } from 'react-native';
import { registerRootComponent } from 'expo';

// LiveKit: register WebRTC globals before any room code runs. Guarded so a
// missing native module (Expo Go, web) degrades to the honest 'unavailable'
// state in useLiveKitRoom instead of crashing app startup. require() (not a
// static import) so a hard failure during the package's module init is
// caught here too.
if (Platform.OS !== 'web') {
  try {
    require('@livekit/react-native').registerGlobals();
  } catch {
    // Native module absent — useLiveKitRoom's native probe reports it.
  }
}

import App from './App';
import { ObserveRoot } from './src/platform/monitoring';

// EAS Observe: wrap the root component so launch metrics (cold launch, warm
// launch, TTR, TTI, bundle load) are collected from the native side. The
// wrapper no-ops when expo-observe is not installed, so this is always safe.
const ObservedApp = ObserveRoot.wrap(App);

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(ObservedApp);
