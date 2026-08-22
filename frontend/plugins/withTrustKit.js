/**
 * withTrustKit — Expo config plugin that injects TrustKit SSL pinning
 * configuration into the iOS Info.plist.
 *
 * TrustKit is an open-source iOS framework that implements SSL/TLS
 * public-key pinning on top of the native URLSession delegate system.
 * Unlike Android's network_security_config.xml, iOS does not support
 * SPKI pinning natively via Info.plist — TrustKit bridges that gap.
 *
 * This plugin adds the following Info.plist keys:
 *
 *   TSKSwizzleNetworkDelegates (bool)
 *     When true, TrustKit automatically swizzles the app's URLSession
 *     delegates to intercept SSL handshakes and verify pinned keys.
 *
 *   TSKPinnedDomains (dict)
 *     A dictionary of domains to pin, each containing:
 *       - TSKEnforcePinning (bool)   — block connections on pin mismatch
 *       - TSKIncludeSubdomains (bool) — pin all subdomains
 *       - TSKPublicKeyHashes (array)  — base64 SHA-256 SPKI hashes
 *       - TSKReportUris (array)       — URIs to report pin failures to
 *
 * Prerequisites:
 *   1. Install TrustKit in the iOS project (via Podfile or SPM).
 *      Expo managed workflow: add `trustkit` to the Podfile via a
 *      post-install hook, or use a dev client build that includes it.
 *   2. Set EXPO_PUBLIC_SSL_PINNING_ENABLED=true in the EAS build profile
 *      environment to activate this plugin.
 *
 * SPKI hash generation:
 *   See frontend/scripts/generate-spki-hashes.sh or run:
 *     openssl s_client -connect api.thryftverse.com:443 2>/dev/null \
 *       | openssl x509 -pubkey -noout \
 *       | openssl pkey -pubin -outform der \
 *       | openssl dgst -sha256 -binary \
 *       | openssl enc -base64
 *
 * @param {import('@expo/config-plugins').ConfigPlugin} config
 * @param {Object} [props]
 * @param {boolean} [props.enforcePinning] — whether to enforce pinning (production) or report-only (dev/staging)
 * @returns {import('@expo/config-plugins').ConfigPlugin}
 */
const { withInfoPlist } = require('@expo/config-plugins');

// TODO(release): Replace these placeholder SPKI SHA-256 hashes with the real
// production certificate hashes. Generate with:
//   openssl s_client -connect api.thryftverse.com:443 2>/dev/null \
//     | openssl x509 -pubkey -noout \
//     | openssl pkey -pubin -outform der \
//     | openssl dgst -sha256 -binary \
//     | openssl enc -base64
//
// These MUST match the hashes in
// frontend/android/app/src/main/res/xml/network_security_config.xml
const PINNED_DOMAINS = {
  'api.thryftverse.com': {
    // TODO(release): Replace with the real production SPKI SHA-256 hash.
    TSKPublicKeyHashes: [
      'REPLACE_WITH_API_THRYFTVERSE_COM_SPKI_SHA256',
      'REPLACE_WITH_API_THRYFTVERSE_COM_BACKUP_SPKI_SHA256',
    ],
  },
  'cdn.thryftverse.com': {
    // TODO(release): Replace with the real production SPKI SHA-256 hash.
    TSKPublicKeyHashes: [
      'REPLACE_WITH_CDN_THRYFTVERSE_COM_SPKI_SHA256',
      'REPLACE_WITH_CDN_THRYFTVERSE_COM_BACKUP_SPKI_SHA256',
    ],
  },
};

function withTrustKit(config, props = {}) {
  const enforcePinning = props.enforcePinning !== undefined ? props.enforcePinning : true;

  return withInfoPlist(config, (modConfig) => {
    const infoPlist = modConfig.modResults;

    // TSKSwizzleNetworkDelegates — TrustKit intercepts URLSession SSL
    // handshakes automatically without manual delegate wiring.
    infoPlist.TSKSwizzleNetworkDelegates = true;

    // Build TSKPinnedDomains with per-domain enforcement + subdomain config.
    const pinnedDomains = {};
    for (const [domain, domainConfig] of Object.entries(PINNED_DOMAINS)) {
      pinnedDomains[domain] = {
        TSKEnforcePinning: enforcePinning,
        TSKIncludeSubdomains: true,
        TSKPublicKeyHashes: domainConfig.TSKPublicKeyHashes,
        // TSKReportUris — endpoints where TrustKit reports pin validation
        // failures. Empty for now; configure a reporting endpoint in
        // production to monitor pin failure incidents.
        TSKReportUris: [],
      };
    }

    infoPlist.TSKPinnedDomains = pinnedDomains;

    return modConfig;
  });
}

module.exports = withTrustKit;
