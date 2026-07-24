import Stripe from 'stripe';
import { config } from '../config.js';

export type KycProviderDecision =
  | 'pending'
  | 'verified'
  | 'requires_input'
  | 'cancelled';

export interface KycProviderEvent {
  providerEventId: string;
  providerSessionId: string;
  caseId: string;
  userId: string;
  decision: KycProviderDecision;
  lastErrorCode: string | null;
  lastErrorReason: string | null;
  rawType: string;
}

let stripeIdentityClient: Stripe | null = null;

function stripeClient(): Stripe {
  if (!config.stripeSecretKey) {
    throw new Error('KYC_PROVIDER_NOT_CONFIGURED');
  }
  stripeIdentityClient ??= new Stripe(config.stripeSecretKey, {
    apiVersion: '2024-06-20',
  });
  return stripeIdentityClient;
}

export function isKycProviderReady(): boolean {
  return config.kycDefaultVendor === 'stripe_identity'
    && Boolean(config.stripeSecretKey)
    && Boolean(config.kycWebhookSecret)
    && Boolean(config.kycReturnUrl);
}

export async function createKycProviderSession(input: {
  caseId: string;
  userId: string;
  requireLiveness: boolean;
}): Promise<{
  provider: 'stripe_identity';
  providerSessionId: string;
  verificationUrl: string;
}> {
  if (!isKycProviderReady()) {
    throw new Error('KYC_PROVIDER_NOT_CONFIGURED');
  }

  const session = await stripeClient().identity.verificationSessions.create({
    type: 'document',
    return_url: config.kycReturnUrl!,
    metadata: {
      thryftverse_case_id: input.caseId,
      thryftverse_user_id: input.userId,
    },
    options: {
      document: {
        require_matching_selfie: input.requireLiveness,
      },
    },
  });

  if (!session.url) {
    throw new Error('KYC_PROVIDER_SESSION_URL_MISSING');
  }

  return {
    provider: 'stripe_identity',
    providerSessionId: session.id,
    verificationUrl: session.url,
  };
}

export async function cancelKycProviderSession(providerSessionId: string): Promise<void> {
  if (!config.stripeSecretKey) {
    return;
  }
  await stripeClient().identity.verificationSessions.cancel(providerSessionId);
}

function decisionForEventType(type: string): KycProviderDecision | null {
  if (type === 'identity.verification_session.verified') {
    return 'verified';
  }
  if (type === 'identity.verification_session.requires_input') {
    return 'requires_input';
  }
  if (type === 'identity.verification_session.canceled') {
    return 'cancelled';
  }
  if (type === 'identity.verification_session.processing') {
    return 'pending';
  }
  return null;
}

export function verifyKycProviderWebhook(
  rawBody: string | Buffer,
  signature: string | string[] | undefined
): KycProviderEvent | null {
  if (!config.kycWebhookSecret || !signature) {
    throw new Error('KYC_WEBHOOK_SIGNATURE_MISSING');
  }

  const signatureValue = Array.isArray(signature) ? signature[0] : signature;
  const event = stripeClient().webhooks.constructEvent(
    rawBody,
    signatureValue,
    config.kycWebhookSecret
  );
  const decision = decisionForEventType(event.type);
  if (!decision) {
    return null;
  }

  const session = event.data.object as Stripe.Identity.VerificationSession;
  const caseId = session.metadata?.thryftverse_case_id;
  const userId = session.metadata?.thryftverse_user_id;
  if (!caseId || !userId) {
    throw new Error('KYC_WEBHOOK_METADATA_MISSING');
  }

  return {
    providerEventId: event.id,
    providerSessionId: session.id,
    caseId,
    userId,
    decision,
    lastErrorCode: session.last_error?.code ?? null,
    lastErrorReason: session.last_error?.reason ?? null,
    rawType: event.type,
  };
}
