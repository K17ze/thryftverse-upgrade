'use client';

/**
 * Add bank account sheet — UK payout destination form. Sort code is
 * auto-formatted `XX-XX-XX` (6 digits), the account number is 8 digits and
 * only its last four are ever persisted. Validation mirrors the mobile
 * AddBankAccount copy: holder name, `00-00-00` sort code, `8 digits`.
 */

import { useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import {
  accountNumberDigits,
  formatSortCode,
  isDuplicateAccount,
  isValidAccountNumber,
  isValidSortCode,
} from './withdrawViewModel';
import type { NewPayoutAccountInput } from './usePayoutAccounts';
import type { PayoutAccount } from '@/lib/data/fixtures';

interface AddBankAccountSheetProps {
  open: boolean;
  onClose: () => void;
  /** Existing accounts — duplicate sort code + last4 detection. */
  accounts: PayoutAccount[];
  /** Called with the validated input; parent owns the store write. */
  onSave: (input: NewPayoutAccountInput) => void;
}

interface FieldErrors {
  holderName?: string;
  sortCode?: string;
  accountNumber?: string;
}

const inputClass =
  'tnum h-12 w-full rounded-lg border border-border bg-input px-4 text-body text-input-text placeholder:text-text-muted focus:outline-none focus:border-text-muted';

const labelClass = 'text-label font-semibold uppercase tracking-wider text-text-muted';

export function AddBankAccountSheet({ open, onClose, accounts, onSave }: AddBankAccountSheetProps) {
  const [holderName, setHolderName] = useState('');
  const [bankName, setBankName] = useState('');
  const [sortCode, setSortCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const reset = () => {
    setHolderName('');
    setBankName('');
    setSortCode('');
    setAccountNumber('');
    setErrors({});
  };

  const save = () => {
    const next: FieldErrors = {};
    if (!holderName.trim()) next.holderName = 'Enter the name on the account.';
    if (!isValidSortCode(sortCode)) next.sortCode = 'Enter the 6-digit sort code.';
    if (!isValidAccountNumber(accountNumber)) next.accountNumber = 'Enter your 8-digit account number.';
    if (!next.sortCode && !next.accountNumber && isDuplicateAccount(accounts, sortCode, accountNumber)) {
      next.accountNumber = 'This account is already saved.';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    onSave({ holderName, bankName, sortCode, accountNumber });
    reset();
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Add bank account" maxWidth={440}>
      <div className="px-5 py-5">
        <p className="text-caption text-text-secondary">
          For withdrawals. Transfers typically take 1–3 business days.
        </p>

        <div className="mt-5 flex flex-col gap-4">
          <div>
            <label htmlFor="payout-holder" className={labelClass}>
              Account holder name
            </label>
            <input
              id="payout-holder"
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
              placeholder="Full name on account"
              autoComplete="name"
              className={`${inputClass} mt-2`}
              aria-invalid={!!errors.holderName}
            />
            {errors.holderName ? (
              <p className="mt-1.5 text-caption text-danger-text">{errors.holderName}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="payout-bank" className={labelClass}>
              Bank name <span className="normal-case text-text-muted">(optional)</span>
            </label>
            <input
              id="payout-bank"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="e.g. Barclays"
              className={`${inputClass} mt-2`}
            />
          </div>

          <div>
            <label htmlFor="payout-sort" className={labelClass}>
              Sort code
            </label>
            <input
              id="payout-sort"
              value={sortCode}
              onChange={(e) => setSortCode(formatSortCode(e.target.value))}
              placeholder="00-00-00"
              inputMode="numeric"
              autoComplete="off"
              className={`${inputClass} mt-2`}
              aria-invalid={!!errors.sortCode}
            />
            {errors.sortCode ? (
              <p className="mt-1.5 text-caption text-danger-text">{errors.sortCode}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="payout-account" className={labelClass}>
              Account number
            </label>
            <input
              id="payout-account"
              value={accountNumber}
              onChange={(e) => setAccountNumber(accountNumberDigits(e.target.value))}
              placeholder="8 digits"
              inputMode="numeric"
              autoComplete="off"
              className={`${inputClass} mt-2`}
              aria-invalid={!!errors.accountNumber}
            />
            {errors.accountNumber ? (
              <p className="mt-1.5 text-caption text-danger-text">{errors.accountNumber}</p>
            ) : null}
          </div>
        </div>

        <Button variant="primary" size="lg" fullWidth className="mt-6" onClick={save}>
          Save bank account
        </Button>

        <p className="mt-4 flex items-start gap-1.5 text-caption text-text-muted">
          <Icon name="lock" size={14} className="mt-0.5 shrink-0" />
          Only the last 4 digits are saved — your full account number is never stored.
        </p>
      </div>
    </Sheet>
  );
}
