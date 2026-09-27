'use client';

/**
 * ReviewStep — KYC step 3: a hairline summary of everything entered, with
 * Edit links that jump back to the owning step, the attached document
 * preview, and the honest submit note for fixture mode.
 */

import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { VerificationNote } from './VerificationNote';
import type { KycDocumentFile } from './DocumentStep';
import {
  kycDocumentTypeLabel,
  type KycDocumentType,
  type KycIdentityFields,
  type VerificationStep,
} from './verificationModel';

interface ReviewStepProps {
  fields: KycIdentityFields;
  documentType: KycDocumentType;
  file: KycDocumentFile | null;
  submitting: boolean;
  onEdit: (step: VerificationStep) => void;
  onBack: () => void;
  onSubmit: () => void;
}

function ReviewRow({
  label,
  value,
  editLabel,
  onEdit,
}: {
  label: string;
  value: string;
  editLabel: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-start gap-4 border-b border-border-subtle py-3.5 last:border-b-0">
      <span className="w-28 shrink-0 pt-0.5 text-caption text-text-muted">{label}</span>
      <span className="min-w-0 flex-1 text-body-emphasis text-text-primary">{value}</span>
      <button
        type="button"
        onClick={onEdit}
        aria-label={editLabel}
        className="pressable shrink-0 rounded-md px-2 py-0.5 text-caption font-semibold text-text-secondary transition-colors hover:bg-surface-alt hover:text-text-primary"
      >
        Edit
      </button>
    </div>
  );
}

export function ReviewStep({
  fields,
  documentType,
  file,
  submitting,
  onEdit,
  onBack,
  onSubmit,
}: ReviewStepProps) {
  const address = [fields.addressLine.trim(), fields.city.trim(), fields.postcode.trim()]
    .filter(Boolean)
    .join(', ');

  return (
    <div>
      <div className="border-y border-border-subtle">
        <ReviewRow
          label="Name"
          value={fields.fullName.trim()}
          editLabel="Edit name"
          onEdit={() => onEdit('identity')}
        />
        <ReviewRow
          label="Date of birth"
          value={fields.dob}
          editLabel="Edit date of birth"
          onEdit={() => onEdit('identity')}
        />
        <ReviewRow
          label="Address"
          value={address}
          editLabel="Edit address"
          onEdit={() => onEdit('identity')}
        />
        <ReviewRow
          label="Document"
          value={kycDocumentTypeLabel(documentType)}
          editLabel="Edit document type"
          onEdit={() => onEdit('document')}
        />
      </div>

      {file ? (
        <div className="mt-5 overflow-hidden rounded-lg border border-border">
          <AppImage
            src={file.url}
            alt="Uploaded document preview"
            aspectRatio={2.4}
            sizes="(max-width: 720px) 100vw, 720px"
          />
          <div className="flex items-center gap-2.5 px-4 py-3">
            <Icon name="check" filled size={16} className="text-success-text" />
            <span className="text-caption text-text-secondary">Document photo attached</span>
          </div>
        </div>
      ) : null}

      <VerificationNote icon="lock">
        Demo check — submitting starts a simulated review that completes in a
        few seconds. Nothing is sent anywhere; the photo never leaves this tab.
      </VerificationNote>

      <div className="mt-8 flex items-center gap-3">
        <Button variant="quiet" size="md" onClick={onBack} disabled={submitting}>
          Back
        </Button>
        <Button
          variant="primary"
          size="md"
          className="flex-1"
          onClick={onSubmit}
          disabled={submitting}
        >
          {submitting ? 'Submitting…' : 'Submit verification'}
        </Button>
      </div>
    </div>
  );
}
