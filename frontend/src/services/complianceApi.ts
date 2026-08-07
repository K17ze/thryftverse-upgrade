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
