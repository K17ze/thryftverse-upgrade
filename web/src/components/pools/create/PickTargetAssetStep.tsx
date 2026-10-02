'use client';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { AssetThumb } from '@/components/coown/AssetThumb';
import { LifecycleTag } from '@/components/coown/LifecycleTag';
import { gbp } from '@/components/coown/format';
import type { useCoOwnAssets } from '@/lib/hooks/coown-queries';

interface PickTargetAssetStepProps {
  assetsQ: ReturnType<typeof useCoOwnAssets>;
  assetId: string | null;
  onSelectAsset: (id: string) => void;
  onContinue: () => void;
}

/**
 * Step 1: Target asset selection from live Co-Own marketplace.
 */
export function PickTargetAssetStep({
  assetsQ,
  assetId,
  onSelectAsset,
  onContinue,
}: PickTargetAssetStepProps) {
  return (
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
          <div
            role="radiogroup"
            aria-label="Target asset"
            className="divide-y divide-border-subtle border-y border-border-subtle"
          >
            {assetsQ.data.map((a) => {
              const selected = a.id === assetId;
              return (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onSelectAsset(a.id)}
                  className="pressable flex w-full items-center gap-3.5 px-1 py-3 text-left transition-colors hover:bg-row"
                >
                  <AssetThumb src={a.imageUrl} alt={a.title} className="w-14" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-semibold text-text-primary">
                      {a.title}
                    </p>
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
                      selected
                        ? 'border-brand bg-brand text-text-inverse'
                        : 'border-border'
                    }`}
                  >
                    {selected ? <Icon name="check" size={12} /> : null}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-6 flex justify-end">
            <Button
              size="md"
              disabled={assetId == null}
              onClick={onContinue}
            >
              Continue
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
