/**
 * SSL Public-Key Pinning configuration for ThryftVerse.
 *
 * OWASP Mobile Top 10 (2024) — M4: Insecure Communication.
 *
 * Per OWASP guidance: pin the PUBLIC KEY (SPKI hash), not the certificate.
 * Certificates rotate; public keys are stable across renewals. Always keep a
 * backup pin so a key rotation does not brick the app.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * INSTALLATION (not yet installed — requires a development build, NOT Expo Go)
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   npm install react-native-ssl-public-key-pinning
 *
 * Then create a development build (the native module cannot run in Expo Go):
 *
 *   eas build --profile development --platform ios
 *   eas build --profile development --platform android
 *
 * Initialise pinning as early as possible — before the first network request.
 * A good place is the app entry point (`index.ts` / `App.tsx` top-level effect):
 *
 *   import { initializeSslPinning } from '../utils/sslPinning';
 *   await initializeSslPinning();
 *
 * The `react-native-ssl-public-key-pinning` library patches the native
 * networking stack (OkHttp on Android, NSURLSession on iOS) so that *every*
 * HTTPS connection is validated against the pins — including fetch, Axios,
 * and image loaders.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * HOW TO COMPUTE A PIN
 * ────────────────────────────────────────────────────────────────────────────
 *
 * A pin is the base64-encoded SHA-256 hash of the DER-encoded SubjectPublicKeyInfo
 * (SPKI) of the leaf or intermediate certificate. Compute with OpenSSL:
 *
 *   openssl s_client -connect api.thryftverse.com:443 -showcerts 2>/dev/null \
 *     | openssl x509 -pubkey -noout \
 *     | openssl pkey -pubin -outform der \
 *     | openssl dgst -sha256 -binary \
 *     | openssl base64
 *
 * Repeat for the backup key (a different key pair held in reserve for rotation).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * PRODUCTION ROLLOUT SAFETY
 * ────────────────────────────────────────────────────────────────────────────
 *
 * 1. Ship with pinning in ENFORCE mode only after a staged rollout confirms
 *    no false positives (e.g. corporate proxies, CDN edge changes).
 * 2. Keep at least one backup pin live at all times.
 * 3. Subscribe to certificate transparency / rotation alerts for the pinned
 *    domains so a key rotation is coordinated with an app update BEFORE the
 *    old pin expires.
 * 4. Expose a kill-switch via remote config (expo-updates runtime version) so
 *    a broken pin can be relaxed without a full store review cycle.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * PRODUCTION READINESS CHECKLIST (complete BEFORE flipping `enforce: true`)
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   [ ] 1. Install the native module:
 *           npm install react-native-ssl-public-key-pinning
 *         Then create a development build (NOT Expo Go):
 *           eas build --profile development --platform ios
 *           eas build --profile development --platform android
 *
 *   [ ] 2. Compute REAL SPKI hashes for every pinned domain (see "HOW TO
 *         COMPUTE A PIN" above). Replace every PLACEHOLDER_* value in
 *         SSL_PINNING_CONFIG.domains with a real base64 SHA-256 SPKI hash.
 *
 *   [ ] 3. Verify at least one BACKUP pin per domain is live and corresponds
 *         to a DIFFERENT key pair held in reserve (rotation safety).
 *
 *   [ ] 4. Run a staged rollout with `enforce: false` first and inspect logs
 *         for pin-validation failures (corporate proxies, CDN edge changes,
 *         user-installed CAs). No false positives before proceeding.
 *
 *   [ ] 5. Flip `enforce: true` ONLY after the staged rollout is clean.
 *
 *   [ ] 6. Subscribe to certificate-transparency / key-rotation alerts so an
 *         upcoming rotation triggers an app update BEFORE the old pin expires.
 *
 *   [ ] 7. Confirm a remote kill-switch (expo-updates runtime version) is in
 *         place so a broken pin can be relaxed without a full store review.
 *
 * Until every box above is checked, `getSslPinningStatus()` will report a
 * non-`active` status and `isSslPinningEnabled()` returns `false`. Per
 * AGENTS.md §11 (Truthful UI) we never claim pinning is active when it is not.
 */

/**
 * Domains and their pinned public-key hashes (base64 SHA-256 of SPKI).
 *
 * PLACEHOLDER HASHES BELOW — these are NOT real ThryftVerse keys. They must be
 * replaced with hashes computed from the actual production certificates before
 * enabling enforcement. Using placeholder hashes in enforce mode would block
 * every legitimate request (AGENTS.md §11 — do not fabricate security).
 *
 * BUILD-TIME VALIDATION: when `enforce` is flipped to `true`, the build MUST
 * fail if any hash still contains the PLACEHOLDER marker. A guard is provided
 * via `hasPlaceholderHashes()`; wire it into a pre-build script
 * (e.g. `scripts/validate-ssl-pins.ts` invoked from package.json `prebuild`)
 * so a production build can never ship with placeholder pins in enforce mode.
 */
export interface SslPin {
  /** Primary public-key hash (base64 SHA-256 of SPKI). */
  primary: string;
  /** Backup public-key hash — used during key rotation so the app is not bricked. */
  backup: string;
}

export const SSL_PINNING_CONFIG = {
  // When `false`, pin validation failures are logged but not blocked.
  // Set to `true` ONLY after the production readiness checklist above is
  // complete and a staged rollout confirms no false positives.
  enforce: false,
  domains: {
    'api.thryftverse.com': {
      // PLACEHOLDER — replace with real SPKI hash before enabling enforcement.
      primary: 'PLACEHOLDER_REPLACE_WITH_REAL_PRIMARY_SPKI_SHA256_BASE64',
      // PLACEHOLDER — a DIFFERENT key pair held in reserve for rotation.
      backup: 'PLACEHOLDER_REPLACE_WITH_REAL_BACKUP_SPKI_SHA256_BASE64',
    } satisfies SslPin,
    'api-staging.thryftverse.com': {
      primary: 'PLACEHOLDER_REPLACE_WITH_STAGING_PRIMARY_SPKI_SHA256_BASE64',
      backup: 'PLACEHOLDER_REPLACE_WITH_STAGING_BACKUP_SPKI_SHA256_BASE64',
    } satisfies SslPin,
  } as Record<string, SslPin>,
} as const;

/** Marker prefix used to detect un-replaced placeholder hashes. */
const PLACEHOLDER_MARKER = 'PLACEHOLDER_';

/**
 * Returns `true` when any configured pin still contains a placeholder hash.
 * Used by `getSslPinningStatus()` and by build-time validation scripts.
 */
export function hasPlaceholderHashes(): boolean {
  return Object.values(SSL_PINNING_CONFIG.domains).some(
    (pin) =>
      pin.primary.includes(PLACEHOLDER_MARKER) ||
      pin.backup.includes(PLACEHOLDER_MARKER),
  );
}

/**
 * Truthful report of whether SSL pinning is actually enforced right now.
 *
 * Pinning is only considered enabled when ALL of the following are true:
 *   1. The native module `react-native-ssl-public-key-pinning` is installed.
 *   2. The config contains non-placeholder hashes.
 *   3. `SSL_PINNING_CONFIG.enforce` is `true`.
 *
 * Per AGENTS.md §11: this MUST return `false` unless pinning is genuinely
 * active. Never report a partial / configured-but-disabled state as enabled.
 */
export function isSslPinningEnabled(): boolean {
  return getSslPinningStatus() === 'active';
}

/**
 * Truthful, granular status of the SSL pinning configuration.
 *
 *   'active'                       — native module installed, real hashes, enforce=true.
 *   'configured-but-not-enforced'  — module installed + real hashes, but enforce=false.
 *   'placeholder-hashes'           — module installed, but hashes are still placeholders.
 *   'not-installed'                — native module is absent (pinning cannot run).
 *
 * Per AGENTS.md §11: every value reflects the real state. No value implies
 * protection that is not actually in place.
 */
export type SslPinningStatus =
  | 'active'
  | 'configured-but-not-enforced'
  | 'not-installed'
  | 'placeholder-hashes';

export function getSslPinningStatus(): SslPinningStatus {
  // The native module is intentionally optional. We detect it via a dynamic
  // import at init time, but for a synchronous status check we rely on a
  // module-level flag set by `initializeSslPinning()`. Before init runs we
  // conservatively report 'not-installed' (we cannot prove it is installed).
  if (!nativeModuleInstalled) {
    return 'not-installed';
  }
  if (hasPlaceholderHashes()) {
    return 'placeholder-hashes';
  }
  return SSL_PINNING_CONFIG.enforce ? 'active' : 'configured-but-not-enforced';
}

/**
 * Module-level flag flipped by `initializeSslPinning()` once the native module
 * is confirmed present. Defaults to `false` (unknown / not yet detected) so
 * `getSslPinningStatus()` is truthful before init has run.
 */
let nativeModuleInstalled = false;

/**
 * Initialise SSL public-key pinning.
 *
 * This is a NO-OP until `react-native-ssl-public-key-pinning` is installed and
 * a development build is created. The function is safe to call today — it
 * detects the missing native module and logs a warning instead of throwing.
 *
 * Per AGENTS.md §11: we do not claim pinning is active when it is not.
 */
export async function initializeSslPinning(): Promise<void> {
  try {
    // Dynamic import so the file compiles even when the package is absent.
    // @ts-expect-error — the package is intentionally optional; the .catch()
    // handles the runtime absence when the module is not installed.
    const mod = await import('react-native-ssl-public-key-pinning').catch(() => null);
    if (!mod) {
      nativeModuleInstalled = false;
      if (__DEV__) {
        console.warn(
          `[sslPinning] status: ${getSslPinningStatus()}. ` +
            'react-native-ssl-public-key-pinning is not installed — SSL pinning is NOT active. ' +
            'See frontend/src/utils/sslPinning.ts for setup.'
        );
      }
      return;
    }

    const init = (mod as { initialize?: (config: unknown) => Promise<void> }).initialize;
    if (typeof init !== 'function') {
      nativeModuleInstalled = false;
      if (__DEV__) {
        console.warn(
          `[sslPinning] status: ${getSslPinningStatus()}. ` +
            'Native module present but initialize() unavailable — pinning NOT active.'
        );
      }
      return;
    }

    nativeModuleInstalled = true;
    await init(SSL_PINNING_CONFIG);

    if (__DEV__) {
      // Log the truthful status after init so the console reflects exactly
      // what protection (if any) is in place. Per AGENTS.md §11 we never
      // claim pinning is active when it is not.
      console.info(`[sslPinning] status: ${getSslPinningStatus()}.`);
    }
  } catch (error) {
    nativeModuleInstalled = false;
    if (__DEV__) {
      console.warn(
        `[sslPinning] status: ${getSslPinningStatus()}. ` +
          'Initialisation failed — pinning NOT active.',
        error
      );
    }
  }
}
