'use client';

/**
 * Step 4 — provenance and appraisal evidence. 'verified' is deliberately
 * not offered: the server rejects issuer-asserted verification
 * (AUTHENTICITY_REVIEW_REQUIRED) — that badge is a platform review
 * outcome, not a form field.
 */

import { SellField, INPUT_CLASS, INPUT_ERROR_CLASS } from '@/components/sell/SellField';
import { Segmented } from './controls';
import {
  sanitizeDecimal,
  type IssueDraft,
  type IssueFieldErrors,
} from './issueDraft';

const STATUS_OPTIONS = [
  { value: 'unverified' as const, label: 'Unverified' },
  { value: 'pending' as const, label: 'Pending review' },
];

interface AuthenticityStepProps {
  draft: IssueDraft;
  errors: IssueFieldErrors;
  onPatch: (patch: Partial<IssueDraft>) => void;
  clearError: (field: keyof IssueDraft) => void;
}

export function AuthenticityStep({ draft, errors, onPatch, clearError }: AuthenticityStepProps) {
  return (
    <div className="flex flex-col gap-5">
      <SellField
        id="issue-authenticity"
        label="Authenticity status"
        required
        done
        hint="Verified status is awarded by platform review — issuers can't self-attest it."
      >
        <Segmented
          label="Authenticity status"
          value={draft.authenticityStatus}
          options={STATUS_OPTIONS}
          onChange={(v) => onPatch({ authenticityStatus: v })}
        />
      </SellField>

      <SellField
        id="issue-method"
        label="Verification method"
        optional
        done={draft.authenticityMethod.trim().length >= 2}
        error={errors.authenticityMethod}
        hint="e.g. third-party appraisal, brand certificate, Entrupy"
      >
        <input
          id="issue-method"
          value={draft.authenticityMethod}
          onChange={(e) => {
            onPatch({ authenticityMethod: e.target.value });
            clearError('authenticityMethod');
          }}
          maxLength={180}
          placeholder="How the item was or will be authenticated"
          aria-invalid={!!errors.authenticityMethod}
          className={`${INPUT_CLASS} ${errors.authenticityMethod ? INPUT_ERROR_CLASS : ''}`}
        />
      </SellField>

      <SellField
        id="issue-provenance"
        label="Provenance"
        optional
        done={draft.provenance.trim().length >= 2}
        error={errors.provenance}
        hint="Ownership history and supporting evidence — shown on the trust dossier."
      >
        <textarea
          id="issue-provenance"
          value={draft.provenance}
          onChange={(e) => {
            onPatch({ provenance: e.target.value });
            clearError('provenance');
          }}
          maxLength={2000}
          rows={3}
          placeholder="Purchase receipts, prior owners, exhibition history…"
          aria-invalid={!!errors.provenance}
          className={`${INPUT_CLASS} h-auto py-3 ${errors.provenance ? INPUT_ERROR_CLASS : ''}`}
        />
      </SellField>

      <SellField
        id="issue-condition"
        label="Condition grade"
        optional
        done={draft.conditionGrade.trim().length >= 1}
        error={errors.conditionGrade}
        hint="e.g. Excellent — light wear"
      >
        <input
          id="issue-condition"
          value={draft.conditionGrade}
          onChange={(e) => {
            onPatch({ conditionGrade: e.target.value });
            clearError('conditionGrade');
          }}
          maxLength={64}
          placeholder="Condition summary"
          aria-invalid={!!errors.conditionGrade}
          className={`${INPUT_CLASS} ${errors.conditionGrade ? INPUT_ERROR_CLASS : ''}`}
        />
      </SellField>

      <div className="flex flex-col gap-4 border-t border-border-subtle pt-5">
        <p className="text-label text-text-secondary">Appraisal <span className="text-micro font-normal text-text-muted">optional</span></p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SellField
            id="issue-appraisal-value"
            label="Appraised value"
            optional
            done={Number(draft.appraisalValueGbp) > 0}
            error={errors.appraisalValueGbp}
          >
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-body text-text-muted">
                £
              </span>
              <input
                id="issue-appraisal-value"
                value={draft.appraisalValueGbp}
                onChange={(e) => {
                  onPatch({ appraisalValueGbp: sanitizeDecimal(e.target.value) });
                  clearError('appraisalValueGbp');
                }}
                inputMode="decimal"
                placeholder="0.00"
                aria-invalid={!!errors.appraisalValueGbp}
                className={`${INPUT_CLASS} tnum pl-8 ${errors.appraisalValueGbp ? INPUT_ERROR_CLASS : ''}`}
              />
            </div>
          </SellField>
          <SellField
            id="issue-appraisal-date"
            label="Valued on"
            optional
            done={!!draft.appraisalValuedAt}
            error={errors.appraisalValuedAt}
          >
            <input
              id="issue-appraisal-date"
              type="date"
              value={draft.appraisalValuedAt}
              onChange={(e) => {
                onPatch({ appraisalValuedAt: e.target.value });
                clearError('appraisalValuedAt');
              }}
              aria-invalid={!!errors.appraisalValuedAt}
              className={`${INPUT_CLASS} ${errors.appraisalValuedAt ? INPUT_ERROR_CLASS : ''}`}
            />
          </SellField>
        </div>
        <SellField
          id="issue-appraisal-valuer"
          label="Valuer"
          optional
          done={draft.appraisalValuer.trim().length >= 2}
        >
          <input
            id="issue-appraisal-valuer"
            value={draft.appraisalValuer}
            onChange={(e) => onPatch({ appraisalValuer: e.target.value })}
            maxLength={180}
            placeholder="Who appraised it"
            className={INPUT_CLASS}
          />
        </SellField>
      </div>
    </div>
  );
}
