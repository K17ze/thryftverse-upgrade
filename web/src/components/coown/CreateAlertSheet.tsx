'use client';

/**
 * CreateAlertSheet — port of the mobile CoOwnPriceAlertForm. Renders the
 * sheet body (the parent wraps it in <Sheet>): price context, condition
 * selector with semantic direction colours, target input, actions.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { CoOwnAsset } from '@/lib/contracts/coown';
import { gbp } from './format';
import { useCoOwnAlerts } from './alertStore';
import { useToast } from '@/components/ui/Toast';

export function CreateAlertSheet({
  asset,
  onClose,
}: {
  asset: CoOwnAsset;
  onClose: () => void;
}) {
  const [direction, setDirection] = useState<'above' | 'below'>('above');
  const [targetText, setTargetText] = useState(asset.unitPriceGbp.toFixed(2));
  const createAlert = useCoOwnAlerts((s) => s.createAlert);
  const { show } = useToast();

  const target = Number(targetText);
  const valid = Number.isFinite(target) && target > 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    createAlert({ assetId: asset.id, direction, targetPriceGbp: target });
    show(
      `Alert saved — ${direction === 'above' ? 'above' : 'below'} ${gbp(target)} on ${asset.title}`,
      'success',
    );
    onClose();
  };

  return (
    <form onSubmit={submit} className="p-5" aria-label={`Price alert for ${asset.title}`}>
      <p className="text-body text-text-secondary">
        Saved to this device — triggers when the last-trade price{' '}
        {direction === 'above' ? 'rises above' : 'drops below'} your target.
      </p>

      {/* Price context — same trio the mobile sheet shows */}
      <dl className="mt-4 space-y-1.5 rounded-lg border border-border-subtle p-3 text-meta">
        <div className="flex items-baseline justify-between">
          <dt className="text-text-muted">Denomination</dt>
          <dd className="font-medium text-text-primary">GBP</dd>
        </div>
        <div className="flex items-baseline justify-between">
          <dt className="text-text-muted">Trigger basis</dt>
          <dd className="font-medium text-text-primary">Last trade price</dd>
        </div>
        <div className="flex items-baseline justify-between">
          <dt className="text-text-muted">Current price</dt>
          <dd className="font-medium text-text-primary tnum">{gbp(asset.unitPriceGbp)}</dd>
        </div>
      </dl>

      <fieldset className="mt-5">
        <legend className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
          Condition
        </legend>
        <div className="mt-2 grid grid-cols-2 gap-2" role="group">
          {(['above', 'below'] as const).map((d) => {
            const selected = direction === d;
            const up = d === 'above';
            return (
              <button
                key={d}
                type="button"
                aria-pressed={selected}
                onClick={() => setDirection(d)}
                className={`pressable inline-flex h-11 items-center justify-center gap-1.5 rounded-md border text-body-emphasis font-semibold ${
                  selected
                    ? up
                      ? 'border-coown-up/40 bg-coown-up-subtle text-coown-up'
                      : 'border-coown-down/40 bg-coown-down-subtle text-coown-down'
                    : 'border-border-subtle text-text-secondary hover:text-text-primary'
                }`}
              >
                <Icon name={up ? 'arrowUp' : 'chevronDown'} size={16} />
                {up ? 'Above' : 'Below'}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-4">
        <label
          htmlFor="coown-alert-target"
          className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted"
        >
          Target price (£)
        </label>
        <input
          id="coown-alert-target"
          type="number"
          inputMode="decimal"
          min={0}
          step={0.5}
          value={targetText}
          onChange={(e) => setTargetText(e.target.value)}
          placeholder="e.g. 145.00"
          className="mt-2 h-11 w-full rounded-lg bg-input px-3 text-body-emphasis text-input-text tnum outline-none focus:ring-2 focus:ring-text-primary"
        />
      </div>

      <div className="mt-6 flex gap-2">
        <Button type="button" variant="secondary" fullWidth onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" fullWidth disabled={!valid}>
          Create alert
        </Button>
      </div>
    </form>
  );
}
