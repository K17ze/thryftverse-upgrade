import { fetchJson } from '../lib/apiClient';

/* ─── DAC7 Tax Information ─── */

export interface Dac7TaxInfo {
  tin: string;
  taxResidenceCountry: string;
  isEuResident: boolean;
  selfDeclared: boolean;
  selfDeclaredAt: string | null;
  status: 'declared' | 'verified' | 'rejected' | 'expired';
  verifiedAt: string | null;
  rejectedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function fetchDac7TaxInfo(
  userId: string
): Promise<{ ok: true; taxInfo: Dac7TaxInfo | null }> {
  return fetchJson<{ ok: true; taxInfo: Dac7TaxInfo | null }>(
    `/compliance/dac7/${encodeURIComponent(userId)}`
  );
}

export async function saveDac7TaxInfo(
  userId: string,
  data: {
    tin: string;
    taxResidenceCountry: string;
    isEuResident: boolean;
    selfDeclared: boolean;
  }
): Promise<{ ok: true; taxInfo: Dac7TaxInfo }> {
  return fetchJson<{ ok: true; taxInfo: Dac7TaxInfo }>(
    `/compliance/dac7/${encodeURIComponent(userId)}`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );
}

/* ─── KYC Verification ─── */

export interface KycSession {
  id: string;
  verificationUrl: string | null;
  vendor: string;
  status: 'pending' | 'in_review' | 'approved' | 'declined' | 'expired';
  providerNotConfigured?: boolean;
}

/**
 * Create a provider-hosted KYC verification session.
 *
 * The backend forwards these details to the identity provider (Stripe) which
 * runs its own hosted document + selfie capture flow. ThryftVerse does NOT
 * collect or upload document/selfie media itself.
 *
 * @param data.legalName    - User's legal full name.
 * @param data.dateOfBirth  - ISO 8601 calendar date in `YYYY-MM-DD` format
 *                            (the backend schema rejects `DD/MM/YYYY`). The
 *                            caller is responsible for converting the
 *                            user-facing DD/MM/YYYY mask to ISO before sending.
 * @param data.countryCode  - ISO 3166-1 alpha-2 country code (e.g. 'GB').
 */
export async function createKycSession(data: {
  legalName?: string;
  dateOfBirth?: string;
  countryCode?: string;
}): Promise<{ ok: true; session: KycSession }> {
  return fetchJson<{ ok: true; session: KycSession }>(
    '/compliance/kyc-session',
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );
}

export interface KycStatus {
  status: 'not_started' | 'pending' | 'verified' | 'rejected' | 'expired';
  level: 'none' | 'basic' | 'enhanced';
  vendor: string | null;
  documentStatus: 'unsubmitted' | 'submitted' | 'approved' | 'rejected';
  livenessStatus: 'unsubmitted' | 'pending' | 'passed' | 'failed';
  tradingEnabled: boolean;
}

export async function fetchKycStatus(
  userId: string
): Promise<{ ok: true; kycStatus: KycStatus }> {
  return fetchJson<{ ok: true; kycStatus: KycStatus }>(
    `/compliance/kyc-status/${encodeURIComponent(userId)}`
  );
}

/* ─── Age Assurance (ICO/Ofcom waterfall) ─── */

export interface AgeAssurance {
  level: 'self_declared' | 'pending' | 'kyc_verified';
  kycStatus: 'not_started' | 'pending' | 'verified' | 'rejected' | 'expired';
  dateOfBirthVerified: boolean;
  requiresKycForTrading: boolean;
}

export async function fetchAgeAssurance(
  userId: string
): Promise<{ ok: true; ageAssurance: AgeAssurance }> {
  return fetchJson<{ ok: true; ageAssurance: AgeAssurance }>(
    `/compliance/age-assurance/${encodeURIComponent(userId)}`
  );
}

/* ─── Legal documents & consents ─── */

export type LegalDocumentType =
  | 'terms_of_service'
  | 'privacy_policy'
  | 'risk_disclosure'
  | 'kyc_terms'
  | 'consent_notice';

export interface LegalDocument {
  id: string;
  docType: LegalDocumentType;
  version: string;
  locale: string;
  title: string;
  contentUrl: string | null;
  contentHash: string | null;
  isActive: boolean;
  effectiveAt: string;
  retiredAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/**
 * List active legal documents of a given type, newest effective first
 * (mirrors the backend ORDER BY effective_at DESC).
 * GET /compliance/consents/documents — authenticated.
 */
export async function fetchActiveLegalDocuments(
  docType: LegalDocumentType,
  limit = 20
): Promise<LegalDocument[]> {
  const response = await fetchJson<{ ok: true; items: LegalDocument[] }>(
    `/compliance/consents/documents?docType=${encodeURIComponent(docType)}&activeOnly=true&limit=${limit}`
  );
  return response.items;
}

export interface AcceptedConsent {
  userId: string;
  documentId: string;
  accepted: boolean;
  acceptedAt: string;
  ipAddress: string | null;
}

/**
 * Record the user's acceptance of a legal document.
 * POST /compliance/consents/accept — authenticated; `userId` must match the
 * bearer-token user (the backend's actor-context check rejects mismatches).
 * The server 404s unless the document is active AND verified (public
 * content URL + full SHA-256 content hash).
 */
export async function acceptLegalDocument(
  userId: string,
  documentId: string,
  evidence?: Record<string, unknown>
): Promise<AcceptedConsent> {
  const response = await fetchJson<{ ok: true; consent: AcceptedConsent }>(
    '/compliance/consents/accept',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        documentId,
        accepted: true,
        ...(evidence ? { evidence } : {}),
      }),
    }
  );
  return response.consent;
}

/** Thrown when no verified, currently-effective risk disclosure document
 *  exists server-side — the consent endpoint would 404, so we fail before
 *  posting and let the UI say the disclosure isn't published yet. */
export class RiskDisclosureUnavailableError extends Error {
  constructor() {
    super('The risk disclosure document is not available yet. Try again shortly.');
    this.name = 'RiskDisclosureUnavailableError';
  }
}

/**
 * Mirrors the server-side accept gate in POST /compliance/consents/accept:
 * the document must be active, in effect, carry a public content URL and a
 * full SHA-256 content hash (not a placeholder).
 */
function isConsentableDocument(doc: LegalDocument, nowMs: number): boolean {
  if (!doc.isActive) return false;
  if (!doc.contentUrl) return false;
  if (!doc.contentHash || !/^sha256:[a-f0-9]{64}$/i.test(doc.contentHash)) return false;
  if (/placeholder/i.test(doc.contentHash)) return false;
  const effectiveMs = Date.parse(doc.effectiveAt);
  if (Number.isFinite(effectiveMs) && effectiveMs > nowMs) return false;
  if (doc.retiredAt) {
    const retiredMs = Date.parse(doc.retiredAt);
    if (Number.isFinite(retiredMs) && retiredMs <= nowMs) return false;
  }
  return true;
}

/**
 * Resolve the currently-effective verified `risk_disclosure` legal document
 * and record the user's consent against it. This is the server-side source
 * of truth behind `evaluateMarketEligibility('co-own')` — the local
 * `riskDisclosureAccepted` flag is only a UX cache.
 */
export async function acceptActiveRiskDisclosure(
  userId: string,
  evidence?: Record<string, unknown>
): Promise<{ consent: AcceptedConsent; document: LegalDocument }> {
  const documents = await fetchActiveLegalDocuments('risk_disclosure');
  const document = documents.find((doc) => isConsentableDocument(doc, Date.now()));
  if (!document) {
    throw new RiskDisclosureUnavailableError();
  }
  const consent = await acceptLegalDocument(userId, document.id, evidence);
  return { consent, document };
}
