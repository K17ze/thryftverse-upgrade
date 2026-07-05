// Hermes polyfill must run before ANY module evaluation.
// This fixes the "property is not configurable" error from RN 0.85 Event constants.
import './polyfills/hermes-defineProperty';

// Sentry must initialise before any other code runs.
import './src/lib/sentry';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
