'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { DATA_MODE } from '@/lib/api/client';

interface BagPromoCodeInputProps {
  onApplyPromo?: (code: string, discountPct: number) => void;
  appliedPromo?: { code: string; discountPct: number } | null;
  onRemovePromo?: () => void;
}

export function BagPromoCodeInput({
  onApplyPromo,
  appliedPromo,
  onRemovePromo,
}: BagPromoCodeInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  // The codes below are fixture-demo only — POST /orders carries no promo
  // field, so a live-mode "discount" would die on checkout navigation and
  // the buyer would pay full price. Live renders nothing at all.
  if (DATA_MODE === 'live') return null;

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (!clean) return;

    if (clean === 'WELCOME10' || clean === 'THRYFT10') {
      setError(null);
      onApplyPromo?.(clean, 0.1);
      setCode('');
    } else if (clean === 'VINTAGE15') {
      setError(null);
      onApplyPromo?.(clean, 0.15);
      setCode('');
    } else {
      setError('Promo code not valid or expired');
    }
  };

  if (appliedPromo) {
    return (
      <div className="flex items-center justify-between rounded-md border border-success-border bg-success-subtle px-3 py-2 text-caption">
        <div className="flex items-center gap-2">
          <Icon name="pricetag" size={14} className="text-success-text" />
          <span className="font-semibold text-success-text">
            {appliedPromo.code} ({Math.round(appliedPromo.discountPct * 100)}% off)
          </span>
        </div>
        <button
          type="button"
          onClick={onRemovePromo}
          className="pressable text-caption font-medium text-text-muted hover:text-danger-text"
          aria-label="Remove promo code"
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-border-subtle pt-3">
      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="pressable flex w-full items-center justify-between text-caption font-medium text-text-secondary hover:text-text-primary"
        >
          <span className="flex items-center gap-1.5">
            <Icon name="pricetag" size={14} className="text-text-muted" />
            Have a voucher or promo code?
          </span>
          <Icon name="plus" size={14} className="text-text-muted" />
        </button>
      ) : (
        <form onSubmit={handleApply} className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. WELCOME10"
              className="min-w-0 flex-1 rounded-md border border-border-subtle bg-surface-alt px-3 py-1.5 text-caption uppercase text-text-primary placeholder:normal-case placeholder:text-text-muted focus:border-brand focus:outline-none"
              autoFocus
            />
            <button
              type="submit"
              disabled={!code.trim()}
              className="pressable rounded-md bg-brand px-3 py-1.5 text-caption font-semibold text-text-inverse hover:bg-brand-pressed disabled:opacity-50"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setError(null);
              }}
              className="pressable rounded-md px-2 py-1.5 text-caption text-text-muted hover:text-text-primary"
            >
              Cancel
            </button>
          </div>
          {error ? (
            <p className="text-caption text-danger-text" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </div>
  );
}
