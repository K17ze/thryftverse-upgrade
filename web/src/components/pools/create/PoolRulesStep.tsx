'use client';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { AssetThumb } from '@/components/coown/AssetThumb';
import { gbp } from '@/components/coown/format';
import { SYNDICATE_LIMITS } from '@/lib/contracts/syndicate';
import type { CoOwnAsset } from '@/lib/contracts/coown';

const FIELD =
  'h-11 w-full rounded-md border border-border bg-input px-3.5 text-body tnum text-input-text placeholder:text-text-muted transition-colors focus:border-text-muted focus:outline-none';

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-label text-text-muted">
        {label}
      </label>
      <div className="mt-2">{children}</div>
      {hint ? <p className="mt-1.5 text-meta text-text-muted">{hint}</p> : null}
    </div>
  );
}

interface PoolRulesStepProps {
  asset: CoOwnAsset | null;
  name: string;
  setName: (v: string) => void;
  memberCapRaw: string;
  setMemberCapRaw: (v: string) => void;
  unitsRaw: string;
  setUnitsRaw: (v: string) => void;
  minRaw: string;
  setMinRaw: (v: string) => void;
  maxRaw: string;
  setMaxRaw: (v: string) => void;
  terms: string;
  setTerms: (v: string) => void;
  onBlurField: () => void;
  targetTotal: number | null;
  unitsTarget: number;
  memberCap: number;
  maxContribution: number;
  errorsVisible: boolean;
  errors: string[];
  onBack: () => void;
  onCreate: () => void;
}

/**
 * Step 2: Pool rules, caps, contribution bounds, and live feasibility analysis.
 */
export function PoolRulesStep({
  asset,
  name,
  setName,
  memberCapRaw,
  setMemberCapRaw,
  unitsRaw,
  setUnitsRaw,
  minRaw,
  setMinRaw,
  maxRaw,
  setMaxRaw,
  terms,
  setTerms,
  onBlurField,
  targetTotal,
  unitsTarget,
  memberCap,
  maxContribution,
  errorsVisible,
  errors,
  onBack,
  onCreate,
}: PoolRulesStepProps) {
  return (
    <section aria-label="Pool rules" className="mt-6">
      {/* Selected target recap — compact, changeable. */}
      {asset ? (
        <div className="flex items-center gap-3.5 border-b border-border-subtle pb-5">
          <AssetThumb src={asset.imageUrl} alt={asset.title} className="w-14" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-semibold text-text-primary">
              {asset.title}
            </p>
            <p className="mt-0.5 text-meta text-text-muted tnum">
              {gbp(asset.unitPriceGbp)} / unit
            </p>
          </div>
          <Button variant="quiet" size="sm" onClick={onBack}>
            Change
          </Button>
        </div>
      ) : null}

      <div className="mt-6 space-y-5">
        <Field label="Pool name" htmlFor="pool-name">
          <input
            id="pool-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={onBlurField}
            maxLength={SYNDICATE_LIMITS.nameMaxLength}
            placeholder="e.g. Birkin Circle"
            className={FIELD}
            autoFocus
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Member cap"
            htmlFor="pool-cap"
            hint={`${SYNDICATE_LIMITS.memberCapMin}–${SYNDICATE_LIMITS.memberCapMax} members`}
          >
            <input
              id="pool-cap"
              type="number"
              inputMode="numeric"
              min={SYNDICATE_LIMITS.memberCapMin}
              max={SYNDICATE_LIMITS.memberCapMax}
              step={1}
              value={memberCapRaw}
              onChange={(e) => setMemberCapRaw(e.target.value)}
              onBlur={onBlurField}
              className={FIELD}
            />
          </Field>
          <Field
            label="Units target"
            htmlFor="pool-units"
            hint={asset ? `Issue size ${asset.totalUnits} units` : undefined}
          >
            <input
              id="pool-units"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={unitsRaw}
              onChange={(e) => setUnitsRaw(e.target.value)}
              onBlur={onBlurField}
              className={FIELD}
            />
          </Field>
          <Field
            label="Min contribution"
            htmlFor="pool-min"
            hint="Per member, in GBP"
          >
            <input
              id="pool-min"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={minRaw}
              onChange={(e) => setMinRaw(e.target.value)}
              onBlur={onBlurField}
              className={FIELD}
            />
          </Field>
          <Field
            label="Max contribution"
            htmlFor="pool-max"
            hint="Per member, cumulative"
          >
            <input
              id="pool-max"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={maxRaw}
              onChange={(e) => setMaxRaw(e.target.value)}
              onBlur={onBlurField}
              className={FIELD}
            />
          </Field>
        </div>

        <Field
          label="Terms note"
          htmlFor="pool-terms"
          hint="Optional — shown to every member before they commit"
        >
          <textarea
            id="pool-terms"
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            maxLength={SYNDICATE_LIMITS.termsMaxLength}
            rows={3}
            placeholder="e.g. Holding to spring 2027 resale window. Exits by member vote."
            className="w-full rounded-md border border-border bg-input px-3.5 py-3 text-body text-input-text placeholder:text-text-muted transition-colors focus:border-text-muted focus:outline-none"
          />
        </Field>
      </div>

      {/* Live feasibility — what these rules would raise. */}
      {asset ? (
        <div className="mt-6 border-t border-border-subtle pt-5">
          <p className="text-body text-text-secondary">
            {targetTotal != null ? (
              <>
                Pool target{' '}
                <span className="font-semibold text-text-primary tnum">
                  {gbp(targetTotal)}
                </span>
                {' — '}
                <span className="tnum">{unitsTarget}</span> units at{' '}
                <span className="tnum">{gbp(asset.unitPriceGbp)}</span>
              </>
            ) : (
              'Set a units target to see the pool total'
            )}
          </p>
          {Number.isFinite(memberCap) &&
          Number.isFinite(maxContribution) &&
          maxContribution > 0 ? (
            <p className="mt-1 text-meta text-text-muted tnum">
              Up to {gbp(memberCap * maxContribution)} raiseable across{' '}
              {memberCap} members
            </p>
          ) : null}
          {errorsVisible && errors.length > 0 ? (
            <ul className="mt-3 space-y-1.5" role="alert">
              {errors.map((e) => (
                <li
                  key={e}
                  className="flex items-start gap-1.5 text-meta text-danger-text"
                >
                  <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
                  {e}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="mt-8 flex items-center justify-between gap-3">
        <Button variant="quiet" size="md" onClick={onBack}>
          Back
        </Button>
        <Button variant="primary" size="lg" onClick={onCreate}>
          Create pool
        </Button>
      </div>
    </section>
  );
}
