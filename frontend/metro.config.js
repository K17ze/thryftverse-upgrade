const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Ensure transitive CJS helpers are resolvable from all packages.
config.resolver = config.resolver || {};
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  tslib: path.resolve(__dirname, 'node_modules/tslib'),
};

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
