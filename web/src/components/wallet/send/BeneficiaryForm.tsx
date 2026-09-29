'use client';

/**
 * BeneficiaryForm — the account-type-aware "New recipient" form (mounted
 * inside a Sheet by BeneficiariesSection).
 *
 * The server is the field validator: it runs IBAN MOD-97, BIC, IFSC,
 * ABA 3-7-1 and sort-code checks, and answers BENEFICIARY_INVALID with
 * details.errors. Those strings are surfaced verbatim — attached under
 * their field when the error names one, plus the full list in the alert
 * block. Client-side checks are only presence/required gating.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { ApiRequestError, isRecord, parseApiError } from '@/lib/api/http';
import {
  createBeneficiary,
  type BeneficiaryAccountType,
} from '@/lib/api/services/fx';
import { SUPPORTED_CURRENCY_CODES } from '@/lib/constants/currencies';
import { walletKeys } from '../walletKeys';
import {
  ACCOUNT_TYPE_OPTIONS,
  BENEFICIARY_FIELD_SPECS,
  DESTINATION_COUNTRIES,
  suggestAccountType,
} from './sendModel';

const inputClass =
  'h-11 w-full rounded-md border border-border bg-input px-3 text-body text-input-text placeholder:text-text-muted focus:border-brand focus:outline-none';

/** Server BENEFICIARY_INVALID strings look like 'iban: checksum failed'
 *  or 'sortCode is required' — attach to a field when the leading token
 *  names one; everything still renders verbatim in the error list. */
function fieldNameOfError(message: string): string | null {
  const colon = message.match(/^([A-Za-z]+):\s/);
  if (colon) return colon[1];
  const leading = message.match(/^([A-Za-z]+)\s+(?:is|must|failed)/);
  return leading ? leading[1] : null;
}

function extractErrors(error: unknown): {
  message: string;
  serverErrors: string[];
  fieldErrors: Record<string, string[]>;
} {
  const parsed = parseApiError(error, 'Couldn’t save this recipient.');
  const serverErrors: string[] = [];
  if (
    error instanceof ApiRequestError &&
    isRecord(error.details) &&
    isRecord(error.details.details) &&
    Array.isArray(error.details.details.errors)
  ) {
    for (const entry of error.details.details.errors) {
      if (typeof entry === 'string') serverErrors.push(entry);
    }
  }
  const fieldErrors: Record<string, string[]> = {};
  for (const entry of serverErrors) {
    const field = fieldNameOfError(entry);
    if (field) (fieldErrors[field] ??= []).push(entry);
  }
  return { message: parsed.message, serverErrors, fieldErrors };
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-caption font-medium text-text-secondary">{label}</span>
      <div className="mt-1.5">{children}</div>
      {error ? <span className="mt-1 block text-meta text-danger-text">{error}</span> : null}
    </label>
  );
}

export function BeneficiaryForm({
  userId,
  onCreated,
}: {
  userId: string;
  onCreated: (beneficiaryId: string) => void;
}) {
  const queryClient = useQueryClient();
  const { show } = useToast();

  const [displayName, setDisplayName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [countryCode, setCountryCode] = useState('GB');
  const [currency, setCurrency] = useState('GBP');
  const [accountType, setAccountType] = useState<BeneficiaryAccountType>('sort_code');
  const [accountTypeTouched, setAccountTypeTouched] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const specs = BENEFICIARY_FIELD_SPECS[accountType];

  const handleCountryChange = (code: string) => {
    setCountryCode(code);
    // Country → rail suggestion is a pre-fill hint, not a verdict — the
    // user can still override, and the server validates the real pairing.
    if (!accountTypeTouched) setAccountType(suggestAccountType(code));
  };

  const handleAccountTypeChange = (value: BeneficiaryAccountType) => {
    setAccountType(value);
    setAccountTypeTouched(true);
    setFieldValues({}); // rail-specific keys don't carry across types
    setFieldErrors({});
    setServerErrors([]);
  };

  const canSubmit =
    displayName.trim().length > 0 &&
    specs.every((spec) => !spec.required || (fieldValues[spec.name] ?? '').trim().length > 0) &&
    !submitting;

  const handleCreate = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setFormError('');
    setServerErrors([]);
    setFieldErrors({});

    // Normalise the way the server does (uppercase / strip separators)
    // and drop empty optionals so the persisted `fields` map is clean.
    const fields: Record<string, unknown> = {};
    for (const spec of specs) {
      const raw = (fieldValues[spec.name] ?? '').trim();
      if (!raw) continue;
      fields[spec.name] =
        spec.normalize === 'upper'
          ? raw.replace(/\s+/g, '').toUpperCase()
          : spec.normalize === 'digits'
            ? raw.replace(/[\s-]+/g, '')
            : raw;
    }

    try {
      const { beneficiary } = await createBeneficiary(userId, {
        displayName: displayName.trim(),
        legalName: legalName.trim() || undefined,
        countryCode,
        currency,
        accountType,
        fields,
      });
      void queryClient.invalidateQueries({ queryKey: walletKeys.beneficiaries(userId) });
      onCreated(beneficiary.id);
      show(`Recipient ${beneficiary.displayName} saved`, 'success');
    } catch (error) {
      const parsed = extractErrors(error);
      setFormError(parsed.message);
      setServerErrors(parsed.serverErrors);
      setFieldErrors(parsed.fieldErrors);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 px-5 pb-6 pt-2">
      <Field label="Recipient name" error={fieldErrors.displayName?.[0]}>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value.slice(0, 80))}
          maxLength={80}
          placeholder="e.g. Ada Lovelace"
          className={inputClass}
        />
      </Field>
      <Field label="Legal name (optional)" error={fieldErrors.legalName?.[0]}>
        <input
          value={legalName}
          onChange={(e) => setLegalName(e.target.value.slice(0, 160))}
          maxLength={160}
          placeholder="As it appears on their bank account"
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Destination country" error={fieldErrors.countryCode?.[0]}>
          <select
            value={countryCode}
            onChange={(e) => handleCountryChange(e.target.value)}
            className={inputClass}
          >
            {DESTINATION_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="They receive" error={fieldErrors.currency?.[0]}>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className={inputClass}
          >
            {SUPPORTED_CURRENCY_CODES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Account type" error={fieldErrors.accountType?.[0]}>
        <select
          value={accountType}
          onChange={(e) => handleAccountTypeChange(e.target.value as BeneficiaryAccountType)}
          className={inputClass}
        >
          {ACCOUNT_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-meta text-text-muted">
          {ACCOUNT_TYPE_OPTIONS.find((o) => o.value === accountType)?.description}
        </span>
      </Field>

      {specs.map((spec) => (
        <Field
          key={spec.name}
          label={`${spec.label}${spec.required ? '' : ' (optional)'}`}
          error={fieldErrors[spec.name]?.[0]}
        >
          <input
            value={fieldValues[spec.name] ?? ''}
            onChange={(e) =>
              setFieldValues((prev) => ({ ...prev, [spec.name]: e.target.value }))
            }
            inputMode={spec.inputMode}
            placeholder={spec.placeholder}
            autoCapitalize={spec.normalize === 'upper' ? 'characters' : undefined}
            className={inputClass}
          />
        </Field>
      ))}

      {formError ? (
        <div
          role="alert"
          className="rounded-md border border-danger-border bg-danger-subtle px-4 py-3"
        >
          <p className="text-caption text-danger-text">{formError}</p>
          {serverErrors.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-meta text-danger-text">
              {serverErrors.map((entry, i) => (
                <li key={i}>{entry}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <Button
        variant="primary"
        size="lg"
        fullWidth
        onClick={() => void handleCreate()}
        disabled={!canSubmit}
      >
        {submitting ? 'Saving…' : 'Save recipient'}
      </Button>
    </div>
  );
}
