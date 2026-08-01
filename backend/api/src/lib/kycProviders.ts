/**
 * Multi-vendor KYC fallback — Persona and Onfido.
 *
 * When Stripe Identity is unavailable or fails, the system can fall back
 * to Persona or Onfido for identity verification. This module provides
 * inquiry/session creation and webhook verification for both providers.
 *
 * Provider priority:
 * 1. Stripe Identity (default, already integrated)
 * 2. Persona (fallback for US/CA)
 * 3. Onfido (fallback for EU/UK)
 */

export type KycProvider = 'stripe_identity' | 'persona' | 'onfido';

export type KycStatus = 'pending' | 'in_review' | 'approved' | 'declined' | 'expired';

export interface KycInquiryInput {
  userId: string;
  provider: KycProvider;
  firstName?: string;
  lastName?: string;
  email?: string;
  country: string;
  redirectUrl: string;
}

export interface KycInquiryResult {
  providerInquiryId: string;
  redirectUrl: string;
  status: KycStatus;
}

export interface KycConfig {
  personaApiKey: string | null;
  personaTemplateId: string | null;
  personaApiBaseUrl: string;
  onfidoApiKey: string | null;
  onfidoApiBaseUrl: string;
}

/**
 * Select the best KYC provider for a given country.
 * Stripe Identity is primary; Persona is fallback for US/CA;
 * Onfido is fallback for EU/UK.
 */
export function selectKycProvider(
  country: string,
  stripeIdentityAvailable: boolean
): KycProvider {
  if (stripeIdentityAvailable) return 'stripe_identity';
  const c = country.toUpperCase();
  if (['US', 'CA'].includes(c)) return 'persona';
  return 'onfido';
}

/**
 * Create a Persona inquiry for identity verification.
 */
export async function createPersonaInquiry(input: {
  config: KycConfig;
  inquiry: KycInquiryInput;
}): Promise<KycInquiryResult> {
  if (!input.config.personaApiKey || !input.config.personaTemplateId) {
    throw new Error('PERSONA_NOT_CONFIGURED');
  }

  const response = await fetch(
    `${input.config.personaApiBaseUrl}/inquiries`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.config.personaApiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        data: {
          attributes: {
            'template-id': input.config.personaTemplateId,
            'reference-id': input.inquiry.userId,
            'redirect-url': input.inquiry.redirectUrl,
            notes: `Thryftverse KYC for user ${input.inquiry.userId}`,
          },
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error('PERSONA_INQUIRY_CREATION_FAILED');
  }

  const data = (await response.json()) as {
    data: { id: string; attributes: { status: string; 'redirect-url': string } };
  };

  return {
    providerInquiryId: data.data.id,
    redirectUrl: data.data.attributes['redirect-url'] ?? input.inquiry.redirectUrl,
    status: mapPersonaStatus(data.data.attributes.status),
  };
}

/**
 * Create an Onfido applicant and SDK token for identity verification.
 */
export async function createOnfidoApplicant(input: {
  config: KycConfig;
  inquiry: KycInquiryInput;
}): Promise<KycInquiryResult> {
  if (!input.config.onfidoApiKey) {
    throw new Error('ONFIDO_NOT_CONFIGURED');
  }

  // Create applicant
  const applicantResponse = await fetch(
    `${input.config.onfidoApiBaseUrl}/applicants`,
    {
      method: 'POST',
      headers: {
        Authorization: `Token token=${input.config.onfidoApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        first_name: input.inquiry.firstName ?? 'Unknown',
        last_name: input.inquiry.lastName ?? 'Unknown',
        email: input.inquiry.email,
        country: input.inquiry.country,
      }),
    }
  );

  if (!applicantResponse.ok) {
    throw new Error('ONFIDO_APPLICANT_CREATION_FAILED');
  }

  const applicantData = (await applicantResponse.json()) as { id: string };

  // Create SDK token
  const tokenResponse = await fetch(
    `${input.config.onfidoApiBaseUrl}/sdk_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Token token=${input.config.onfidoApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        applicant_id: applicantData.id,
        referrer: input.inquiry.redirectUrl,
      }),
    }
  );

  if (!tokenResponse.ok) {
    throw new Error('ONFIDO_SDK_TOKEN_CREATION_FAILED');
  }

  const tokenData = (await tokenResponse.json()) as { token: string };

  return {
    providerInquiryId: applicantData.id,
    redirectUrl: `onfido-sdk:${tokenData.token}`,
    status: 'pending',
  };
}

/**
 * Verify a Persona webhook signature.
 */
export function verifyPersonaWebhook(input: {
  payload: string;
  signature: string;
  webhookSecret: string;
}): boolean {
  // Persona uses HMAC-SHA256 with the webhook secret
  const crypto = require('node:crypto');
  const expected = crypto
    .createHmac('sha256', input.webhookSecret)
    .update(input.payload)
    .digest('hex');
  return expected === input.signature;
}

/**
 * Verify an Onfido webhook token.
 */
export function verifyOnfidoWebhook(input: {
  token: string;
  expectedToken: string;
}): boolean {
  return input.token === input.expectedToken;
}

function mapPersonaStatus(status: string): KycStatus {
  switch (status) {
    case 'pending': return 'pending';
    case 'in_review': return 'in_review';
    case 'approved': return 'approved';
    case 'declined': return 'declined';
    case 'expired': return 'expired';
    default: return 'pending';
  }
}
