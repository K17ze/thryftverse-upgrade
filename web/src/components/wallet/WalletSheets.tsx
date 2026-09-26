'use client';

/**
 * Top-up sheet — quiet single-purpose flow over the fixture wallet.
 * Withdrawals moved to /wallet/withdraw (amount composer, payout-method
 * picker, review + receipt) — the old fake-confirm sheet is retired.
 */

import { useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { PAYMENT_METHODS } from '@/lib/data/fixtures';
import { formatPrice } from '@/lib/utils/format';

const bank = PAYMENT_METHODS.find((p) => p.isDefault) ?? PAYMENT_METHODS[0];

interface TopUpSheetProps {
  open: boolean;
  onClose: () => void;
  currency: string;
}

const TOP_UP_AMOUNTS = [20, 50, 100, 200];

export function TopUpSheet({ open, onClose, currency }: TopUpSheetProps) {
  const { show } = useToast();
  const [amount, setAmount] = useState<number>(50);
  const [busy, setBusy] = useState(false);

  const confirm = () => {
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      onClose();
      show(`${formatPrice(amount, currency)} added to your balance`, 'success');
    }, 500);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Top up" maxWidth={440}>
      <div className="px-5 py-5">
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Top-up amount">
          {TOP_UP_AMOUNTS.map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={amount === a}
              onClick={() => setAmount(a)}
              className={`pressable tnum h-12 rounded-md text-body-emphasis font-semibold ${
                amount === a
                  ? 'bg-brand text-text-inverse'
                  : 'bg-surface-alt text-text-primary hover:bg-surface-raised'
              }`}
            >
              {formatPrice(a, currency)}
            </button>
          ))}
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-lg border border-border px-4 py-3.5">
          <Icon name="card" size={20} className="text-text-secondary" />
          <div className="flex-1">
            <p className="text-body-emphasis font-medium text-text-primary">
              {bank?.brand === 'visa' ? 'Visa' : 'Card'} •••• {bank?.last4 ?? '4521'}
            </p>
            <p className="text-caption text-text-muted">Charged to your default card</p>
          </div>
        </div>

        <Button
          variant="primary"
          size="lg"
          fullWidth
          className="mt-6"
          onClick={confirm}
          disabled={busy}
        >
          {busy ? 'Adding…' : `Add ${formatPrice(amount, currency)}`}
        </Button>
      </div>
    </Sheet>
  );
}
