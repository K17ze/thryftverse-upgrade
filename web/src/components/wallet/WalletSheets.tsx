'use client';

/**
 * Top-up sheet — fixture-mode demo only. There is no top-up endpoint in
 * this build, so the sheet is never mounted in live mode (WalletView gates
 * it) and it guards itself the same way. Confirming writes an honest
 * `topup` entry labelled as a demo into the wallet session ledger and
 * credits the available balance — no card is charged, no receipt is
 * minted, and the copy says so.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { DATA_MODE } from '@/lib/api/client';
import { useSession } from '@/lib/session/SessionProvider';
import { formatPrice } from '@/lib/utils/format';
import type { WalletLedgerEntry } from './ledgerViewModel';
import type { WalletData } from './useWalletData';
import { walletKeys } from './walletKeys';
import { round2 } from './convertViewModel';

interface TopUpSheetProps {
  open: boolean;
  onClose: () => void;
  currency: string;
}

const TOP_UP_AMOUNTS = [20, 50, 100, 200];

export function TopUpSheet({ open, onClose, currency }: TopUpSheetProps) {
  const { show } = useToast();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const [amount, setAmount] = useState<number>(50);
  const [busy, setBusy] = useState(false);

  // No top-up endpoint exists — the sheet is a fixture-mode demo surface.
  if (DATA_MODE === 'live') return null;

  const confirm = () => {
    setBusy(true);
    setTimeout(() => {
      const entry: WalletLedgerEntry = {
        id: `tu-${Date.now().toString(36)}`,
        kind: 'topup',
        amount: round2(amount),
        status: 'completed',
        date: new Date().toISOString(),
        description: 'Top-up — demo',
        balance: null,
      };
      queryClient.setQueryData<WalletData>(walletKeys.all(user?.id), (old) =>
        old
          ? {
              ...old,
              available: round2(old.available + amount),
              session: [entry, ...old.session],
            }
          : old,
      );
      setBusy(false);
      onClose();
      show(`${formatPrice(amount, currency)} added to your demo balance`, 'success');
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

        <p className="mt-5 flex items-start gap-1.5 text-caption text-text-muted">
          <Icon name="info" size={14} className="mt-0.5 shrink-0" />
          Demo balance — no money moves. Top-ups need a payment connection this
          build doesn&apos;t have.
        </p>

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
