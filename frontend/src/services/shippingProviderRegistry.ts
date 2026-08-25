/**
 * ShippingProviderRegistry — canonical carrier metadata adapter.
 *
 * Moves carrier-specific URLs and capabilities out of screen code into a
 * single domain adapter. Screens ask the registry for tracking URLs,
 * drop-off finders, and capability flags; they never hardcode carrier
 * URLs or match on carrier name strings.
 *
 * Per HC-P0-01 §9: "move tracking/drop-off URLs into provider registry"
 * Per HC-P0-01 §10: "typed provider error codes"
 * Per 05_SYSTEMIC_VISUAL_CONSTRAINTS: "No provider URLs in route/screens"
 */

// ── Typed provider error codes ────────────────────────────────────────

export type ShippingProviderErrorCode =
  | 'LABEL_GENERATION_UNAVAILABLE'
  | 'LABEL_PROVIDER_UNAVAILABLE'
  | 'INVALID_DESTINATION'
  | 'PARCEL_OUT_OF_BOUNDS'
  | 'SERVICE_NO_LONGER_AVAILABLE'
  | 'LABEL_ALREADY_CREATED'
  | 'CARRIER_AUTH_FAILURE'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

/**
 * Map a backend error response to a typed code.
 * Replaces free-text `message.includes("carrier")` classification.
 */
export function classifyShippingError(error: unknown): ShippingProviderErrorCode {
  const details = (error as { details?: unknown })?.details;
  const codeFromDetails =
    typeof details === 'object' && details !== null
      ? (details as { code?: string })?.code
      : undefined;
  if (typeof codeFromDetails === 'string') {
    const upper = codeFromDetails.toUpperCase();
    if (upper === 'LABEL_GENERATION_UNAVAILABLE') return 'LABEL_GENERATION_UNAVAILABLE';
    if (upper === 'LABEL_PROVIDER_UNAVAILABLE') return 'LABEL_PROVIDER_UNAVAILABLE';
    if (upper === 'CARRIER_AUTH_FAILURE') return 'CARRIER_AUTH_FAILURE';
    if (upper === 'INVALID_DESTINATION') return 'INVALID_DESTINATION';
    if (upper === 'PARCEL_OUT_OF_BOUNDS') return 'PARCEL_OUT_OF_BOUNDS';
    if (upper === 'SERVICE_NO_LONGER_AVAILABLE') return 'SERVICE_NO_LONGER_AVAILABLE';
    if (upper === 'LABEL_ALREADY_CREATED') return 'LABEL_ALREADY_CREATED';
    if (upper === 'RATE_LIMITED') return 'RATE_LIMITED';
  }

  const message = String(
    (error as { message?: string; error?: string })?.message ??
    (error as { error?: string })?.error ??
    error
  ).toLowerCase();

  if (message.includes('label') && message.includes('generation') && message.includes('unavailable')) return 'LABEL_GENERATION_UNAVAILABLE';
  if (message.includes('carrier') && message.includes('unavailable')) return 'LABEL_PROVIDER_UNAVAILABLE';
  if (message.includes('carrier') && message.includes('auth')) return 'CARRIER_AUTH_FAILURE';
  if (message.includes('address') || message.includes('destination')) return 'INVALID_DESTINATION';
  if (message.includes('parcel') || message.includes('weight') || message.includes('size') || message.includes('dimensions')) return 'PARCEL_OUT_OF_BOUNDS';
  if (message.includes('service') && (message.includes('no longer') || message.includes('unavailable'))) return 'SERVICE_NO_LONGER_AVAILABLE';
  if (message.includes('already') && message.includes('label')) return 'LABEL_ALREADY_CREATED';
  if (message.includes('rate') && message.includes('limit')) return 'RATE_LIMITED';
  if (message.includes('network') || message.includes('timeout') || message.includes('connection')) return 'NETWORK_ERROR';
  return 'UNKNOWN';
}

/**
 * Human-readable recovery copy for each typed error code.
 * Screen code uses this instead of inventing error messages.
 */
export const SHIPPING_ERROR_RECOVERY: Record<ShippingProviderErrorCode, string> = {
  LABEL_GENERATION_UNAVAILABLE: "Label generation isn't available for this carrier yet. Use manual shipping with a tracking number instead.",
  LABEL_PROVIDER_UNAVAILABLE: "This carrier's label service is unavailable right now. Try again, or enter tracking manually below.",
  INVALID_DESTINATION: "The buyer's address needs updating before a label can be generated. Message the buyer to resolve.",
  PARCEL_OUT_OF_BOUNDS: 'The parcel details don\'t match the carrier\'s limits. Check the size and weight above.',
  SERVICE_NO_LONGER_AVAILABLE: 'The shipping service the buyer selected is no longer available. Message the buyer to choose an alternative.',
  LABEL_ALREADY_CREATED: 'A label has already been created for this order. Show the existing label or enter tracking manually.',
  CARRIER_AUTH_FAILURE: 'We can\'t connect to the carrier right now. Enter tracking manually to confirm dispatch.',
  RATE_LIMITED: 'Too many label requests. Wait a moment and try again, or enter tracking manually.',
  NETWORK_ERROR: 'Connection issue. Check your internet and try again, or enter tracking manually.',
  UNKNOWN: 'Label generation requires carrier integration. Enter tracking manually below to confirm dispatch.',
};

// ── Provider metadata ─────────────────────────────────────────────────

export interface ShippingProviderMetadata {
  /** Carrier ID as stored in the fulfilment snapshot. */
  carrierId: string;
  /** Display name for the carrier. */
  displayName: string;
  /** URL template for tracking, with {trackingNumber} placeholder. */
  trackingUrlTemplate: string | null;
  /** URL for the carrier's drop-off finder page. */
  dropOffFinderUrl: string | null;
  /** Whether this carrier supports QR codes at drop-off. */
  supportsQr: boolean;
  /** Whether this carrier supports printable labels. */
  supportsPrint: boolean;
  /** Label format (pdf/png/zpl). */
  labelFormat: 'pdf' | 'png' | 'zpl' | null;
}

// ── Registry ──────────────────────────────────────────────────────────

const PROVIDER_REGISTRY: Record<string, ShippingProviderMetadata> = {
  'royal mail': {
    carrierId: 'royal mail',
    displayName: 'Royal Mail',
    trackingUrlTemplate: 'https://www.royalmail.com/track-your-item?trackNumber={trackingNumber}',
    dropOffFinderUrl: 'https://www.royalmail.com/find-a-post-office',
    supportsQr: false,
    supportsPrint: true,
    labelFormat: 'pdf',
  },
  'dpd': {
    carrierId: 'dpd',
    displayName: 'DPD',
    trackingUrlTemplate: 'https://www.dpd.co.uk/tracking?trackingRef={trackingNumber}',
    dropOffFinderUrl: 'https://www.dpd.co.uk/pickup/',
    supportsQr: true,
    supportsPrint: true,
    labelFormat: 'pdf',
  },
  'evri': {
    carrierId: 'evri',
    displayName: 'Evri',
    trackingUrlTemplate: 'https://www.evri.com/track-a-parcel?trackingRef={trackingNumber}',
    dropOffFinderUrl: 'https://www.evri.com/find-a-parcelshop/',
    supportsQr: true,
    supportsPrint: true,
    labelFormat: 'pdf',
  },
  'hermes': {
    carrierId: 'hermes',
    displayName: 'Evri',
    trackingUrlTemplate: 'https://www.evri.com/track-a-parcel?trackingRef={trackingNumber}',
    dropOffFinderUrl: 'https://www.evri.com/find-a-parcelshop/',
    supportsQr: true,
    supportsPrint: true,
    labelFormat: 'pdf',
  },
  'yodel': {
    carrierId: 'yodel',
    displayName: 'Yodel',
    trackingUrlTemplate: 'https://www.yodel.co.uk/track?trackingReference={trackingNumber}',
    dropOffFinderUrl: 'https://www.yodel.co.uk/parcel-shops',
    supportsQr: false,
    supportsPrint: true,
    labelFormat: 'pdf',
  },
  'ups': {
    carrierId: 'ups',
    displayName: 'UPS',
    trackingUrlTemplate: 'https://www.ups.com/track?tracknum={trackingNumber}',
    dropOffFinderUrl: 'https://www.ups.com/dropoff/',
    supportsQr: false,
    supportsPrint: true,
    labelFormat: 'pdf',
  },
  'dhl': {
    carrierId: 'dhl',
    displayName: 'DHL',
    trackingUrlTemplate: 'https://www.dhl.com/en/express/tracking.html?AWB={trackingNumber}',
    dropOffFinderUrl: 'https://www.dhl.com/en/express/locations.html',
    supportsQr: false,
    supportsPrint: true,
    labelFormat: 'pdf',
  },
  'fedex': {
    carrierId: 'fedex',
    displayName: 'FedEx',
    trackingUrlTemplate: 'https://www.fedex.com/fedextrack/?trknbr={trackingNumber}',
    dropOffFinderUrl: 'https://www.fedex.com/locate/',
    supportsQr: false,
    supportsPrint: true,
    labelFormat: 'pdf',
  },
};

/**
 * Look up provider metadata by carrier ID or name.
 * Returns null if the carrier is not in the registry (manual/unknown).
 */
export function getProviderMetadata(carrierId: string | null | undefined): ShippingProviderMetadata | null {
  if (!carrierId) return null;
  const key = carrierId.toLowerCase().trim();
  return PROVIDER_REGISTRY[key] ?? null;
}

/**
 * Build a tracking URL for a specific carrier and tracking number.
 * Returns null if the carrier is unknown or doesn't support online tracking.
 */
export function buildTrackingUrl(carrierId: string | null | undefined, trackingNumber: string | null | undefined): string | null {
  if (!trackingNumber) return null;
  const meta = getProviderMetadata(carrierId);
  if (!meta?.trackingUrlTemplate) return null;
  return meta.trackingUrlTemplate.replace('{trackingNumber}', encodeURIComponent(trackingNumber));
}

/**
 * Get the drop-off finder URL for a carrier.
 * Returns null if the carrier is unknown or doesn't have a finder.
 */
export function getDropOffUrl(carrierId: string | null | undefined): string | null {
  const meta = getProviderMetadata(carrierId);
  return meta?.dropOffFinderUrl ?? null;
}
