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

/**
 * Radio-group keyboard grammar — roving tabindex (only the selected, or
 * the first enabled, radio is tabbable) and arrows/Home/End that move
 * focus AND selection, matching the ARIA radio-group pattern. Disabled
 * (expired) rows are skipped.
 */
function onRadioGroupKeyDown(event: React.KeyboardEvent<HTMLElement>) {
  const radios = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'),
  ).filter((r) => r.getAttribute('aria-disabled') !== 'true');
  const current = radios.indexOf(document.activeElement as HTMLElement);
  if (current < 0) return;
  let next = -1;
  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
    next = (current + 1) % radios.length;
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
    next = (current - 1 + radios.length) % radios.length;
  } else if (event.key === 'Home') {
    next = 0;
  } else if (event.key === 'End') {
    next = radios.length - 1;
  }
  if (next < 0 || next === current) return;
  event.preventDefault();
  const target = radios[next];
  target?.focus();
  target?.click();
}

function SelectableRow({
  selected,
  onSelect,
  label,
  disabled,
  tabIndex,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  disabled?: boolean;
  tabIndex: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      aria-label={label}
      tabIndex={disabled ? -1 : tabIndex}
      onClick={disabled ? undefined : onSelect}
      className={`flex w-full items-center gap-3 py-3 text-left ${
        disabled ? 'cursor-not-allowed opacity-50' : 'pressable'
      }`}
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

function SectionHeader({
  title,
  addHref,
  onAdd,
}: {
  title: string;
  addHref: string;
  /** When provided, "Add new" opens the in-flow sheet instead of leaving
   *  checkout for the management route (mobile-parity: AddCard/
   *  AddressForm sheets open inside the flow). */
  onAdd?: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-section-title font-semibold text-text-primary">{title}</h2>
      {onAdd ? (
        <button
          type="button"
          onClick={onAdd}
          className="pressable flex items-center gap-1 rounded-md px-2 py-1 text-caption font-semibold text-text-secondary hover:text-text-primary"
        >
          <Icon name="plus" size={14} />
          Add new
        </button>
      ) : (
        <Link
          href={addHref}
          className="pressable flex items-center gap-1 rounded-md px-2 py-1 text-caption font-semibold text-text-secondary hover:text-text-primary"
        >
          <Icon name="plus" size={14} />
          Add new
        </Link>
      )}
    </div>
  );
}

export function AddressPicker({
  addresses,
  selectedId,
  onSelect,
  onAdd,
}: {
  addresses: Address[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd?: () => void;
}) {
  return (
    <section>
      <SectionHeader title="Delivery address" addHref="/settings/addresses" onAdd={onAdd} />
      <div
        className="mt-1 divide-y divide-border-subtle"
        role="radiogroup"
        aria-label="Delivery address"
        onKeyDown={onRadioGroupKeyDown}
      >
        {addresses.map((a) => (
          <SelectableRow
            key={a.id}
            selected={a.id === selectedId}
            onSelect={() => onSelect(a.id)}
            label={`${a.name}, ${a.street}, ${a.city} ${a.postcode}`}
            tabIndex={a.id === (selectedId ?? addresses[0]?.id) ? 0 : -1}
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

/**
 * Card expired? `expiry` is the contract's "MM/YY" string — a card is
 * valid through the END of its expiry month, so the boundary is the
 * first day of the following month. Unparseable/missing expiry never
 * reads as expired — absence isn't failure. Shared with the checkout
 * page's seeding so a dead card can neither be picked nor auto-selected.
 */
export function paymentMethodExpired(pm: PaymentMethod, now = new Date()): boolean {
  if (pm.type !== 'card' || !pm.expiry) return false;
  const m = /^(\d{2})\/(\d{2})$/.exec(pm.expiry.trim());
  if (!m) return false;
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  if (month < 1 || month > 12) return false;
  return new Date(year, month, 1) <= now;
}

export function PaymentPicker({
  methods,
  selectedId,
  onSelect,
  onAdd,
  walletOption,
}: {
  methods: PaymentMethod[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd?: () => void;
  /** 1ZE wallet tender — rendered as a peer radio inside the group
   *  (mobile CheckoutOnezeOption grammar: "N 1ZE · M 1ZE needed").
   *  Selecting it is a funding switch, not a stored method: the page
   *  passes selectedId=null while the wallet holds selection. */
  walletOption?: {
    /** Settled 1ZE pocket balance. */
    available: number;
    /** 1ZE the order needs (GBP total at the wallet's GBP rate). */
    needed: number;
    selected: boolean;
    onSelect: () => void;
  };
}) {
  // The tabbable radio is the selected one when it's chargeable, else the
  // first chargeable row — an expired selection can never hold the
  // group's single tab stop.
  const selectedChargeable = methods.some(
    (m) => m.id === selectedId && !paymentMethodExpired(m),
  );
  const rovingId = walletOption?.selected
    ? null
    : selectedChargeable
      ? selectedId
      : methods.find((m) => !paymentMethodExpired(m))?.id;
  return (
    <section>
      <SectionHeader title="Payment method" addHref="/settings/payments" onAdd={onAdd} />
      <div
        className="mt-1 divide-y divide-border-subtle"
        role="radiogroup"
        aria-label="Payment method"
        onKeyDown={onRadioGroupKeyDown}
      >
        {methods.map((pm) => {
          const expired = paymentMethodExpired(pm);
          return (
            <SelectableRow
              key={pm.id}
              selected={pm.id === selectedId}
              onSelect={() => onSelect(pm.id)}
              label={`${cardBrandLabel(pm)}${expired ? ' (expired)' : ''}`}
              disabled={expired}
              tabIndex={!expired && pm.id === rovingId ? 0 : -1}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-alt text-text-secondary">
                <Icon name={pm.type === 'card' ? 'card' : 'wallet'} size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-body font-medium text-text-primary">
                  {cardBrandLabel(pm)}
                  {expired ? (
                    <Badge variant="warning">Expired</Badge>
                  ) : pm.isDefault ? (
                    <Badge variant="neutral">Default</Badge>
                  ) : null}
                </span>
                <span className="tnum text-caption text-text-secondary">
                  {expired
                    ? `Expired ${pm.expiry} — add a new card below`
                    : pm.expiry
                      ? `Expires ${pm.expiry}`
                      : null}
                </span>
              </span>
            </SelectableRow>
          );
        })}
        {walletOption ? (
          <SelectableRow
            selected={walletOption.selected}
            onSelect={walletOption.onSelect}
            label={`1ZE Wallet — ${Math.ceil(walletOption.available).toLocaleString()} 1ZE available, ${Math.ceil(walletOption.needed).toLocaleString()} 1ZE needed`}
            tabIndex={walletOption.selected ? 0 : -1}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-alt text-text-secondary">
              <Icon name="wallet" size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-body font-medium text-text-primary">
                1ZE Wallet
              </span>
              <span className="tnum text-caption text-text-secondary">
                {Math.ceil(walletOption.available).toLocaleString()} 1ZE ·{' '}
                {Math.ceil(walletOption.needed).toLocaleString()} 1ZE needed
              </span>
              {walletOption.selected && walletOption.available < walletOption.needed ? (
                <span className="block text-caption text-warning-text">
                  Not enough 1ZE — convert GBP in your wallet to cover this order
                </span>
              ) : null}
            </span>
          </SelectableRow>
        ) : null}
      </div>
      {methods.length === 0 && !walletOption ? (
        <p className="py-3 text-caption text-text-muted">
          No saved cards yet — add one to pay.
        </p>
      ) : null}
    </section>
  );
}
