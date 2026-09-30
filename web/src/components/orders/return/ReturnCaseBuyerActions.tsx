'use client';

import { useState } from 'react';
import type { ReturnCase } from '@/lib/contracts/domain';
import type { ReturnCaseTransition } from '@/lib/data/fixtures-commerce';
import { formatPrice } from '@/lib/utils/format';
import { EvidencePhotoField, type EvidencePhoto } from '@/components/orders/EvidencePhotoField';
import {
  ActionRow,
  FormShell,
  inputCls,
  remedyLabel,
  type FormKind,
} from './ReturnCasePrimitives';

interface Props {
  returnCase: ReturnCase;
  isSubmitting?: boolean;
  onAction: (action: ReturnCaseTransition) => void;
}

export function ReturnCaseBuyerActions({
  returnCase,
  isSubmitting = false,
  onAction,
}: Props) {
  const [form, setForm] = useState<FormKind | null>(null);
  const [reason, setReason] = useState('');
  const [evidencePhotos, setEvidencePhotos] = useState<EvidencePhoto[]>([]);

  const status = returnCase.status;

  const openForm = (kind: FormKind, preset = '') => {
    setReason(preset);
    setForm(kind);
  };

  const submit = (action: ReturnCaseTransition) => {
    onAction(action);
    setForm(null);
  };

  return (
    <>
      {/* Additional evidence — POST /return-cases/:id/evidence is buyer-only */}
      {(status === 'requested' || status === 'evidence_review') && (
        <ActionRow
          label="Add evidence photos"
          icon="camera"
          disabled={isSubmitting}
          onPress={() => {
            setEvidencePhotos([]);
            setForm('evidence');
          }}
        />
      )}

      {form === 'evidence' ? (
        <FormShell
          submitLabel="Add to case"
          submitDisabled={
            evidencePhotos.length === 0 ||
            evidencePhotos.some((p) => p.state === 'uploading' || p.state === 'failed')
          }
          isSubmitting={isSubmitting}
          onCancel={() => setForm(null)}
          onSubmit={() =>
            submit({
              type: 'evidence',
              urls: evidencePhotos
                .filter((p) => p.state === 'attached')
                .map((p) => p.uri),
            })
          }
        >
          <EvidencePhotoField
            label="Evidence"
            hint="Add photos that support your case — damage, packaging, anything the seller should see."
            items={evidencePhotos}
            onChange={setEvidencePhotos}
          />
          {evidencePhotos.some((p) => p.state === 'failed') ? (
            <p className="text-caption text-danger-text">
              A photo failed to upload — remove it before submitting.
            </p>
          ) : null}
        </FormShell>
      ) : null}

      {status === 'remedy_proposed' ? (
        <>
          <p className="tnum text-body-emphasis font-medium text-text-primary">
            {remedyLabel(returnCase.proposedRemedy)}
            {returnCase.remedyAmountGbp != null ? ` · ${formatPrice(returnCase.remedyAmountGbp)}` : ''}
          </p>
          <ActionRow
            label="Accept remedy"
            icon="check"
            disabled={isSubmitting}
            onPress={() => submit({ type: 'remedy_accept' })}
          />
          <ActionRow
            label="Decline — ask Thryft to review"
            icon="shield"
            disabled={isSubmitting}
            onPress={() => openForm('remedy_reject')}
          />
        </>
      ) : null}

      {status === 'rejected' ? (
        <ActionRow
          label="Appeal this decision"
          icon="shield"
          disabled={isSubmitting}
          onPress={() => openForm('appeal')}
        />
      ) : null}

      {form === 'appeal' || form === 'remedy_reject' ? (
        <FormShell
          submitLabel={form === 'appeal' ? 'Submit appeal' : 'Decline remedy'}
          submitDisabled={!reason.trim()}
          isSubmitting={isSubmitting}
          onCancel={() => setForm(null)}
          onSubmit={() =>
            submit(
              form === 'appeal'
                ? { type: 'appeal', reason: reason.trim() }
                : { type: 'remedy_reject', reason: reason.trim() },
            )
          }
        >
          <textarea
            className={inputCls}
            rows={3}
            aria-label={form === 'appeal' ? 'Appeal reason' : 'Reason this remedy is not acceptable'}
            placeholder={form === 'appeal' ? 'Why are you appealing?' : 'Why is this remedy not acceptable?'}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
          />
        </FormShell>
      ) : null}
    </>
  );
}
