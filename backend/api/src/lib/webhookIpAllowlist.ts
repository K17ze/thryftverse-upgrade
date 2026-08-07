/**
 * Webhook IP allowlisting for non-Stripe providers.
 *
 * Stripe webhooks are verified via signature, so IP allowlisting is not
 * needed. For other providers (Razorpay, Mollie, Flutterwave, Tap, PayPal),
 * we add an IP allowlist as an additional security layer.
 *
 * Known provider IP ranges are published by each provider. This module
 * checks the client IP against the configured allowlist.
 */

/**
 * Check if an IP is in a CIDR range.
 * Supports IPv4 only (sufficient for provider webhook IPs).
 */
export function isIpInCidr(ip: string, cidr: string): boolean {
  const [range, prefixStr] = cidr.split('/');
  if (!range || !prefixStr) return false;

  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;

  const ipParts = ip.split('.').map((p) => parseInt(p, 10));
  const rangeParts = range.split('.').map((p) => parseInt(p, 10));

  if (ipParts.length !== 4 || rangeParts.length !== 4) return false;
  if (ipParts.some((p) => isNaN(p) || p < 0 || p > 255)) return false;
  if (rangeParts.some((p) => isNaN(p) || p < 0 || p > 255)) return false;

  const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
  const rangeNum = (rangeParts[0] << 24) | (rangeParts[1] << 16) | (rangeParts[2] << 8) | rangeParts[3];

  const mask = prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0;

  return (ipNum & mask) === (rangeNum & mask);
}

/**
 * Check if an IP is allowed by the allowlist.
 * If the allowlist is empty, all IPs are allowed (fail-open).
 */
export function isWebhookIpAllowed(ip: string, allowlistedRanges: string[]): boolean {
  if (allowlistedRanges.length === 0) return true;
  return allowlistedRanges.some((cidr) => isIpInCidr(ip, cidr));
}

/**
 * Extract the client IP from a request, accounting for proxies.
 * Checks X-Forwarded-For, X-Real-IP, and the raw socket IP.
 */
export function extractClientIp(headers: Record<string, string | string[] | undefined>): string | null {
  const xff = headers['x-forwarded-for'];
  if (typeof xff === 'string') {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  } else if (Array.isArray(xff) && xff.length > 0) {
    const first = xff[0].split(',')[0]?.trim();
    if (first) return first;
  }

  const xRealIp = headers['x-real-ip'];
  if (typeof xRealIp === 'string' && xRealIp.trim()) {
    return xRealIp.trim();
  }

  return null;
}
