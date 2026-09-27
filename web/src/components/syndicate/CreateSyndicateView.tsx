'use client';

/**
 * /co-own/syndicate/create — two-step wizard. Step 1 picks the shared
 * ownership target from the Co-Own market; step 2 sets the pool rules
 * (name, member cap, units target, per-member min/max, terms) against a
 * live feasibility summary. Creates a session syndicate and lands on
 * its detail page.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useSignupWall } from '@/components/auth/SignupWall';
import { AssetThumb } from '@/components/coown/AssetThumb';
import { LifecycleTag } from '@/components/coown/LifecycleTag';
import { gbp } from '@/components/coown/format';
import { SYNDICATE_LIMITS } from '@/lib/contracts/syndicate';
import { useCoOwnAssets } from '@/lib/hooks/coown-queries';
import { useSyndicateActions } from '@/lib/hooks/syndicate-queries';
import { useSession } from '@/lib/session/SessionProvider';

type Step = 'asset' | 'rules';

const STEPS: { key: Step; n: string; label: string }[] = [
  { key: 'asset', n: '01', label: 'Target' },
  { key: 'rules', n: '02', label: 'Rules' },
];

/** Two-step rail — done steps collapse to a check, the active step leads. */
function StepRail({ step }: { step: Step }) {
  const activeIndex = step === 'asset' ? 0 : 1;
  return (
    <ol className="flex items-center gap-3" aria-label="Wizard progress">
      {STEPS.map((s, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <li key={s.key} className="flex items-center gap-3">
            {i > 0 ? <span aria-hidden="true" className="h-px w-8 bg-border-subtle" /> : null}
            <span
              className="flex items-center gap-1.5"
              aria-current={active ? 'step' : undefined}
            >
              {done ? (
                <Icon name="check" size={13} className="text-coown-up" />
              ) : (
                <span
                  className={`tnum text-micro font-semibold ${
                    active ? 'text-brand' : 'text-text-muted'
                  }`}
                >
                  {s.n}
                </span>
              )}
              <span
                className={`text-meta font-semibold uppercase tracking-[0.08em] ${
                  active ? 'text-text-primary' : 'text-text-muted'
                }`}
              >
                {s.label}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

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
      <label htmlFor={htmlFor} className="text-label font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </label>
      <div className="mt-2">{children}</div>
      {hint ? <p className="mt-1.5 text-meta text-text-muted">{hint}</p> : null}
    </div>
  );
}

export function CreateSyndicateView() {
  const router = useRouter();
  const { user } = useSession();
  const { requireAuth, wall } = useSignupWall();
  const { createSyndicate } = useSyndicateActions();
  const { show } = useToast();
  const assetsQ = useCoOwnAssets();

  const [step, setStep] = useState<Step>('asset');
  const [assetId, setAssetId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [memberCapRaw, setMemberCapRaw] = useState('6');
  const [unitsRaw, setUnitsRaw] = useState('10');
  const [minRaw, setMinRaw] = useState('100');
  const [maxRaw, setMaxRaw] = useState('1000');
  const [terms, setTerms] = useState('');
  // Errors surface on field blur or a create attempt — not on mount.
  const [errorsVisible, setErrorsVisible] = useState(false);

  const asset = useMemo(
    () => assetsQ.data?.find((a) => a.id === assetId) ?? null,
    [assetsQ.data, assetId],
  );

  const memberCap = Math.floor(Number(memberCapRaw));
  const unitsTarget = Math.floor(Number(unitsRaw));
  const minContribution = Number(minRaw);
  const maxContribution = Number(maxRaw);

  /** Rule validation — every check a pool must pass before it exists. */
  const errors = useMemo(() => {
    const list: string[] = [];
    if (!name.trim()) list.push('Give the pool a name');
    if (!Number.isFinite(memberCap) || memberCap < SYNDICATE_LIMITS.memberCapMin || memberCap > SYNDICATE_LIMITS.memberCapMax) {
      list.push(`Member cap must be ${SYNDICATE_LIMITS.memberCapMin}–${SYNDICATE_LIMITS.memberCapMax}`);
    }
    if (!Number.isFinite(unitsTarget) || unitsTarget < 1) {
      list.push('Units target must be at least 1');
    } else if (asset && unitsTarget > asset.totalUnits) {
      list.push(`Can't exceed the issue size (${asset.totalUnits} units)`);
    }
    if (!Number.isFinite(minContribution) || minContribution <= 0) {
      list.push('Minimum contribution must be above £0');
    }
    if (!Number.isFinite(maxContribution) || maxContribution <= 0) {
      list.push('Maximum contribution must be above £0');
    } else if (Number.isFinite(minContribution) && minContribution > maxContribution) {
      list.push('Minimum can\'t exceed the maximum');
    }
    if (asset && Number.isFinite(unitsTarget) && unitsTarget >= 1
        && Number.isFinite(memberCap) && Number.isFinite(maxContribution) && maxContribution > 0) {
      const target = unitsTarget * asset.unitPriceGbp;
      const raiseable = memberCap * maxContribution;
      if (raiseable < target) {
        list.push(
          `${memberCap} members × ${gbp(maxContribution)} raises at most ${gbp(raiseable)} — below the ${gbp(target)} target`,
        );
      }
    }
    return list;
  }, [name, memberCap, unitsTarget, minContribution, maxContribution, asset]);

  const canCreate = asset != null && errors.length === 0;
  const targetTotal = asset && unitsTarget >= 1 ? unitsTarget * asset.unitPriceGbp : null;

  const create = () => {
    if (!canCreate) {
      setErrorsVisible(true);
      return;
    }
    if (!requireAuth('purchase')) return;
    if (!user || !asset) return;
    const syndicate = createSyndicate(
      {
        name: name.trim(),
        assetId: asset.id,
        memberCap,
        unitsTarget,
        minContributionGbp: Math.round(minContribution * 100) / 100,
        maxContributionGbp: Math.round(maxContribution * 100) / 100,
        termsNote: terms.trim() ? terms.trim() : null,
      },
      { id: user.id, username: user.username, displayName: null, avatar: user.avatar },
    );
    show('Syndicate created — invite members to fund it', 'success');
    router.push(`/co-own/syndicate/${syndicate.id}`);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:px-6 md:pt-10">
      <Link
        href="/co-own/syndicate"
        className="pressable inline-flex items-center gap-1.5 text-body font-medium text-text-secondary hover:text-text-primary"
      >
        <Icon name="back" size={16} />
        Syndicates
      </Link>

      <header className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="text-editorial-display text-text-primary">Start a syndicate</h1>
          <p className="mt-2 text-meta text-text-secondary">
            {step === 'asset' ? 'Pick the asset your pool will buy' : 'Set the pool rules'}
          </p>
        </div>
        <StepRail step={step} />
      </header>

      {step === 'asset' ? (
        <section aria-label="Pick a target asset" className="mt-6">
          {assetsQ.isLoading ? (
            <div className="space-y-3" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-20 rounded-lg" />
              ))}
            </div>
          ) : assetsQ.isError || !assetsQ.data ? (
            <EmptyState
              icon="trending"
              title="Markets unavailable"
              subtitle="We couldn't load the Co-Own market. Check your connection and try again."
              actionLabel="Retry"
              onAction={() => void assetsQ.refetch()}
            />
          ) : (
            <>
              <div role="radiogroup" aria-label="Target asset" className="divide-y divide-border-subtle border-y border-border-subtle">
                {assetsQ.data.map((a) => {
                  const selected = a.id === assetId;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setAssetId(a.id)}
                      className="pressable flex w-full items-center gap-3.5 px-1 py-3 text-left transition-colors hover:bg-row"
                    >
                      <AssetThumb src={a.imageUrl} alt={a.title} className="w-14" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body font-semibold text-text-primary">{a.title}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                          <LifecycleTag asset={a} />
                          <span className="text-meta text-text-muted tnum">
                            {gbp(a.unitPriceGbp)} / unit · {a.totalUnits} units
                          </span>
                        </div>
                      </div>
                      <span
                        aria-hidden="true"
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                          selected ? 'border-brand bg-brand text-text-inverse' : 'border-border'
                        }`}
                      >
                        {selected ? <Icon name="check" size={12} /> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-6 flex justify-end">
                <Button size="md" disabled={assetId == null} onClick={() => setStep('rules')}>
                  Continue
                </Button>
              </div>
            </>
          )}
        </section>
      ) : (
        <section aria-label="Pool rules" className="mt-6">
          {/* Selected target recap — compact, changeable. */}
          {asset ? (
            <div className="flex items-center gap-3.5 border-b border-border-subtle pb-5">
              <AssetThumb src={asset.imageUrl} alt={asset.title} className="w-14" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-semibold text-text-primary">{asset.title}</p>
                <p className="mt-0.5 text-meta text-text-muted tnum">{gbp(asset.unitPriceGbp)} / unit</p>
              </div>
              <Button variant="quiet" size="sm" onClick={() => setStep('asset')}>
                Change
              </Button>
            </div>
          ) : null}

          <div className="mt-6 space-y-5">
            <Field label="Pool name" htmlFor="syn-name">
              <input
                id="syn-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setErrorsVisible(true)}
                maxLength={SYNDICATE_LIMITS.nameMaxLength}
                placeholder="e.g. Birkin Circle"
                className={FIELD}
                autoFocus
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Member cap"
                htmlFor="syn-cap"
                hint={`${SYNDICATE_LIMITS.memberCapMin}–${SYNDICATE_LIMITS.memberCapMax} members`}
              >
                <input
                  id="syn-cap"
                  type="number"
                  inputMode="numeric"
                  min={SYNDICATE_LIMITS.memberCapMin}
                  max={SYNDICATE_LIMITS.memberCapMax}
                  step={1}
                  value={memberCapRaw}
                  onChange={(e) => setMemberCapRaw(e.target.value)}
                  onBlur={() => setErrorsVisible(true)}
                  className={FIELD}
                />
              </Field>
              <Field
                label="Units target"
                htmlFor="syn-units"
                hint={asset ? `Issue size ${asset.totalUnits} units` : undefined}
              >
                <input
                  id="syn-units"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={unitsRaw}
                  onChange={(e) => setUnitsRaw(e.target.value)}
                  onBlur={() => setErrorsVisible(true)}
                  className={FIELD}
                />
              </Field>
              <Field label="Min contribution" htmlFor="syn-min" hint="Per member, in GBP">
                <input
                  id="syn-min"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={minRaw}
                  onChange={(e) => setMinRaw(e.target.value)}
                  onBlur={() => setErrorsVisible(true)}
                  className={FIELD}
                />
              </Field>
              <Field label="Max contribution" htmlFor="syn-max" hint="Per member, cumulative">
                <input
                  id="syn-max"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={maxRaw}
                  onChange={(e) => setMaxRaw(e.target.value)}
                  onBlur={() => setErrorsVisible(true)}
                  className={FIELD}
                />
              </Field>
            </div>

            <Field label="Terms note" htmlFor="syn-terms" hint="Optional — shown to every member before they commit">
              <textarea
                id="syn-terms"
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
                    Pool target <span className="font-semibold text-text-primary tnum">{gbp(targetTotal)}</span>
                    {' — '}
                    <span className="tnum">{unitsTarget}</span> units at{' '}
                    <span className="tnum">{gbp(asset.unitPriceGbp)}</span>
                  </>
                ) : (
                  'Set a units target to see the pool total'
                )}
              </p>
              {Number.isFinite(memberCap) && Number.isFinite(maxContribution) && maxContribution > 0 ? (
                <p className="mt-1 text-meta text-text-muted tnum">
                  Up to {gbp(memberCap * maxContribution)} raiseable across {memberCap} members
                </p>
              ) : null}
              {errorsVisible && errors.length > 0 ? (
                <ul className="mt-3 space-y-1.5" role="alert">
                  {errors.map((e) => (
                    <li key={e} className="flex items-start gap-1.5 text-meta text-danger-text">
                      <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
                      {e}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="mt-8 flex items-center justify-between gap-3">
            <Button variant="quiet" size="md" onClick={() => setStep('asset')}>
              Back
            </Button>
            <Button variant="primary" size="lg" onClick={create}>
              Create syndicate
            </Button>
          </div>
        </section>
      )}

      {wall}
    </div>
  );
}
