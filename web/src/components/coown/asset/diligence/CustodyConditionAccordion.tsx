'use client';

import { Icon } from '@/components/ui/Icon';
import type { CoOwnAsset, DueDiligenceProfile } from '@/lib/contracts/coown';
import { formatDate } from '@/lib/utils/format';
import { gbp } from '../../format';
import { DossierRow, DossierText, RuleHead } from './diligenceTypes';
import { RefreshAppraisalForm } from './RefreshAppraisalForm';

interface CustodyConditionAccordionProps {
  asset: CoOwnAsset;
  diligence: DueDiligenceProfile | null | undefined;
  isOpen: boolean;
  onToggle: () => void;
  isIssuer: boolean;
}

export function CustodyConditionAccordion({
  asset,
  diligence,
  isOpen,
  onToggle,
  isIssuer,
}: CustodyConditionAccordionProps) {
  const dossier = diligence?.dossier ?? null;
  const custodyMeta = asset.custodyNote ? asset.custodyNote.split('.')[0] : null;

  return (
    <div>
      <RuleHead
        label="Custody & condition"
        meta={custodyMeta}
        open={isOpen}
        onToggle={onToggle}
      />
      {isOpen ? (
        <>
          <dl className="divide-y divide-border-subtle pb-4">
            {asset.custodyNote ? (
              <DossierText label="Custody" value={asset.custodyNote} />
            ) : null}
            <div className="py-2">
              <dt className="text-meta font-semibold uppercase tracking-wide text-text-muted">Authentication</dt>
              <dd className="mt-1 text-body text-text-primary">
                {dossier?.authenticityStatus === 'verified' ? (
                  <>
                    Verified
                    {dossier.authenticityMethod ? (
                      <span className="text-text-secondary"> · {dossier.authenticityMethod}</span>
                    ) : null}
                    {diligence?.authenticatedAt ? (
                      <span className="text-text-secondary"> · {formatDate(diligence.authenticatedAt)}</span>
                    ) : null}
                  </>
                ) : diligence?.authenticatedBy ? (
                  <>
                    {diligence.authenticatedBy}
                    {diligence.authenticatedAt ? (
                      <span className="text-text-secondary"> · {formatDate(diligence.authenticatedAt)}</span>
                    ) : null}
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-text-secondary">
                    <Icon name="clock" size={14} />
                    {dossier?.authenticityStatus === 'unverified'
                      ? 'Not yet authenticated'
                      : 'Authentication in progress'}
                  </span>
                )}
              </dd>
            </div>
            {diligence?.conditionSummary ? (
              <DossierText
                label={`Condition${diligence.conditionGrade ? ` · ${diligence.conditionGrade}` : ''}`}
                value={diligence.conditionSummary}
              />
            ) : null}
            {dossier?.custodianName ? (
              <DossierRow
                label="Custodian"
                value={
                  dossier.custodianName +
                  (dossier.custodianLocation ? ` · ${dossier.custodianLocation}` : '')
                }
              />
            ) : null}
            {dossier?.custodyInsured ? (
              <DossierRow
                label="Insurance"
                value={
                  (dossier.custodyInsurer ?? 'Insured custody') +
                  (dossier.custodyCoverageGbp != null
                    ? ` · ${gbp(dossier.custodyCoverageGbp)} cover`
                    : '')
                }
              />
            ) : null}
            {dossier?.appraisalValueGbp != null ? (
              <DossierRow
                label="Appraisal"
                value={
                  gbp(dossier.appraisalValueGbp) +
                  (dossier.appraisalValuer ? ` · ${dossier.appraisalValuer}` : '') +
                  (dossier.appraisalValuedAt ? ` · ${formatDate(dossier.appraisalValuedAt)}` : '')
                }
              />
            ) : null}
            {dossier?.legalVehicleName ? (
              <DossierRow
                label="Legal vehicle"
                value={
                  dossier.legalVehicleName +
                  (dossier.legalVehicleType ? ` · ${dossier.legalVehicleType}` : '')
                }
              />
            ) : null}
            {dossier?.escrowPartner ? (
              <DossierRow label="Escrow" value={dossier.escrowPartner} />
            ) : null}
            {dossier?.safeguardingPartner ? (
              <DossierRow label="Safeguarding" value={dossier.safeguardingPartner} />
            ) : null}
            {dossier?.buyerProtection != null ? (
              <DossierRow
                label="Buyer protection"
                value={dossier.buyerProtection ? 'Covered' : 'Not covered'}
              />
            ) : null}
          </dl>
          {isIssuer ? (
            <RefreshAppraisalForm
              assetId={asset.id}
              currentValuer={dossier?.appraisalValuer ?? null}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
