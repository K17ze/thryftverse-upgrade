/**
 * Catalogue Source Connector Contract
 *
 * Source-specific behaviour lives behind a typed adapter. The core domain
 * service never branches on `if (source === 'ebay')`. Each connector
 * implements this interface and is registered in the connector registry.
 *
 * Rules (per blueprint §8):
 * - Adapters return source facts, not ThryftVerse listing rows.
 * - Adapters never write listings.
 * - Raw provider errors are mapped to stable domain errors but retained
 *   in restricted diagnostics.
 * - Connector rate limits and retry hints control job scheduling.
 * - Every page/report has a persisted checkpoint.
 * - A connector can be disabled through configuration without a mobile
 *   release.
 * - Partnership-gated adapters are not registered merely because a file
 *   exists.
 */

import type {
  CatalogSource,
  SourceAuthorization,
} from '../../domain/catalogImports/catalogImportTypes.js';

// ---------------------------------------------------------------------------
// Capability
// ---------------------------------------------------------------------------

export interface SourceCapability {
  readonly source: CatalogSource;
  readonly authorization: SourceAuthorization;
  readonly canReadInventory: boolean;
  readonly canReadMedia: boolean;
  readonly canReadVariations: boolean;
  readonly supportsIncrementalCursor: boolean;
  readonly supportsRevocation: boolean;
  /** Version of the legal/contractual approval that gates this connector. */
  readonly legalApprovalVersion: string;
  /** Whether the connector is enabled at runtime (feature gate / config). */
  readonly enabled: boolean;
  /** Human-readable reason when not enabled. */
  readonly unavailableReason: string | null;
}

// ---------------------------------------------------------------------------
// Authorisation
// ---------------------------------------------------------------------------

export interface BeginAuthorizationInput {
  userId: string;
  /** ThryftVerse-generated opaque state token for CSRF/replay defence. */
  state: string;
  /** PKCE code challenge (S256) when the provider supports it. */
  codeChallenge?: string;
  /** Requested scopes (least privilege). */
  scopes: string[];
  /** The redirect URI the provider should return to. */
  redirectUri: string;
}

export interface AuthorizationRedirect {
  /** The HTTPS URL the mobile app should open in the system browser. */
  redirectUrl: string;
  /** The state token to validate on callback. */
  state: string;
}

export interface AuthorizationCallbackInput {
  userId: string;
  state: string;
  code: string;
  /** The redirect URI originally used, for providers that require it. */
  redirectUri: string;
}

export interface ConnectionGrant {
  externalAccountId: string;
  externalDisplayName: string | null;
  /** Envelope-encrypted access token (never plaintext in memory beyond the
   *  provider request; never returned to the mobile app). */
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  tokenExpiresAt: Date | null;
  scopes: string[];
}

export interface RefreshConnectionInput {
  encryptedRefreshToken: string;
  scopes: string[];
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

export interface DiscoverInput {
  encryptedAccessToken: string;
  externalAccountId: string;
  /** Resumed checkpoint from a previous page, or undefined for the start. */
  checkpoint?: DiscoveryCheckpoint;
}

export interface DiscoveryCheckpoint {
  cursor?: string;
  reportTaskId?: string;
  page?: number;
  sourceSnapshotAt: string;
}

export interface DiscoveredSourceItem {
  externalItemId: string;
  sourceUrl?: string;
  sourceUpdatedAt?: string;
  sourceState: string;
  sourceChecksum: string;
  minimal: Record<string, unknown>;
}

export interface DiscoveryPage {
  items: DiscoveredSourceItem[];
  nextCheckpoint?: DiscoveryCheckpoint;
  /** True when the source has no more pages. */
  done: boolean;
}

// ---------------------------------------------------------------------------
// Hydration
// ---------------------------------------------------------------------------

export interface HydrateInput {
  encryptedAccessToken: string;
  externalAccountId: string;
  externalItemId: string;
  minimal: Record<string, unknown>;
}

export interface HydratedSourceMedia {
  externalMediaId?: string;
  url: string;
  position: number;
  declaredMimeType?: string;
}

export interface HydratedSourceItem {
  externalItemId: string;
  sourceUpdatedAt?: string;
  raw: Record<string, unknown>;
  media: HydratedSourceMedia[];
}

// ---------------------------------------------------------------------------
// Seller package connector (upload-based, no OAuth)
// ---------------------------------------------------------------------------

export interface SellerPackageManifest {
  packageId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  /** The S3 object key the package was uploaded to. */
  objectKey: string;
}

export interface SellerPackageExtractionResult {
  items: DiscoveredSourceItem[];
  /** Media files keyed by a reference in the manifest (e.g. SKU or row ID). */
  mediaByItemRef: Map<string, HydratedSourceMedia[]>;
  /** Rejection reasons for files that failed security inspection. */
  rejectedFiles: Array<{ fileName: string; reason: string }>;
}

// ---------------------------------------------------------------------------
// Rate-limit / retry hints
// ---------------------------------------------------------------------------

export interface ConnectorRetryHint {
  /** Seconds to wait before the next call, from provider Retry-After. */
  retryAfterSeconds?: number;
  /** Whether the error is a hard permission/legal failure (no retry). */
  noRetry: boolean;
  /** Stable error code for diagnostics. */
  errorCode: string;
}

// ---------------------------------------------------------------------------
// Connector interface
// ---------------------------------------------------------------------------

export interface CatalogSourceConnector {
  readonly source: CatalogSource;
  readonly capability: SourceCapability;

  beginAuthorization?(input: BeginAuthorizationInput): Promise<AuthorizationRedirect>;
  completeAuthorization?(input: AuthorizationCallbackInput): Promise<ConnectionGrant>;
  revoke?(input: { encryptedAccessToken: string }): Promise<void>;
  refreshConnection?(input: RefreshConnectionInput): Promise<ConnectionGrant>;

  discover(input: DiscoverInput): AsyncIterable<DiscoveryPage>;
  hydrate(input: HydrateInput): Promise<HydratedSourceItem>;
}

/**
 * Seller-package connectors have a different acquisition shape (no OAuth,
 * no remote discovery). They implement this narrower interface instead.
 */
export interface SellerPackageConnector {
  readonly source: CatalogSource;
  readonly capability: SourceCapability;

  extractPackage(
    manifest: SellerPackageManifest,
    objectKey: string,
  ): Promise<SellerPackageExtractionResult>;
}

// ---------------------------------------------------------------------------
// Connector registry
// ---------------------------------------------------------------------------

export interface ConnectorRegistry {
  /** List all registered source capabilities (for the /sources endpoint). */
  listCapabilities(): SourceCapability[];
  /** Get capability for a source, or undefined if not registered. */
  getCapability(source: CatalogSource): SourceCapability | undefined;
  /** Get an OAuth/API connector, or undefined if not registered/enabled. */
  getConnector(source: CatalogSource): CatalogSourceConnector | undefined;
  /** Get a seller-package connector, or undefined. */
  getSellerPackageConnector(source: CatalogSource): SellerPackageConnector | undefined;
  /** Whether a source is available (registered AND enabled AND legal gate passed). */
  isAvailable(source: CatalogSource): boolean;
}
