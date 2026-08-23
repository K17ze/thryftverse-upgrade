/**
 * ThryftIntegrity — native module contract for device integrity attestation.
 *
 * This file defines the TypeScript surface for the native integrity module
 * that bridges Apple App Attest (iOS) and Google Play Integrity (Android).
 * The native implementation lives in the local `thryft-native` Expo module
 * (Swift + Kotlin, Expo Modules API).
 *
 * The contract is split into two concerns:
 *
 *  1. **App Attest (iOS)** — `attest` / `generateAssertion` produce a
 *     hardware-backed attestation and per-request assertions that the backend
 *     verifies against the Apple Root CA chain. Used to prove the app binary
 *     is genuine and untampered before issuing sensitive tokens.
 *
 *  2. **Play Integrity (Android)** — `prepareTokenProvider` /
 *     `requestIntegrityToken` produce a Google-signed integrity token that
 *     the backend verifies via the Google Play Integrity API. Used to prove
 *     device integrity (TEE, app authenticity, account licensing).
 *
 * On platforms where the native module is not linked (web, Expo Go without a
 * custom dev client), `getIntegrityModule()` returns an `unsupported` stub so
 * callers can degrade gracefully without try/catching every call.
 */

/** The platform backing the integrity module. */
export type IntegrityPlatform = 'ios' | 'android' | 'unsupported';

/** The current trust state of the device / app attestation. */
export type IntegrityTrustState =
  | 'unchecked'
  | 'attesting'
  | 'trusted'
  | 'unsupported'
  | 'failed';

/** Result of an App Attest attestation call. */
export interface AttestationResult {
  /** Server-assigned key identifier for the registered attestation key. */
  keyId: string;
  /** The opaque attestation object returned by Apple's App Attest. */
  attestation: string;
  /** The challenge that was attested against (echoed for backend verification). */
  challenge: string;
}

/** Result of an App Attest assertion for a single request. */
export interface AssertionResult {
  /** The signed assertion proving possession of the attested key. */
  assertion: string;
  /** The request hash that was asserted (echoed for backend verification). */
  requestHash: string;
}

/** A Play Integrity device verdict (decoded token fields). */
export interface IntegrityVerdict {
  platform: IntegrityPlatform;
  trustState: IntegrityTrustState;
  /** Play Integrity device integrity signals (e.g. `MEETS_DEVICE_INTEGRITY`). */
  deviceIntegrity?: string[];
  /** Whether integrity attestation is supported on this device. */
  isSupported: boolean;
}

/**
 * The native module surface. Every method is async because the underlying
 * platform calls (Keychain, Play Integrity) are asynchronous.
 */
export interface ThryftIntegrityModule {
  /** Whether the platform supports integrity attestation (App Attest / Play Integrity). */
  isSupported(): Promise<boolean>;
  /** App Attest (iOS): generate an attestation key and attest it against `challenge`. */
  attest(challenge: string): Promise<AttestationResult>;
  /** App Attest (iOS): sign a request hash with the attested key. */
  generateAssertion(keyId: string, requestHash: string): Promise<AssertionResult>;
  /** Read the cached trust state. */
  getTrustState(): Promise<IntegrityTrustState>;
  /** Persist the trust state (set by the backend verification flow). */
  setTrustState(state: IntegrityTrustState): Promise<void>;
  /** Play Integrity (Android): warm up the token provider. */
  prepareTokenProvider(): Promise<void>;
  /** Play Integrity (Android): request a signed integrity token for `requestHash`. */
  requestIntegrityToken(requestHash: string): Promise<string>;
  /** Play Integrity (Android): decode the cached token into device integrity signals. */
  getDeviceIntegrityVerdict(): Promise<string[]>;
}
