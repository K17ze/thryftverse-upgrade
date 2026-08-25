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
