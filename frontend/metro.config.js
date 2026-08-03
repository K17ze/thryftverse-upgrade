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
// Intercept resolution and redirect to a no-op shim on web only.
const stripeShimPath = path.resolve(__dirname, 'src/platform/stripe-web-shim.ts');
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Only shim on web; native platforms use the real module
  if (platform === 'web' && moduleName === '@stripe/stripe-react-native') {
    return {
      type: 'sourceFile',
      filePath: stripeShimPath,
    };
  }
  // Defer to the original resolver for everything else
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  // Fallback: let Metro's default resolver handle it
  return context.resolveModule(context, moduleName, platform);
};

module.exports = config;
