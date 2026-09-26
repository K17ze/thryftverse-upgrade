'use client';

/**
 * ConsentStep — informed consent, ported from the mobile screen. Flat
 * hairline lists state what the import does and never does; three
 * attestation checkboxes gate the single primary action.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { ImportSource } from './core';

interface ConsentStepProps {
  source: ImportSource;
  fileName: string | null;
  onContinue: () => void;
}

const DOES_ROWS = [
  'Creates one private draft per row',
  'You review and edit every row first',
];

const NEVER_ROWS = [
  'Publishes listings on its own',
  'Accesses anything beyond the file you chose',
  'Touches payouts, orders or buyer messages',
];

const ATTESTATIONS = [
  'I own or have permission to reuse the listing text',
  'The imported facts — condition, price, quantity — are accurate',
  'The file contains no buyer or customer personal data',
] as const;

export function ConsentStep({ source, fileName, onContinue }: ConsentStepProps) {
  const [attestations, setAttestations] = useState<boolean[]>([false, false, false]);
  const allAttested = attestations.every(Boolean);

  const origin =
    source === 'csv' && fileName ? ` from ${fileName}` : ' from your pasted listings';

  return (
    <div>
      <h1 className="text-screen-title font-bold text-text-primary">Send your catalogue</h1>
      <p className="mt-2 max-w-md text-body text-text-secondary">
        We&apos;ll prepare private drafts{origin}. Nothing goes live until you approve it.
      </p>

      {/* ── What the import does — flat hairline list ── */}
      <section className="mt-8" aria-label="What the import does">
        <h2 className="text-body-emphasis font-semibold text-text-primary">
          What the import does
        </h2>
        <ul className="mt-1 divide-y divide-border-subtle border-b border-border-subtle">
          {DOES_ROWS.map((row) => (
            <li key={row} className="py-3 text-body text-text-primary">
              {row}
            </li>
          ))}
        </ul>
      </section>

      {/* ── What it never does ── */}
      <section className="mt-6" aria-label="What the import never does">
        <h2 className="text-body-emphasis font-semibold text-text-primary">
          What it never does
        </h2>
        <ul className="mt-1 divide-y divide-border-subtle border-b border-border-subtle">
          {NEVER_ROWS.map((row) => (
            <li key={row} className="py-3 text-body text-text-muted">
              {row}
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-4 text-body font-medium text-text-primary">
        Discard the import at any time — nothing is kept.
      </p>

      {/* ── Attestations — checkbox-gated continue ── */}
      <div className="mt-8 flex flex-col gap-1" role="group" aria-label="Confirm before importing">
        {ATTESTATIONS.map((label, i) => {
          const checked = attestations[i];
          return (
            <button
              key={label}
              type="button"
              role="checkbox"
              aria-checked={checked}
              onClick={() =>
                setAttestations((prev) => prev.map((v, idx) => (idx === i ? !v : v)))
              }
              className="pressable flex min-h-11 items-center gap-3 py-2 text-left"
            >
              <span
                aria-hidden
                className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border ${
                  checked ? 'border-brand bg-brand text-text-inverse' : 'border-border text-transparent'
                }`}
              >
                <Icon name="check" size={16} />
              </span>
              <span className="flex-1 text-body text-text-primary">{label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 border-t border-border-subtle pt-5">
        <Button size="lg" fullWidth disabled={!allAttested} onClick={onContinue}>
          Review your listings
        </Button>
      </div>
    </div>
  );
}
