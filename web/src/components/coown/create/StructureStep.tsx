'use client';

/**
 * Step 3 — the trust wrapper. Legal vehicle is required by the wire;
 * name/jurisdiction attach only for a real vehicle, and insured custody
 * must name its insurer — the same invariants the server enforces
 * (VEHICLE_NAME_REQUIRED / INSURER_REQUIRED).
 */

import { SellField, INPUT_CLASS, INPUT_ERROR_CLASS } from '@/components/sell/SellField';
import { CheckRow, Segmented } from './controls';
import {
  LEGAL_VEHICLE_OPTIONS,
  sanitizeDecimal,
  type IssueDraft,
  type IssueFieldErrors,
} from './issueDraft';

interface StructureStepProps {
  draft: IssueDraft;
  errors: IssueFieldErrors;
  onPatch: (patch: Partial<IssueDraft>) => void;
  clearError: (field: keyof IssueDraft) => void;
}

export function StructureStep({ draft, errors, onPatch, clearError }: StructureStepProps) {
  const hasVehicle = draft.legalVehicleType !== 'none';

  return (
    <div className="flex flex-col gap-5">
      <SellField
        id="issue-vehicle"
        label="Legal vehicle"
        required
        done={!hasVehicle || draft.legalVehicleName.trim().length >= 2}
        hint="The legal structure that holds the asset — buyers see this on the trust dossier."
      >
        <Segmented
          label="Legal vehicle type"
          value={draft.legalVehicleType}
          options={LEGAL_VEHICLE_OPTIONS}
          onChange={(v) => {
            onPatch({ legalVehicleType: v });
            clearError('legalVehicleName');
          }}
        />
      </SellField>

      {hasVehicle ? (
        <>
          <SellField
            id="issue-vehicle-name"
            label="Vehicle name"
            required
            done={draft.legalVehicleName.trim().length >= 2}
            error={errors.legalVehicleName}
          >
            <input
              id="issue-vehicle-name"
              value={draft.legalVehicleName}
              onChange={(e) => {
                onPatch({ legalVehicleName: e.target.value });
                clearError('legalVehicleName');
              }}
              maxLength={180}
              placeholder="e.g. Thryft Assets SPV I Ltd"
              aria-invalid={!!errors.legalVehicleName}
              className={`${INPUT_CLASS} ${errors.legalVehicleName ? INPUT_ERROR_CLASS : ''}`}
            />
          </SellField>
          <SellField
            id="issue-vehicle-jurisdiction"
            label="Vehicle jurisdiction"
            optional
            done={draft.legalVehicleJurisdiction.trim().length >= 2}
          >
            <input
              id="issue-vehicle-jurisdiction"
              value={draft.legalVehicleJurisdiction}
              onChange={(e) => onPatch({ legalVehicleJurisdiction: e.target.value })}
              maxLength={64}
              placeholder="e.g. England, Delaware"
              className={INPUT_CLASS}
            />
          </SellField>
        </>
      ) : null}

      <SellField
        id="issue-issuer-jurisdiction"
        label="Your jurisdiction"
        optional
        done={draft.issuerJurisdiction.trim().length >= 2}
        error={errors.issuerJurisdiction}
        hint="Country code (e.g. GB) — shown on the asset detail."
      >
        <input
          id="issue-issuer-jurisdiction"
          value={draft.issuerJurisdiction}
          onChange={(e) => {
            onPatch({ issuerJurisdiction: e.target.value });
            clearError('issuerJurisdiction');
          }}
          maxLength={10}
          placeholder="GB"
          aria-invalid={!!errors.issuerJurisdiction}
          className={`${INPUT_CLASS} ${errors.issuerJurisdiction ? INPUT_ERROR_CLASS : ''}`}
        />
      </SellField>

      <div className="flex flex-col gap-5 border-t border-border-subtle pt-5">
        <SellField
          id="issue-custodian"
          label="Custodian"
          optional
          done={draft.custodianName.trim().length >= 2}
          hint="Who physically holds the item while units trade."
        >
          <input
            id="issue-custodian"
            value={draft.custodianName}
            onChange={(e) => onPatch({ custodianName: e.target.value })}
            maxLength={180}
            placeholder="Custodian or vault provider"
            className={INPUT_CLASS}
          />
        </SellField>
        <SellField
          id="issue-custodian-location"
          label="Storage location"
          optional
          done={draft.custodianLocation.trim().length >= 2}
        >
          <input
            id="issue-custodian-location"
            value={draft.custodianLocation}
            onChange={(e) => onPatch({ custodianLocation: e.target.value })}
            maxLength={180}
            placeholder="e.g. London vault"
            className={INPUT_CLASS}
          />
        </SellField>

        <div className="flex flex-col gap-2">
          <CheckRow
            checked={draft.custodyInsured}
            onChange={(v) => {
              onPatch({ custodyInsured: v });
              clearError('custodyInsurer');
            }}
            label="Custody insured"
          />
          {draft.custodyInsured ? (
            <div className="flex flex-col gap-4">
              <SellField
                id="issue-insurer"
                label="Insurer"
                required
                done={draft.custodyInsurer.trim().length >= 2}
                error={errors.custodyInsurer}
              >
                <input
                  id="issue-insurer"
                  value={draft.custodyInsurer}
                  onChange={(e) => {
                    onPatch({ custodyInsurer: e.target.value });
                    clearError('custodyInsurer');
                  }}
                  maxLength={180}
                  placeholder="Insurer name"
                  aria-invalid={!!errors.custodyInsurer}
                  className={`${INPUT_CLASS} ${errors.custodyInsurer ? INPUT_ERROR_CLASS : ''}`}
                />
              </SellField>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SellField
                  id="issue-policy-ref"
                  label="Policy reference"
                  optional
                  done={draft.custodyPolicyRef.trim().length >= 2}
                >
                  <input
                    id="issue-policy-ref"
                    value={draft.custodyPolicyRef}
                    onChange={(e) => onPatch({ custodyPolicyRef: e.target.value })}
                    maxLength={180}
                    placeholder="Policy no."
                    className={INPUT_CLASS}
                  />
                </SellField>
                <SellField
                  id="issue-coverage"
                  label="Coverage"
                  optional
                  done={Number(draft.custodyCoverageGbp) > 0}
                  error={errors.custodyCoverageGbp}
                >
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-body text-text-muted">
                      £
                    </span>
                    <input
                      id="issue-coverage"
                      value={draft.custodyCoverageGbp}
                      onChange={(e) => {
                        onPatch({ custodyCoverageGbp: sanitizeDecimal(e.target.value) });
                        clearError('custodyCoverageGbp');
                      }}
                      inputMode="decimal"
                      placeholder="0.00"
                      aria-invalid={!!errors.custodyCoverageGbp}
                      className={`${INPUT_CLASS} tnum pl-8 ${errors.custodyCoverageGbp ? INPUT_ERROR_CLASS : ''}`}
                    />
                  </div>
                </SellField>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-border-subtle pt-5">
        <CheckRow
          checked={draft.buyerProtection}
          onChange={(v) => {
            onPatch({ buyerProtection: v });
            clearError('buyerProtectionTermsUrl');
          }}
          label="Buyer protection"
          aside="optional"
        />
        {draft.buyerProtection ? (
          <SellField
            id="issue-bp-terms"
            label="Protection terms link"
            optional
            done={/^https?:\/\//.test(draft.buyerProtectionTermsUrl.trim())}
            error={errors.buyerProtectionTermsUrl}
            hint="A public URL buyers can read — full https:// link."
          >
            <input
              id="issue-bp-terms"
              value={draft.buyerProtectionTermsUrl}
              onChange={(e) => {
                onPatch({ buyerProtectionTermsUrl: e.target.value });
                clearError('buyerProtectionTermsUrl');
              }}
              inputMode="url"
              placeholder="https://…"
              aria-invalid={!!errors.buyerProtectionTermsUrl}
              className={`${INPUT_CLASS} ${errors.buyerProtectionTermsUrl ? INPUT_ERROR_CLASS : ''}`}
            />
          </SellField>
        ) : null}
      </div>
    </div>
  );
}
