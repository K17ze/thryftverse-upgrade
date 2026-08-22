const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Ensure transitive CJS helpers are resolvable from all packages.
config.resolver = config.resolver || {};
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  tslib: path.resolve(__dirname, 'node_modules/tslib'),
};

// ── inlineRequires — deferred module evaluation for faster cold start ──
// Metro's inlineRequires transform moves each require() from the top of the
// module factory to the first place the binding is used. The module's
// top-level code then runs lazily — only when the first code path that
// needs it executes. This is a TTI lever (not a bundle-size lever): the
// module is still in the bundle, but its side effects and top-level
// computations are deferred.
//
// Expo disables inlineRequires by default (PR #25089 → reverted in #25680)
// because the transform does not respect module side-effects — a module
// that patches globals or registers middleware at top level may be
// evaluated late or never. We opt in with a blockList for known
// side-effect modules, following the 2026 best-practice pattern.
//
// Complementary to React Navigation's getComponent(() => require(...))
// pattern: getComponent defers screen modules; inlineRequires defers the
// non-screen modules (utilities, components, libraries) imported eagerly
// throughout the dependency graph. Together they reduce cold-start
// metroRequire time — a large Android app profiled 2.8s of synchronous
// metroRequire calls that this transform defers.
//
// Sources:
//   https://andrei-calazans.com/posts/2026-06-02-how-metro-inlined-requires-work/
//   https://reactnative.dev/docs/optimizing-javascript-loading
//   https://github.com/expo/expo/pull/25680
config.transformer = config.transformer || {};
config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: true, // Expo default — enables default/namespace import inlining
    inlineRequires: {
      // Per-file opt-out for modules with required side effects.
      // require() calls inside these files will NOT be inlined.
      // Add modules that mutate globals, register stores/sagas/middleware,
      // or patch prototypes at top level here.
      blockList: {
        // Example (uncomment if a side-effect module breaks):
        // [require.resolve('./src/polyfills/setup.js')]: true,
      },
    },
  },
});

// ── Web shim for @stripe/stripe-react-native ──────────────────────────
// The native module imports codegenNativeCommands which crashes Metro on web.
// Intercept resolution on web only; native platforms use the real module.
const stripeShimPath = path.resolve(__dirname, 'src/platform/stripe-web-shim.ts');
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === '@stripe/stripe-react-native') {
    return { type: 'sourceFile', filePath: stripeShimPath };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  // Fallback to Metro's built-in resolvers via context
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
