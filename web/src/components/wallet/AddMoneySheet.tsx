'use client';

/**
 * AddMoneySheet — high-conversion multi-rail wallet deposit flow.
 * Supports custom amounts, quick preset chips, payment rail selection
 * (Open Banking / FPS, Debit Card, Apple Pay, 1ZE Transfer),
 * fee transparency, and instant settlement into the wallet ledger.
 *
 * Fixture-mode demo only. There is no top-up endpoint in this build, so
 * the sheet self-guards against live mode (WalletView also gates the
 * mount behind TOP_UP_AVAILABLE), rails/fees are illustrative, and the
 * confirmation writes a demo-labelled session entry — the copy says so.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { DATA_MODE } from '@/lib/api/client';
import { useSession } from '@/lib/session/SessionProvider';
import { formatPrice } from '@/lib/utils/format';
import type { WalletLedgerEntry } from './ledgerViewModel';
import type { WalletData } from './useWalletData';
import { walletKeys } from './walletKeys';
import { round2 } from './convertViewModel';

interface AddMoneySheetProps {
  open: boolean;
  onClose: () => void;
  currency: string;
}

type DepositMethod = 'bank_transfer' | 'card' | 'apple_pay' | 'ize_transfer';

const DEPOSIT_METHODS: {
  id: DepositMethod;
  name: string;
  subtitle: string;
  icon: AppIconName;
  feeText: string;
  speed: string;
  recommended?: boolean;
}[] = [
  {
    id: 'bank_transfer',
    name: 'Instant Bank Transfer (Open Banking)',
    subtitle: 'Direct from Barclays, Monzo, HSBC, Revolut',
    icon: 'store',
    feeText: 'Free',
    speed: 'Instant',
    recommended: true,
  },
  {
    id: 'card',
    name: 'Debit or Credit Card',
    // No saved card exists in the demo — describe the rail, not a fake PAN.
    subtitle: 'Visa or Mastercard',
    icon: 'card',
    feeText: '1.5% fee',
    speed: 'Instant',
  },
  {
    id: 'apple_pay',
    name: 'Apple Pay / Digital Wallet',
    subtitle: 'Touch ID or Face ID checkout',
    icon: 'phone',
    feeText: 'Free',
    speed: 'Instant',
  },
  {
    id: 'ize_transfer',
    name: '1ZE Token Credit Transfer',
    subtitle: 'Deposit via Co-Own settlement protocol',
    icon: 'sort',
    feeText: 'Free',
    speed: 'Instant',
  },
];

const PRESETS = [20, 50, 100, 250];

export function AddMoneySheet({ open, onClose, currency }: AddMoneySheetProps) {
  const { show } = useToast();
  const queryClient = useQueryClient();
  const { user } = useSession();

  const [amountStr, setAmountStr] = useState('50');
  const [method, setMethod] = useState<DepositMethod>('bank_transfer');
  const [step, setStep] = useState<'input' | 'processing' | 'success'>('input');

  // No top-up endpoint exists — this sheet is a fixture-mode demo surface
  // and must never mount against the live wallet (same guard as
  // WalletSheets.TopUpSheet).
  if (DATA_MODE === 'live') return null;

  const numericAmount = Number(amountStr) || 0;
  const selectedMethod = DEPOSIT_METHODS.find((m) => m.id === method)!;
  const feeAmount = method === 'card' ? round2(numericAmount * 0.015) : 0;
  const totalCharge = round2(numericAmount + feeAmount);

  const resetAndClose = () => {
    setStep('input');
    onClose();
  };

  const handleDeposit = () => {
    if (numericAmount <= 0) return;
    setStep('processing');

    setTimeout(() => {
      const entry: WalletLedgerEntry = {
        id: `tu-${Date.now().toString(36)}`,
        kind: 'topup',
        amount: round2(numericAmount),
        status: 'completed',
        date: new Date().toISOString(),
        // Demo-labelled in the ledger too — the row must never read as a
        // real deposit receipt.
        description: `Top-up — demo (${selectedMethod.name})`,
        balance: null,
      };

      queryClient.setQueryData<WalletData>(walletKeys.all(user?.id), (old) =>
        old
          ? {
              ...old,
              available: round2(old.available + numericAmount),
              session: [entry, ...old.session],
            }
          : old,
      );

      setStep('success');
      show(`${formatPrice(numericAmount, currency)} added to your demo balance`, 'success');
    }, 700);
  };

  return (
    <Sheet open={open} onClose={resetAndClose} title="Add Money to Wallet" maxWidth={500}>
      <div className="px-5 py-5">
        {step === 'input' && (
          <div>
            {/* Amount input */}
            <div>
              <label htmlFor="deposit-amount" className="text-label text-text-muted">
                Deposit amount
              </label>
              <div className="relative mt-2 flex items-center">
                <span className="pointer-events-none absolute left-4 text-display-small font-semibold text-text-secondary">
                  £
                </span>
                <input
                  id="deposit-amount"
                  type="number"
                  min="5"
                  max="10000"
                  step="any"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  className="tnum h-16 w-full rounded-md border border-border bg-input pl-10 pr-4 text-display-small font-bold text-text-primary focus:border-brand focus:outline-none"
                  placeholder="0.00"
                />
              </div>

              {/* Preset chips */}
              <div className="mt-3 grid grid-cols-4 gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setAmountStr(String(p))}
                    className={`pressable tnum h-10 rounded-md text-caption font-semibold transition-colors ${
                      numericAmount === p
                        ? 'bg-brand text-text-inverse'
                        : 'border border-border bg-surface-alt text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    +{formatPrice(p, currency)}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment method selection */}
            <div className="mt-6">
              <label className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
                Funding method
              </label>
              <div className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
                {DEPOSIT_METHODS.map((m) => {
                  const selected = method === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMethod(m.id)}
                      className={`pressable flex w-full items-center justify-between gap-3 py-3 text-left transition-colors ${
                        selected ? 'bg-surface-alt/40' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-surface-raised">
                          <Icon name={m.icon} size={18} className="text-text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-body font-medium text-text-primary">
                              {m.name}
                            </span>
                            {m.recommended ? (
                              <Badge variant="neutral" className="py-0 text-[10px]">
                                Instant &amp; Free
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-meta text-text-muted">{m.subtitle}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="tnum text-caption font-medium text-text-secondary">
                          {m.feeText}
                        </span>
                        <div
                          className={`mt-1 h-4 w-4 rounded-full border ${
                            selected
                              ? 'border-brand bg-brand'
                              : 'border-border'
                          } ml-auto flex items-center justify-center`}
                        >
                          {selected ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-text-inverse" />
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Cost breakdown */}
            <div className="mt-5 border-t border-border-subtle pt-4">
              <div className="flex justify-between text-caption text-text-secondary">
                <span>Deposit credit</span>
                <span className="tnum text-text-primary">
                  {formatPrice(numericAmount, currency)}
                </span>
              </div>
              {feeAmount > 0 ? (
                <div className="mt-1 flex justify-between text-caption text-text-secondary">
                  <span>Payment processing fee (1.5%)</span>
                  <span className="tnum text-text-primary">
                    {formatPrice(feeAmount, currency)}
                  </span>
                </div>
              ) : null}
              <div className="mt-2 flex justify-between border-t border-border-subtle pt-2 text-body font-semibold text-text-primary">
                <span>Total charged</span>
                <span className="tnum font-bold">
                  {formatPrice(totalCharge, currency)}
                </span>
              </div>
            </div>

            {/* Demo disclosure — the same honesty bar WalletSheets sets:
                no payment rail exists, so nothing here can be mistaken for
                a real deposit. */}
            <p className="mt-4 flex items-start gap-1.5 text-caption text-text-muted">
              <Icon name="info" size={14} className="mt-0.5 shrink-0" />
              Demo balance — no money moves. Top-ups need a payment connection this
              build doesn&apos;t have; rails and fees shown are illustrative.
            </p>

            <Button
              variant="primary"
              size="lg"
              fullWidth
              className="mt-6"
              onClick={handleDeposit}
              disabled={numericAmount <= 0}
            >
              Add {formatPrice(totalCharge, currency)}
            </Button>
          </div>
        )}

        {step === 'processing' && (
          <div className="py-12 text-center">
            <div className="mx-auto flex h-14 w-14 animate-spin items-center justify-center rounded-full border-2 border-brand border-t-transparent" />
            <h3 className="mt-6 text-section-title font-semibold text-text-primary">
              Simulating {selectedMethod.name}…
            </h3>
            <p className="mt-2 text-body text-text-secondary">
              Preview deposit of {formatPrice(totalCharge, currency)} — no payment is
              collected and no funds move.
            </p>
          </div>
        )}

        {step === 'success' && (
          <div className="py-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-subtle text-success-text">
              <Icon name="check" size={28} />
            </div>
            <h3 className="mt-4 text-section-title font-semibold text-text-primary">
              Demo deposit recorded
            </h3>
            <p className="mt-2 text-display-small font-bold text-text-primary tnum">
              +{formatPrice(numericAmount, currency)}
            </p>
            <p className="mt-2 text-body text-text-secondary">
              No money moved — the credit exists only in this preview wallet.
            </p>
            <div className="mt-6 border-t border-border-subtle pt-4">
              <Button variant="primary" size="lg" fullWidth onClick={resetAndClose}>
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
