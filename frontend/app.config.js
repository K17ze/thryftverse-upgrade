const appJson = require('./app.json');

module.exports = function () {
  const buildProfile = process.env.EAS_BUILD_PROFILE;
  const isDevBuild =
    buildProfile === 'development' || buildProfile === 'development-simulator';
  const stripeMerchantIdentifier =
    process.env.EXPO_PUBLIC_STRIPE_APPLE_MERCHANT_IDENTIFIER?.trim();
  const stripeGooglePayEnabled =
    process.env.EXPO_PUBLIC_STRIPE_GOOGLE_PAY_ENABLED === 'true';
  const configuredPlugins = appJson.expo.plugins.filter((plugin) => {
    const pluginName = Array.isArray(plugin) ? plugin[0] : plugin;
    return pluginName !== '@stripe/stripe-react-native';
  });

  return {
    ...appJson,
    expo: {
      ...appJson.expo,
      plugins: [
        ...configuredPlugins,
        [
          '@stripe/stripe-react-native',
          {
            ...(stripeMerchantIdentifier
              ? { merchantIdentifier: stripeMerchantIdentifier }
              : {}),
            enableGooglePay: stripeGooglePayEnabled,
          },
        ],
      ],
      updates: {
        ...appJson.expo.updates,
        // EAS development builds should always load from Metro, never from a
        // published update. Otherwise a stale update on the development channel
        // overrides local changes and real-time iteration breaks.
        ...(isDevBuild ? { enabled: false } : {}),
      },
    },
  };
};
