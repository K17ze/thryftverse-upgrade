'use client';

/**
 * Dac7Section — the tax-information surface on /verification. Port of the
 * mobile Dac7Section: a status row that expands into the details form —
 * TIN, country of tax residence, self-declaration — then Save.
 *
 * Live mode posts to /compliance/dac7/:userId (the same endpoint mobile
 * uses). Fixture mode persists the record in the local verification store
 * and says so — no fabricated "reported to authorities" claim.
 */

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import {
  EU_COUNTRIES,
  TAX_RESIDENCE_COUNTRIES,
  type Dac7Status,
} from '@/lib/contracts/verification';
import {
  useDac7TaxInfo,
  useSaveDac7TaxInfo,
} from '@/lib/hooks/verification-queries';
import { VerificationNote } from './VerificationNote';

/** Row subtitle — mirrors mobile resolveDac7RowSubtitle. */
function dac7RowSubtitle(completed: boolean, country: string | null | undefined): string {
  return completed
    ? `Tax information provided · ${country}`
    : 'Required for EU sellers under DAC7 regulation';
}

const DAC7_STATUS_BADGE: Record<Dac7Status, { variant: 'success' | 'brand' | 'danger' | 'neutral'; label: string }> = {
  declared: { variant: 'brand', label: 'Declared' },
  verified: { variant: 'success', label: 'Verified' },
  rejected: { variant: 'danger', label: 'Rejected' },
  expired: { variant: 'neutral', label: 'Expired' },
};

export function Dac7Section() {
  const toast = useToast();
  const { info, isLoading } = useDac7TaxInfo();
  const save = useSaveDac7TaxInfo();

  const [open, setOpen] = useState(false);
  const [tin, setTin] = useState('');
  const [country, setCountry] = useState('GB');
  const [selfDeclared, setSelfDeclared] = useState(false);

  const completed = info != null;
  const badge = info ? DAC7_STATUS_BADGE[info.status] : null;

  const openForm = () => {
    // Re-opening prefills the saved record — the edit path, not a blank form.
    if (info) {
      setTin(info.tin);
      setCountry(info.taxResidenceCountry);
      setSelfDeclared(info.selfDeclared);
    }
    setOpen((v) => !v);
  };

  const cancel = () => setOpen(false);

  const submit = () => {
    if (!tin.trim()) {
      toast.show('Enter your tax identification number', 'error');
      return;
    }
    if (!selfDeclared) {
      toast.show('Confirm the self-declaration checkbox', 'error');
      return;
    }
    save.mutate(
      {
        tin: tin.trim(),
        taxResidenceCountry: country,
        isEuResident: EU_COUNTRIES.includes(country),
        selfDeclared: true,
      },
      {
        onSuccess: () => {
          toast.show('Tax information saved', 'success');
          setOpen(false);
        },
        onError: (err) => toast.show(parseApiError(err).message, 'error'),
      },
    );
  };

  return (
    <section aria-label="Tax information (DAC7)" className="mt-10">
      <h2 className="text-label text-text-secondary">Tax information (DAC7)</h2>

      <div className="mt-2 border-y border-border-subtle">
        <button
          type="button"
          onClick={openForm}
          aria-expanded={open}
          className="pressable flex min-h-[64px] w-full items-center gap-3.5 py-3 text-left"
        >
          <Icon
            name="document"
            size={20}
            className={`shrink-0 ${completed ? 'text-text-primary' : 'text-text-muted'}`}
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="text-body-emphasis font-medium text-text-primary">
                DAC7 tax details
              </span>
              {badge ? (
                <Badge variant={badge.variant}>{badge.label}</Badge>
              ) : null}
            </span>
            <span className="mt-0.5 block text-caption text-text-muted">
              {isLoading ? 'Loading…' : dac7RowSubtitle(completed, info?.taxResidenceCountry)}
            </span>
          </span>
          <Icon
            name={open ? 'chevronUp' : 'chevronDown'}
            size={18}
            className="shrink-0 text-text-muted"
          />
        </button>
      </div>

      {open ? (
        <div className="mt-4 rounded-lg border border-border-subtle bg-surface p-4">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-section-title font-semibold text-text-primary">Tax details</p>
            <button
              type="button"
              onClick={cancel}
              aria-label="Cancel"
              className="pressable flex h-11 items-center rounded-md px-3 text-text-muted hover:text-text-secondary"
            >
              <Icon name="close" size={20} />
            </button>
          </div>

          <VerificationNote icon="info">
            Under the EU DAC7 directive, digital platforms must report seller tax
            information. This data is shared with EU tax authorities.
            {DATA_MODE !== 'live' ? ' In this preview it is stored locally in your browser.' : ''}
          </VerificationNote>

          {info?.status === 'rejected' && info.rejectedReason ? (
            <div className="mt-3">
              <VerificationNote icon="warning">{info.rejectedReason}</VerificationNote>
            </div>
          ) : null}

          <label
            htmlFor="dac7-tin"
            className="mb-1.5 mt-4 block text-caption font-semibold text-text-secondary"
          >
            Tax identification number (TIN)
          </label>
          <input
            id="dac7-tin"
            type="text"
            value={tin}
            onChange={(e) => setTin(e.target.value)}
            placeholder="Your TIN / National Insurance number"
            autoCapitalize="characters"
            autoComplete="off"
            className="h-11 w-full rounded-md border border-border bg-surface-alt px-3 text-body text-input-text placeholder:text-text-muted focus:border-text-muted focus:outline-none"
          />

          <p className="mb-1.5 mt-4 text-caption font-semibold text-text-secondary">
            Country of tax residence
          </p>
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Country of tax residence">
            {TAX_RESIDENCE_COUNTRIES.map((code) => (
              <Chip
                key={code}
                selected={country === code}
                onClick={() => setCountry(code)}
                aria-label={`Select ${code}`}
              >
                {code}
              </Chip>
            ))}
          </div>

          <button
            type="button"
            role="checkbox"
            aria-checked={selfDeclared}
            onClick={() => setSelfDeclared((v) => !v)}
            className="pressable mt-4 flex min-h-11 w-full items-center gap-3 rounded-md py-2 text-left"
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border ${
                selfDeclared ? 'border-brand bg-brand' : 'border-border'
              }`}
              aria-hidden
            >
              {selfDeclared ? (
                <Icon name="check" size={14} className="text-text-inverse" />
              ) : null}
            </span>
            <span className="flex-1 text-body text-text-secondary">
              I confirm this tax information is accurate and complete
            </span>
          </button>

          <div className="mt-4 flex items-center gap-2.5">
            <Button variant="secondary" size="md" onClick={cancel} className="flex-1">
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={submit}
              disabled={save.isPending}
              className="flex-1"
              aria-label="Save tax information"
            >
              {save.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
