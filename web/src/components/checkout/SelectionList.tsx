'use client';

/**
 * Checkout selection lists — address and payment pickers sharing one
 * selectable-row grammar: radio affordance left, content, check on select.
 * Flat rows with hairlines — not a stack of cards. "Add new" hands off to
 * the real management routes (/settings/addresses, /settings/payments) the
 * same way eBay's checkout hands off to account settings — one place owns
 * address/card entry.
 */

import Link from 'next/link';
import type { Address, PaymentMethod } from '@/lib/contracts/domain';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';

function SelectableRow({
  selected,
  onSelect,
  label,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      onClick={onSelect}
      className="pressable flex w-full items-center gap-3 py-3 text-left"
    >
      <span
        aria-hidden
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
          selected ? 'border-brand bg-brand' : 'border-border'
        }`}
      >
        {selected ? <Icon name="check" size={12} className="text-text-inverse" /> : null}
      </span>
      {children}
    </button>
  );
}

function SectionHeader({ title, addHref }: { title: string; addHref: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-section-title font-semibold text-text-primary">{title}</h2>
      <Link
        href={addHref}
        className="pressable flex items-center gap-1 rounded-md px-2 py-1 text-caption font-semibold text-text-secondary hover:text-text-primary"
      >
        <Icon name="plus" size={14} />
        Add new
      </Link>
    </div>
  );
}

export function AddressPicker({
  addresses,
  selectedId,
  onSelect,
}: {
  addresses: Address[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section>
      <SectionHeader title="Delivery address" addHref="/settings/addresses" />
      <div className="mt-1 divide-y divide-border-subtle" role="radiogroup" aria-label="Delivery address">
        {addresses.map((a) => (
          <SelectableRow
            key={a.id}
            selected={a.id === selectedId}
            onSelect={() => onSelect(a.id)}
            label={`${a.name}, ${a.street}, ${a.city} ${a.postcode}`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-alt text-text-secondary">
              <Icon name="location" size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-body font-medium text-text-primary">
                {a.name}
                {a.isDefault ? <Badge variant="neutral">Default</Badge> : null}
              </span>
              <span className="clamp-1 text-caption text-text-secondary">
                {a.street}, {a.city} {a.postcode}
              </span>
            </span>
          </SelectableRow>
        ))}
      </div>
      {addresses.length === 0 ? (
        <p className="py-3 text-caption text-text-muted">
          No saved addresses yet — add one to continue.
        </p>
      ) : null}
    </section>
  );
}

function cardBrandLabel(pm: PaymentMethod): string {
  if (pm.type === 'bank_account') return pm.bankName ?? 'Bank account';
  const brand = pm.brand ? pm.brand[0].toUpperCase() + pm.brand.slice(1) : 'Card';
  return `${brand} •••• ${pm.last4}`;
}

export function PaymentPicker({
  methods,
  selectedId,
  onSelect,
}: {
  methods: PaymentMethod[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section>
      <SectionHeader title="Payment method" addHref="/settings/payments" />
      <div className="mt-1 divide-y divide-border-subtle" role="radiogroup" aria-label="Payment method">
        {methods.map((pm) => (
          <SelectableRow
            key={pm.id}
            selected={pm.id === selectedId}
            onSelect={() => onSelect(pm.id)}
            label={cardBrandLabel(pm)}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-alt text-text-secondary">
              <Icon name={pm.type === 'card' ? 'card' : 'wallet'} size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-body font-medium text-text-primary">
                {cardBrandLabel(pm)}
                {pm.isDefault ? <Badge variant="neutral">Default</Badge> : null}
              </span>
              {pm.expiry ? (
                <span className="tnum text-caption text-text-secondary">Expires {pm.expiry}</span>
              ) : null}
            </span>
          </SelectableRow>
        ))}
      </div>
      {methods.length === 0 ? (
        <p className="py-3 text-caption text-text-muted">
          No saved cards yet — add one to pay.
        </p>
      ) : null}
    </section>
  );
}
