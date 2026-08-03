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
    return pluginName !== '@stripe/stripe-react-native'
      && pluginName !== '@sentry/react-native/expo';
  });

  // Sentry Expo plugin — only register when auth token is present so dev builds
  // without Sentry don't break. Set SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT
  // as EAS secrets: eas secret:create --scope project --name SENTRY_AUTH_TOKEN --value <token>
  const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN?.trim();
  const sentryOrg = process.env.SENTRY_ORG?.trim();
  const sentryProject = process.env.SENTRY_PROJECT?.trim();
  const hasSentryConfig = Boolean(sentryAuthToken && sentryOrg && sentryProject);

  const plugins = [
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
  ];

  if (hasSentryConfig) {
    const SentryExpoPlugin = require('@sentry/react-native/expo');
    plugins.push([
      SentryExpoPlugin,
      {
        organization: sentryOrg,
        project: sentryProject,
        authToken: sentryAuthToken,
      },
    ]);
  }

  return {
    ...appJson,
    expo: {
      ...appJson.expo,
      plugins,
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
