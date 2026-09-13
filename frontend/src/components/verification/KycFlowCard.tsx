import React from 'react';
import { VerificationFlowCard } from './VerificationFlowCard';
import { KycIdentityStep } from './KycIdentityStep';
import { KycDocumentStep } from './KycDocumentStep';
import { KycReviewStep } from './KycReviewStep';
import { kycStepTitle } from '../../domain/verification';
import type { UseKycFlowResult } from '../../hooks/verification/useKycFlow';

export interface KycFlowCardProps {
  /** The KYC flow hook result — step machine, fields, upload + submit wiring. */
  flow: UseKycFlowResult;
}

/**
 * The identity-verification flow card. Rendered only when the flow step is
 * not 'status' (the screen guards this); dispatches to the step body.
 */
export function KycFlowCard({ flow }: KycFlowCardProps) {
  return (
    <VerificationFlowCard
      title={kycStepTitle(flow.step)}
      onClose={flow.cancel}
      closeAccessibilityLabel="Cancel verification"
      closeAccessibilityHint="Cancels the verification process and returns to status screen"
    >
      {flow.step === 'identity' ? (
        <KycIdentityStep
          fullName={flow.fullName}
          onFullNameChange={flow.setFullName}
          dob={flow.dob}
          onDobChange={flow.setDob}
          addressLine={flow.addressLine}
          onAddressLineChange={flow.setAddressLine}
          city={flow.city}
          onCityChange={flow.setCity}
          postcode={flow.postcode}
          onPostcodeChange={flow.setPostcode}
          onContinue={flow.continueToDocument}
        />
      ) : null}

      {flow.step === 'document' ? (
        <KycDocumentStep
          documentType={flow.documentType}
          onSelectDocumentType={flow.setDocumentType}
          documentUri={flow.documentUri}
          isUploading={flow.isUploadingDocument}
          onPickDocument={flow.pickDocument}
          onTakePhoto={flow.takeDocumentPhoto}
          onRemoveDocument={flow.removeDocument}
          onBack={flow.backToIdentity}
          onContinue={flow.continueToReview}
        />
      ) : null}

      {flow.step === 'review' ? (
        <KycReviewStep
          fullName={flow.fullName}
          dob={flow.dob}
          addressLine={flow.addressLine}
          city={flow.city}
          postcode={flow.postcode}
          documentType={flow.documentType}
          documentUri={flow.documentUri}
          isSubmitting={flow.isSubmitting}
          onBack={flow.backToDocument}
          onSubmit={flow.submit}
        />
      ) : null}
    </VerificationFlowCard>
  );
}
