/**
 * Order authentication presentation — the status→copy mapping for the
 * OrderDetailScreen verification section.
 *
 * Truthfulness contract:
 * - 'request_pending' (durable flag set, pipeline record absent) must render
 *   as "requested", never as an in-flight check.
 * - 'verified' copy only appears for status 'authenticated' with a real
 *   persisted badge — no fabricated claims.
 * - No state promises a review timeline or SLA (the backend exposes none).
 */
import { describe, it, expect } from 'vitest';
import { orderAuthenticationPresentation } from '../components/orders/orderAuthenticationPresentation';
import type { OrderAuthentication } from '../services/commerceApi';

function authWith(status: OrderAuthentication['status'], badge?: NonNullable<OrderAuthentication['request']>['badge']): OrderAuthentication {
  return {
    requested: true,
    status,
    request: status === 'not_requested' || status === 'request_pending'
      ? null
      : {
          id: 'auth_order_o1',
          listingId: 'l1',
          tier: 2,
          status,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
          completedAt: null,
          aiTriage: null,
          expertReview: null,
          labReport: null,
          badge: badge ?? null },
  };
}

describe('orderAuthenticationPresentation', () => {
  it('renders nothing when verification was never requested', () => {
    expect(orderAuthenticationPresentation(null, false)).toBeNull();
    expect(orderAuthenticationPresentation(authWith('not_requested'), false)).toBeNull();
  });

  it('renders the honest "requested" state when the flag is set but the read is unavailable', () => {
    const p = orderAuthenticationPresentation(null, true);
    expect(p?.label).toBe('Verification requested');
    expect(p?.tone).toBe('muted');
    expect(p?.detail).not.toMatch(/in progress/i);
  });

  it('renders request_pending without claiming progress', () => {
    const p = orderAuthenticationPresentation(authWith('request_pending'), true);
    expect(p?.label).toBe('Verification requested');
  });

  it('renders in-flight pipeline states as in progress with no SLA', () => {
    for (const status of [
      'pending_ai_triage',
      'ai_triage_complete',
      'pending_expert_review',
      'expert_review_complete',
      'pending_lab_analysis',
      'lab_analysis_complete',
    ] as const) {
      const p = orderAuthenticationPresentation(authWith(status), true);
      expect(p?.label).toBe('Verification in progress');
      expect(p?.tone).toBe('info');
      // No fabricated timelines — no "within N days/hours" claims.
      expect(p?.detail).not.toMatch(/within|business days|hours/i);
    }
  });

  it('renders authenticated with the persisted badge method and certificate id', () => {
    const p = orderAuthenticationPresentation(
      authWith('authenticated', {
        type: 'EXPERT_VERIFIED',
        certificateId: 'CERT-ABC123DEF456',
        authenticator: 'J. Expert',
        method: 'Expert Physical Inspection',
        confidenceLevel: 0.97,
        issuedAt: '2026-01-02T00:00:00Z',
        expiresAt: null }),
      true
    );
    expect(p?.label).toBe('Verified authentic');
    expect(p?.tone).toBe('success');
    expect(p?.detail).toContain('Expert inspection passed');
    expect(p?.detail).toContain('CERT-ABC123DEF456');
  });

  it('keeps the AI badge labelled as a preliminary check', () => {
    const p = orderAuthenticationPresentation(
      authWith('authenticated', {
        type: 'AI_VERIFIED',
        certificateId: 'CERT-000000000001',
        authenticator: 'AI Photo Triage',
        method: 'AI Photo Triage',
        confidenceLevel: 0.9,
        issuedAt: '2026-01-02T00:00:00Z',
        expiresAt: null }),
      true
    );
    expect(p?.detail).toMatch(/preliminary/i);
  });

  it('renders counterfeit as not confirmed — never as verified', () => {
    const p = orderAuthenticationPresentation(authWith('counterfeit'), true);
    expect(p?.label).toBe('Authenticity not confirmed');
    expect(p?.tone).toBe('danger');
    expect(p?.label).not.toMatch(/verified/i);
  });

  it('renders inconclusive and cancelled without success framing', () => {
    expect(orderAuthenticationPresentation(authWith('inconclusive'), true)?.tone).toBe('muted');
    expect(orderAuthenticationPresentation(authWith('cancelled'), true)?.label).toBe('Verification cancelled');
  });
});
