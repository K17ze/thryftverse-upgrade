/**
 * Vendor delivery client resolution (F16).
 *
 * A vendor is only "deliverable" when it is actually configured — a
 * `SUPPORT_VENDOR_<NAME>_API_URL` endpoint plus a
 * `SUPPORT_VENDOR_<NAME>_TOKEN` bearer credential. When those are absent the
 * resolver returns null and the outbox handler leaves entries `pending`
 * rather than fabricating a delivery.
 *
 * Failure semantics:
 *   - network error / 5xx / 429  → retryable   → outbox 'failed' (re-queued)
 *   - other 4xx                  → permanent   → outbox 'skipped' (dead-letter)
 */
import type { VendorOutboxEntry } from './vendorAdapter.js';

export interface VendorDeliveryResult {
  vendorId: string;
  vendorUrl?: string;
}

export interface VendorClient {
  vendorName: string;
  deliver(entry: VendorOutboxEntry): Promise<VendorDeliveryResult>;
}

/** Thrown for non-retryable vendor failures — auth, validation, not-found. */
export class VendorPermanentError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'VendorPermanentError';
  }
}

const REQUEST_TIMEOUT_MS = 10_000;

function envKey(vendorName: string, suffix: string): string {
  return `SUPPORT_VENDOR_${vendorName.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}_${suffix}`;
}

class HttpVendorClient implements VendorClient {
  constructor(
    public readonly vendorName: string,
    private readonly apiUrl: string,
    private readonly token: string,
  ) {}

  async deliver(entry: VendorOutboxEntry): Promise<VendorDeliveryResult> {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': entry.idempotencyKey,
      },
      body: JSON.stringify({
        eventType: entry.eventType,
        canonicalType: entry.canonicalType,
        canonicalId: entry.canonicalId,
        payload: entry.payload,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const detail = body.slice(0, 200);
      if (response.status === 429 || response.status >= 500) {
        // Retryable — the entry goes back to 'failed' and is re-queued.
        throw new Error(`vendor ${this.vendorName} transient ${response.status}: ${detail}`);
      }
      throw new VendorPermanentError(
        `vendor ${this.vendorName} rejected delivery ${response.status}: ${detail}`,
        response.status,
      );
    }

    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const vendorId =
      (typeof json.id === 'string' && json.id) ||
      (typeof json.vendorId === 'string' && json.vendorId) ||
      `delivery-${entry.id}`;
    const vendorUrl = typeof json.url === 'string' ? json.url : undefined;
    return { vendorId, vendorUrl };
  }
}

/**
 * Resolves the delivery client for a vendor, or null when the vendor is not
 * configured. A null result means outbox entries must stay `pending` — the
 * caller must not mark them delivered or failed.
 */
export function resolveVendorClient(vendorName: string): VendorClient | null {
  const apiUrl = process.env[envKey(vendorName, 'API_URL')];
  const token = process.env[envKey(vendorName, 'TOKEN')];
  if (!apiUrl || !token) {
    return null;
  }
  try {
    const parsed = new URL(apiUrl);
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
      return null;
    }
  } catch {
    return null;
  }
  return new HttpVendorClient(vendorName, apiUrl, token);
}
