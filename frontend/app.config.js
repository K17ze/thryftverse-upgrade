const appJson = require('./app.json');

/**
 * Env-var gating for EAS build profiles.
 *
 * `EXPO_PUBLIC_*` variables are inlined at build time by EAS, so the values
 * declared in `eas.json` per-profile `env` blocks become the runtime source of
 * truth. We surface them through `expo.extra` so the running app can read them
 * via `Constants.expoConfig.extra` (used by Sentry init, API base URL, etc.).
 *
 * Sensitive values (SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT, API secrets)
 * must NEVER be committed — set them as EAS secrets:
 *   eas secret:create --scope project --name SENTRY_AUTH_TOKEN --value <token>
 *
 * Local fallbacks below only apply when a variable is absent (e.g. running
 * `expo start` locally without a .env file). They keep local dev working
 * without leaking any real configuration.
 */
const DEFAULT_API_BASE_URL = 'http://localhost:4000';
const DEFAULT_ENVIRONMENT = 'development';

function readEnv(name) {
  const value = process.env[name];
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

module.exports = function () {
  const buildProfile = process.env.EAS_BUILD_PROFILE;
  const isDevBuild =
    buildProfile === 'development' || buildProfile === 'development-simulator';

  // Public runtime config — sourced from EXPO_PUBLIC_* env vars with safe
  // local-dev fallbacks so `expo start` works without a .env file.
  const apiUrl = readEnv('EXPO_PUBLIC_API_BASE_URL') ?? DEFAULT_API_BASE_URL;
  const sentryDsn = readEnv('EXPO_PUBLIC_SENTRY_DSN') ?? '';
  const environment =
    readEnv('EXPO_PUBLIC_ENVIRONMENT') ?? DEFAULT_ENVIRONMENT;

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
        // EAS Update code signing — generate keys outside the repo:
        //   eas update:configure-code-signing --key-output-directory ../keys
        // Then uncomment the codeSigningCertificate/codeSigningMetadata lines below.
        // codeSigningCertificate: 'certs/update-certificate.pem',
        // codeSigningMetadata: { keyid: 'main', alg: 'rsa-v1_5-sha256' },
      },
      extra: {
        ...appJson.expo.extra,
        // Public runtime config — readable via Constants.expoConfig.extra.
        // These are NOT secrets; secrets live in EAS secrets, never in the repo.
        apiUrl,
        sentryDsn,
        environment,
      },
    },
  };
};
