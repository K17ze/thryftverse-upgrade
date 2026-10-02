'use client';

/**
 * /co-own/pools/create — two-step wizard. Step 1 picks the shared
 * ownership target from the Co-Own market; step 2 sets the pool rules
 * (name, member cap, units target, per-member min/max, terms) against a
 * live feasibility summary. Creates a session pool and lands on
 * its detail page.
 * Decomposed into modular domain components (< 400 LOC standard):
 *  - StepRail
 *  - PickTargetAssetStep
 *  - PoolRulesStep
 *  - useCreatePoolWorkflow
 */

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { StepRail } from './create/StepRail';
import { PickTargetAssetStep } from './create/PickTargetAssetStep';
import { PoolRulesStep } from './create/PoolRulesStep';
import { useCreatePoolWorkflow } from './create/useCreatePoolWorkflow';

export function CreatePoolView() {
  const workflow = useCreatePoolWorkflow();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:px-6 md:pt-10 lg:max-w-2xl">
      <Link
        href="/co-own/pools"
        className="pressable inline-flex items-center gap-1.5 text-body font-medium text-text-secondary hover:text-text-primary"
      >
        <Icon name="back" size={16} />
        Pools
      </Link>

      <header className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="text-editorial-display text-text-primary">
            Start a pool
          </h1>
          <p className="mt-2 text-meta text-text-secondary">
            {workflow.step === 'asset'
              ? 'Pick the asset your pool will buy'
              : 'Set the pool rules'}
          </p>
        </div>
        <StepRail step={workflow.step} />
      </header>

      {workflow.step === 'asset' ? (
        <PickTargetAssetStep
          assetsQ={workflow.assetsQ}
          assetId={workflow.assetId}
          onSelectAsset={workflow.setAssetId}
          onContinue={() => workflow.setStep('rules')}
        />
      ) : (
        <PoolRulesStep
          asset={workflow.asset}
          name={workflow.name}
          setName={workflow.setName}
          memberCapRaw={workflow.memberCapRaw}
          setMemberCapRaw={workflow.setMemberCapRaw}
          unitsRaw={workflow.unitsRaw}
          setUnitsRaw={workflow.setUnitsRaw}
          minRaw={workflow.minRaw}
          setMinRaw={workflow.setMinRaw}
          maxRaw={workflow.maxRaw}
          setMaxRaw={workflow.setMaxRaw}
          terms={workflow.terms}
          setTerms={workflow.setTerms}
          onBlurField={() => workflow.setErrorsVisible(true)}
          targetTotal={workflow.targetTotal}
          unitsTarget={workflow.unitsTarget}
          memberCap={workflow.memberCap}
          maxContribution={workflow.maxContribution}
          errorsVisible={workflow.errorsVisible}
          errors={workflow.errors}
          onBack={() => workflow.setStep('asset')}
          onCreate={workflow.create}
        />
      )}

      {workflow.wall}
    </div>
  );
}
