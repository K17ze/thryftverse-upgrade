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

module.exports = function ({ config }) {
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

  const intercomAppId = readEnv('EXPO_PUBLIC_INTERCOM_APP_ID') ?? '';
  const intercomAndroidApiKey = readEnv('EXPO_PUBLIC_INTERCOM_ANDROID_API_KEY') ?? '';
  const intercomIosApiKey = readEnv('EXPO_PUBLIC_INTERCOM_IOS_API_KEY') ?? '';
  const intercomRegion = readEnv('EXPO_PUBLIC_INTERCOM_REGION') ?? 'US';

  /**
   * Privacy policy and terms of service URLs.
   *
   * Required for App Store / Play Store submission. These are real URLs
   * (even if the pages are placeholder) — the stores reject submissions
   * without them. Override via EXPO_PUBLIC_* env vars per EAS profile if
   * a different URL is needed for staging/development.
   *
   * Accessible at runtime via:
   *   Constants.expoConfig.extra.privacyPolicyUrl
   *   Constants.expoConfig.extra.termsOfServiceUrl
   */
  const privacyPolicyUrl =
    readEnv('EXPO_PUBLIC_PRIVACY_POLICY_URL') ?? 'https://thryftverse.com/privacy';
  const termsOfServiceUrl =
    readEnv('EXPO_PUBLIC_TERMS_URL') ?? 'https://thryftverse.com/terms';

  const configuredPlugins = config.plugins.filter((plugin) => {
    const pluginName = Array.isArray(plugin) ? plugin[0] : plugin;
    return pluginName !== '@stripe/stripe-react-native'
      && pluginName !== '@sentry/react-native/expo'
      && pluginName !== '@intercom/intercom-react-native';
  });

  // Sentry Expo plugin — only register when auth token is present so dev builds
  // without Sentry don't break. Set SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT
  // as EAS secrets: eas secret:create --scope project --name SENTRY_AUTH_TOKEN --value <token>
  const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN?.trim();
  const sentryOrg = process.env.SENTRY_ORG?.trim();
  const sentryProject = process.env.SENTRY_PROJECT?.trim();
  const hasSentryConfig = Boolean(sentryAuthToken && sentryOrg && sentryProject);

  // Hermes heap-profiling opt-in — set EXPO_HERMES_PROFILING=true to register
  // the withHermesProfiling config plugin, which enables the Hermes inspector
  // in release builds and adds the HERMES_PROFILING_ENABLED gradle/Podfile
  // property. The actual heap snapshot is captured at runtime via Chrome
  // DevTools or scripts/capture-heap-snapshot.sh.
  // See docs/BUNDLE_ANALYSIS.md for the full profiling workflow.
  const hermesProfilingEnabled =
    readEnv('EXPO_HERMES_PROFILING') === 'true';

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
    // expo-build-properties — targetSdkVersion moved here from app.json
    // (app.json no longer accepts targetSdkVersion directly in SDK 56).
    [
      'expo-build-properties',
      {
        android: {
          targetSdkVersion: 36,
        },
      },
    ],
    // expo-localization — enables automatic device locale detection
    'expo-localization',
    // react-native-vision-camera-mlkit — on-device ML (barcode scanning +
    // text recognition). Only the features we use are enabled to keep the
    // native binary lean.
    [
      'react-native-vision-camera-mlkit',
      {
        barcodeScanning: true,
        textRecognition: true,
      },
    ],
    // react-native-share — social sharing (Instagram Stories, TikTok, etc.)
    // Registered with an explicit empty props object because the plugin's
    // config function reads `props.android` / `props.ios` without guarding
    // for undefined. When a plugin is listed as a bare string, Expo passes
    // `props = undefined` (see @expo/config-plugins normalizeStaticPlugin),
    // which crashes prebuild with "Cannot read properties of undefined
    // (reading 'android')". Passing `{}` gives the plugin the object it
    // expects while keeping all defaults.
    ['react-native-share', {}],
    // react-native-haptic-feedback — Core Haptics (no native changes, but
    // registered for Expo CNG compatibility).
    ['react-native-haptic-feedback', {}],
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

  if (hermesProfilingEnabled) {
    plugins.push(require('./plugins/withHermesProfiling'));
  }

  // TrustKit SSL pinning — iOS SPKI pinning via TrustKit config plugin.
  // Only enabled for non-dev builds when EXPO_PUBLIC_SSL_PINNING_ENABLED=true.
  // Dev/staging builds use report-only mode (enforcePinning=false) so
  // certificate rotation doesn't brick the app during development.
  // See plugins/withTrustKit.js for configuration details.
  const sslPinningEnabled = readEnv('EXPO_PUBLIC_SSL_PINNING_ENABLED') === 'true';
  if (sslPinningEnabled && !isDevBuild) {
    const environment = readEnv('EXPO_PUBLIC_ENVIRONMENT') ?? DEFAULT_ENVIRONMENT;
    const enforcePinning = environment === 'production';
    plugins.push([require('./plugins/withTrustKit'), { enforcePinning }]);
  }

  // Android security XML resources — generates network_security_config.xml,
  // backup_rules.xml, and data_extraction_rules.xml so they survive
  // `expo prebuild --clean` / EAS Build. Always registered because the
  // android config below references @xml/* paths that must exist.
  plugins.push(require('./plugins/withAndroidSecurityXml'));

  if (intercomAppId) {
    plugins.push([
      '@intercom/intercom-react-native',
      {
        appId: intercomAppId,
        androidApiKey: intercomAndroidApiKey,
        iosApiKey: intercomIosApiKey,
        intercomRegion,
      },
    ]);
  }

  /**
   * EAS Update code signing.
   *
   * Code signing ensures that OTA updates cannot be tampered with in transit
   * or on the update server. The client verifies the signature against a
   * public key embedded in the binary before applying the update.
   *
   * Key generation (run once, outside the repo):
   *   eas update:configure-code-signing --key-output-directory ../keys
   *
   * This produces:
   *   - keys/update-certificate.pem  (public cert — committed to repo, safe)
   *   - keys/private-key.pem         (private key — NEVER committed, set as
   *                                   EAS secret: EXPO_PUBLIC_OTA_CODE_SIGNING_KEY)
   *
   * The signing key is injected at build time via the
   * EXPO_PUBLIC_OTA_CODE_SIGNING_KEY environment variable. Code signing is
   * only enabled when the key is present, so local dev builds without the
   * key continue to work. Set the key as an EAS secret:
   *   eas secret:create --scope project --name EXPO_PUBLIC_OTA_CODE_SIGNING_KEY --value <key>
   */
  const otaCodeSigningKey = readEnv('EXPO_PUBLIC_OTA_CODE_SIGNING_KEY');
  const hasOtaCodeSigning = Boolean(otaCodeSigningKey) && !isDevBuild;

  /**
   * iOS App Transport Security (ATS) with SSL pinning.
   *
   * iOS does not support SPKI pinning natively via Info.plist. The
   * NSAppTransportSecurity configuration below enforces HTTPS and
   * restricts connections to the production API/CDN domains.
   *
   * For full SPKI-based certificate pinning on iOS, use TrustKit via an
   * Expo config plugin:
   *
   *   1. Install TrustKit: npm install trustkit
   *   2. Create a config plugin (plugins/withTrustKit.js) that injects
   *      the TrustKit initialization code into AppDelegate:
   *        TrustKit.initialize({
   *          pinnedDomains: {
   *            'api.thryftverse.com': {
   *              includeSubdomains: false,
   *              enforcePinning: true,
   *              publicKeyHashes: [
   *                'REPLACE_WITH_API_THRYFTVERSE_COM_SPKI_SHA256',
   *                'REPLACE_WITH_API_THRYFTVERSE_COM_BACKUP_SPKI_SHA256',
   *              ],
   *            },
   *            'cdn.thryftverse.com': {
   *              includeSubdomains: false,
   *              enforcePinning: true,
   *              publicKeyHashes: [
   *                'REPLACE_WITH_CDN_THRYFTVERSE_COM_SPKI_SHA256',
   *                'REPLACE_WITH_CDN_THRYFTVERSE_COM_BACKUP_SPKI_SHA256',
   *              ],
   *            },
   *          },
   *        });
   *   3. Register the plugin in the plugins array below.
   *
   * The SPKI hashes must match the ones in
   * frontend/android/app/src/main/res/xml/network_security_config.xml.
   * Generate them with:
   *   echo | openssl s_client -connect api.thryftverse.com:443 2>/dev/null \
   *     | openssl x509 -pubkey -noout \
   *     | openssl pkey -pubin -outform der \
   *     | openssl dgst -sha256 -binary \
   *     | openssl base64
   */

  /**
   * EAS Update fingerprint configuration.
   *
   * EAS Update uses a "fingerprint" — a hash of the native binary's
   * configuration (native modules, permissions, Info.plist, AndroidManifest,
   * etc.) — to determine whether an OTA update is compatible with the
   * installed binary. If the fingerprint of the update matches the binary's
   * fingerprint, the update is applied over-the-air. If it differs (e.g. a
   * new native module was added), the user is directed to the app store for
   * a full binary update.
   *
   * In Expo SDK 57, the fingerprint is generated automatically by EAS
   * during the build process and embedded in the binary. No explicit
   * `fingerprint` field is needed in app.config.js — EAS CLI computes it
   * from the project's native dependencies and configuration.
   *
   * To inspect the fingerprint of a build:
   *   eas build:view --build-id <build-id>
   *
   * To inspect the fingerprint of an update:
   *   eas update:view --update-id <update-id>
   *
   * When a fingerprint mismatch is detected at runtime, expo-updates
   * will not apply the update and will log a warning. This prevents
   * crashes from incompatible native module versions.
   */

  return {
    ...config,
    plugins,
    android: {
      ...config.android,
      // Network security config — enforces HTTPS, pins production certs,
      // and blocks cleartext traffic except in debug-overrides.
      // See frontend/android/app/src/main/res/xml/network_security_config.xml
      networkSecurityConfig: '@xml/network_security_config',
      // Backup rules — excludes auth tokens, wallet keys, payment data,
      // MMKV storage, and SQLite databases from auto-backup.
      // See frontend/android/app/src/main/res/xml/backup_rules.xml
      fullBackupContent: '@xml/backup_rules',
      // Data extraction rules (Android 12+) — cloud backup + device transfer.
      // See frontend/android/app/src/main/res/xml/data_extraction_rules.xml
      dataExtractionRules: '@xml/data_extraction_rules',
    },
    updates: {
      ...config.updates,
      // EAS development builds should always load from Metro, never from a
      // published update. Otherwise a stale update on the development channel
      // overrides local changes and real-time iteration breaks.
      ...(isDevBuild ? { enabled: false } : {}),
      // EAS Update code signing — enabled when the signing key is present.
      // The certificate (public) is committed; the private key comes from
      // the EXPO_PUBLIC_OTA_CODE_SIGNING_KEY env var / EAS secret.
      ...(hasOtaCodeSigning
        ? {
            codeSigningCertificate: 'keys/update-certificate.pem',
            codeSigningMetadata: { keyid: 'main', alg: 'rsa-v1_5-sha256' },
          }
        : {}),
    },
    ios: {
      ...config.ios,
      infoPlist: {
        ...config.ios?.infoPlist,
        CADisableMinimumFrameDurationOnPhone: true,
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: false,
          NSAllowsLocalNetworking: true,
          NSExceptionDomains: {
            'thryftverse.com': {
              NSIncludesSubdomains: true,
              NSExceptionAllowsInsecureHTTPLoads: false,
              NSMinimumTLSVersion: 'TLSv1.2',
              NSRequiresCertificateTransparency: true,
            },
            'localhost': {
              NSExceptionAllowsInsecureHTTPLoads: true,
              NSIncludesSubdomains: false,
            },
          },
        },
      },
    },
    extra: {
      ...config.extra,
      // Public runtime config — readable via Constants.expoConfig.extra.
      // These are NOT secrets; secrets live in EAS secrets, never in the repo.
      apiUrl,
      sentryDsn,
      environment,
      intercomAppId,
      intercomAndroidApiKey,
      intercomIosApiKey,
      intercomRegion,
      privacyPolicyUrl,
      termsOfServiceUrl,
    },
  };
};
