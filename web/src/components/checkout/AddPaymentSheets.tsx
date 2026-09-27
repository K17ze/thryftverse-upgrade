'use client';

/**
 * Checkout creation sheets — add a delivery address or a card without
 * leaving the flow. Mirrors the mobile AddressForm/AddCard steps: plain
 * validated fields, and an honest note that only a card's last4 is kept
 * (a live build tokenises the rest at the payment provider).
 */

import { useEffect, useState } from 'react';
import { DATA_MODE } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { SellField, INPUT_CLASS, INPUT_ERROR_CLASS } from '@/components/sell/SellField';
import { Switch } from '@/components/settings/Switch';
import { derivePostcodeSuggestion } from '@/lib/utils/postcodeLookup';
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
  /** Sync save (fixture overlay) closes immediately; a returned promise
   *  keeps the sheet open and busy until the server row lands — a rejected
   *  save stays open so the entered details aren't lost. */
  onSave: (a: Omit<Address, 'id' | 'isDefault'>, makeDefault: boolean) => void | Promise<void>;
  /** Edit mode — prefills the form and retitles the sheet. */
  initial?: Address | null;
  /** Management surfaces opt in to the "set as default" toggle; checkout
   *  keeps the sheet to capture-only so nothing pretends to apply. */
  showDefaultToggle?: boolean;
}) {
  const [form, setForm] = useState<AddressForm>(EMPTY_ADDRESS);
  const [makeDefault, setMakeDefault] = useState(false);
  const [errors, setErrors] = useState<Partial<AddressForm>>({});
  const [saving, setSaving] = useState(false);

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
      setSaving(false);
    }
  }, [open, initial]);

  const set = (k: keyof AddressForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // UK postcode lookup — suggests the town/city once the outcode resolves
  // (mobile AddressFormScreen's PostcodeSuggestionRow). Client-side table,
  // never a network call; it omits itself when the typed city already
  // matches so a manual override is never re-suggested.
  const postcodeSuggestion = derivePostcodeSuggestion(form);

  const submit = () => {
    const next: Partial<AddressForm> = {};
    if (!form.name.trim()) next.name = 'Give this address a name';
    if (!form.street.trim()) next.street = 'Street address is required';
    if (!form.city.trim()) next.city = 'Town or city is required';
    if (!/^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/.test(form.postcode.trim()))
      next.postcode = 'Enter a valid UK postcode';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const saved = onSave(
      {
        name: form.name.trim(),
        street: form.street.trim(),
        city: form.city.trim(),
        postcode: form.postcode.trim().toUpperCase(),
      },
      makeDefault,
    );
    if (saved && typeof saved.then === 'function') {
      // Async (live server) save — hold the sheet open until the write is
      // confirmed; a failure keeps the form so nothing entered is lost.
      setSaving(true);
      saved
        .then(() => onClose())
        .catch(() => {})
        .finally(() => setSaving(false));
      return;
    }
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
        {postcodeSuggestion ? (
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, city: postcodeSuggestion.city }))}
            aria-label={`Use ${postcodeSuggestion.city}, ${postcodeSuggestion.region} for this postcode`}
            className="pressable -mt-1 flex min-h-11 items-center gap-1.5 self-start rounded-md px-1 text-caption text-brand"
          >
            <Icon name="location" size={14} className="shrink-0" />
            <span>
              Use <span className="font-semibold">{postcodeSuggestion.city}</span>
              {postcodeSuggestion.region ? `, ${postcodeSuggestion.region}` : ''}
            </span>
            <Icon name="forward" size={14} className="shrink-0" />
          </button>
        ) : null}
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
        <Button variant="primary" size="lg" fullWidth className="mt-1" onClick={submit} disabled={saving}>
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Save address'}
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

  // Live mode: cards only exist through provider-hosted tokenisation
  // (Stripe SetupIntent — the app opens the payment sheet). Web has no
  // hosted-card rail and the legacy write route is permanently 410, so a
  // local form would mint a row checkout could never charge. The sheet
  // says so instead of collecting a PAN it cannot use.
  if (DATA_MODE === 'live') {
    return (
      <Sheet open={open} onClose={onClose} title="Add payment card">
        <div className="flex flex-col items-start gap-4">
          <div className="flex items-start gap-3">
            <Icon name="lock" size={18} className="mt-0.5 shrink-0 text-commerce-trust" />
            <div>
              <p className="text-body-emphasis text-text-primary">
                Cards are added through secure tokenisation
              </p>
              <p className="mt-1 text-caption text-text-secondary">
                We never store card numbers — new cards are collected by our payment provider.
                Add a card in the ThryftVerse app and it appears here automatically. Saved cards
                and the 1ZE wallet still work on web checkout.
              </p>
            </div>
          </div>
          <Button variant="secondary" size="lg" fullWidth onClick={onClose}>
            Got it
          </Button>
        </div>
      </Sheet>
    );
  }

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
