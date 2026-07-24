export interface PayoutProviderReferenceInput {
  targetStatus: string;
  transitionSource: string;
  inputProviderPayoutRef?: string | null;
  existingProviderPayoutRef?: string | null;
}

export interface PayoutProviderReferenceResolution {
  providerPayoutRef: string | null;
  requiresProviderReference: boolean;
  isValid: boolean;
}

function normalizeProviderRef(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function resolvePayoutProviderReference(
  input: PayoutProviderReferenceInput
): PayoutProviderReferenceResolution {
  const existingProviderPayoutRef = normalizeProviderRef(input.existingProviderPayoutRef);

  if (input.targetStatus !== 'paid') {
    return {
      providerPayoutRef: existingProviderPayoutRef,
      requiresProviderReference: false,
      isValid: true,
    };
  }

  const inputProviderPayoutRef = normalizeProviderRef(input.inputProviderPayoutRef);
  const mergedProviderPayoutRef = inputProviderPayoutRef ?? existingProviderPayoutRef;

  return {
    providerPayoutRef: mergedProviderPayoutRef,
    requiresProviderReference: true,
    isValid: mergedProviderPayoutRef !== null,
  };
}
