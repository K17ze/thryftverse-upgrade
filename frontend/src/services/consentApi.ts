import { fetchJson } from '../lib/apiClient';

export interface PrivacyConsent {
  personalisedAds: boolean;
  recommendationPersonalisation: boolean;
  partnerSharing: boolean;
  analyticsOptOut: boolean;
  updatedAt: string | null;
}

interface GetConsentResponse {
  ok: true;
  consent: PrivacyConsent;
}

interface PatchConsentResponse {
  ok: true;
  consent: PrivacyConsent;
}

export async function fetchPrivacyConsent(): Promise<PrivacyConsent> {
  const response = await fetchJson<GetConsentResponse>('/users/me/consent');
  return response.consent;
}

export async function patchPrivacyConsent(
  patch: Partial<Omit<PrivacyConsent, 'updatedAt'>>
): Promise<PrivacyConsent> {
  const response = await fetchJson<PatchConsentResponse>('/users/me/consent', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return response.consent;
}
