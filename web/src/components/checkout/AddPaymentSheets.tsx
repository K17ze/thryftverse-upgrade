'use client';

/**
 * Checkout creation sheets — add a delivery address or a card without
 * leaving the flow. Mirrors the mobile AddressForm/AddCard steps: plain
 * validated fields, and an honest note that only a card's last4 is kept
 * (a live build tokenises the rest at the payment provider).
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { SellField, INPUT_CLASS, INPUT_ERROR_CLASS } from '@/components/sell/SellField';
import { Switch } from '@/components/settings/Switch';
import type { Address, PaymentMethod } from '@/lib/contracts/domain';

// ---------------------------------------------------------------------------
// Address
// ---------------------------------------------------------------------------

type AddressForm = { name: string; street: string; city: string; postcode: string };
const EMPTY_ADDRESS: AddressForm = { name: '', street: '', city: '', postcode: '' };

export function AddAddressSheet({
  open,
  onClose,
  onSave,
  initial = null,
  showDefaultToggle = false,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (a: Omit<Address, 'id' | 'isDefault'>, makeDefault: boolean) => void;
  /** Edit mode — prefills the form and retitles the sheet. */
  initial?: Address | null;
  /** Management surfaces opt in to the "set as default" toggle; checkout
   *  keeps the sheet to capture-only so nothing pretends to apply. */
  showDefaultToggle?: boolean;
}) {
  const [form, setForm] = useState<AddressForm>(EMPTY_ADDRESS);
  const [makeDefault, setMakeDefault] = useState(false);
  const [errors, setErrors] = useState<Partial<AddressForm>>({});

  useEffect(() => {
    if (open) {
      setForm(
        initial
          ? {
              name: initial.name,
              street: initial.street,
              city: initial.city,
              postcode: initial.postcode,
            }
          : EMPTY_ADDRESS,
      );
      setMakeDefault(initial?.isDefault ?? false);
      setErrors({});
    }
  }, [open, initial]);

  const set = (k: keyof AddressForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    const next: Partial<AddressForm> = {};
    if (!form.name.trim()) next.name = 'Give this address a name';
    if (!form.street.trim()) next.street = 'Street address is required';
    if (!form.city.trim()) next.city = 'Town or city is required';
    if (!/^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/.test(form.postcode.trim()))
      next.postcode = 'Enter a valid UK postcode';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onSave(
      {
        name: form.name.trim(),
        street: form.street.trim(),
        city: form.city.trim(),
        postcode: form.postcode.trim().toUpperCase(),
      },
      makeDefault,
    );
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={initial ? 'Edit delivery address' : 'Add delivery address'}
    >
      <div className="flex flex-col gap-4">
        <SellField id="addr-name" label="Label" error={errors.name} hint='e.g. "Home" or "Work"'>
          {/* The label is a nickname, not an address field — no autocomplete token. */}
          <input id="addr-name" className={`${INPUT_CLASS} ${errors.name ? INPUT_ERROR_CLASS : ''}`} value={form.name} onChange={set('name')} placeholder="Home" autoComplete="off" />
        </SellField>
        <SellField id="addr-street" label="Street address" error={errors.street}>
          <input id="addr-street" className={`${INPUT_CLASS} ${errors.street ? INPUT_ERROR_CLASS : ''}`} value={form.street} onChange={set('street')} placeholder="14 Redchurch Street" autoComplete="shipping street-address" />
        </SellField>
        <div className="grid grid-cols-2 gap-3">
          <SellField id="addr-city" label="Town / city" error={errors.city}>
            <input id="addr-city" className={`${INPUT_CLASS} ${errors.city ? INPUT_ERROR_CLASS : ''}`} value={form.city} onChange={set('city')} placeholder="London" autoComplete="shipping address-level2" />
          </SellField>
          <SellField id="addr-postcode" label="Postcode" error={errors.postcode}>
            <input id="addr-postcode" className={`${INPUT_CLASS} ${errors.postcode ? INPUT_ERROR_CLASS : ''}`} value={form.postcode} onChange={set('postcode')} placeholder="E2 7DD" autoComplete="shipping postal-code" />
          </SellField>
        </div>
        {showDefaultToggle ? (
          <div className="flex min-h-[44px] items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-body-emphasis text-text-primary">Set as default</p>
              <p className="text-caption text-text-muted">Selected automatically at checkout</p>
            </div>
            <Switch
              checked={makeDefault}
              onChange={setMakeDefault}
              aria-label="Set as default delivery address"
            />
          </div>
        ) : null}
        <Button variant="primary" size="lg" fullWidth className="mt-1" onClick={submit}>
          {initial ? 'Save changes' : 'Save address'}
        </Button>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

type CardForm = { holder: string; number: string; expiry: string; cvc: string };
const EMPTY_CARD: CardForm = { holder: '', number: '', expiry: '', cvc: '' };

const digits = (s: string) => s.replace(/\D/g, '');

function detectBrand(number: string): PaymentMethod['brand'] {
  if (/^4/.test(number)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(number)) return 'mastercard';
  if (/^3[47]/.test(number)) return 'amex';
  return undefined;
}

/** Luhn check — catches typos before the round-trip ever happens. */
function luhnOk(number: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = number.length - 1; i >= 0; i--) {
    let d = Number(number[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0 && number.length >= 15;
}

function formatCardInput(s: string): string {
  return digits(s).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');
}

function formatExpiryInput(s: string): string {
  const d = digits(s).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

export function AddCardSheet({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (p: Omit<PaymentMethod, 'id' | 'isDefault'>) => void;
}) {
  const [form, setForm] = useState<CardForm>(EMPTY_CARD);
  const [errors, setErrors] = useState<Partial<CardForm>>({});

  useEffect(() => {
    if (open) {
      setForm(EMPTY_CARD);
      setErrors({});
    }
  }, [open]);

  const submit = () => {
    const num = digits(form.number);
    const next: Partial<CardForm> = {};
    if (!form.holder.trim()) next.holder = 'Name on card is required';
    if (!luhnOk(num)) next.number = 'Enter a valid card number';
    const exp = digits(form.expiry);
    const mm = Number(exp.slice(0, 2));
    const yy = Number(`20${exp.slice(2, 4)}`);
    const now = new Date();
    if (exp.length !== 4 || mm < 1 || mm > 12 || yy < now.getFullYear() || (yy === now.getFullYear() && mm < now.getMonth() + 1)) {
      next.expiry = 'Enter a valid expiry (MM/YY)';
    }
    if (!/^\d{3,4}$/.test(digits(form.cvc))) next.cvc = '3–4 digits';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onSave({
      type: 'card',
      last4: num.slice(-4),
      brand: detectBrand(num),
      expiry: form.expiry,
    });
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Add payment card">
      <div className="flex flex-col gap-4">
        <SellField id="card-holder" label="Name on card" error={errors.holder}>
          <input id="card-holder" className={`${INPUT_CLASS} ${errors.holder ? INPUT_ERROR_CLASS : ''}`} value={form.holder} onChange={(e) => setForm((f) => ({ ...f, holder: e.target.value }))} autoComplete="cc-name" />
        </SellField>
        <SellField id="card-number" label="Card number" error={errors.number}>
          <input id="card-number" inputMode="numeric" className={`${INPUT_CLASS} ${errors.number ? INPUT_ERROR_CLASS : ''}`} value={form.number} onChange={(e) => setForm((f) => ({ ...f, number: formatCardInput(e.target.value) }))} placeholder="1234 5678 9012 3456" autoComplete="cc-number" />
        </SellField>
        <div className="grid grid-cols-2 gap-3">
          <SellField id="card-expiry" label="Expiry" error={errors.expiry}>
            <input id="card-expiry" inputMode="numeric" className={`${INPUT_CLASS} ${errors.expiry ? INPUT_ERROR_CLASS : ''}`} value={form.expiry} onChange={(e) => setForm((f) => ({ ...f, expiry: formatExpiryInput(e.target.value) }))} placeholder="MM/YY" autoComplete="cc-exp" />
          </SellField>
          <SellField id="card-cvc" label="CVC" error={errors.cvc}>
            <input id="card-cvc" inputMode="numeric" className={`${INPUT_CLASS} ${errors.cvc ? INPUT_ERROR_CLASS : ''}`} value={form.cvc} onChange={(e) => setForm((f) => ({ ...f, cvc: digits(e.target.value).slice(0, 4) }))} placeholder="123" autoComplete="cc-csc" />
          </SellField>
        </div>
        <p className="text-caption text-text-muted">
          Only the last four digits are saved. A live build tokenises the card at the payment
          provider — the full number never reaches our servers.
        </p>
        <Button variant="primary" size="lg" fullWidth className="mt-1" onClick={submit}>
          Save card
        </Button>
      </div>
    </Sheet>
  );
}
