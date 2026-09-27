'use client';

/**
 * BulkEditSheet — mobile BulkEditSheet parity for the selected slice of
 * the management table. Fields the seller left untouched stay untouched —
 * the sheet only ships the changes it shows, and relative price edits
 * resolve to an absolute priceGbp per row before the batch 'edit' command
 * runs. Per-item receipts render in place after apply.
 */

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { CATEGORIES } from '@/lib/data/fixtures';
import type { SellerHubListingEditPatch } from '@/lib/api/services/sellerHub';
import type { BulkActionResult } from '@/lib/hooks/seller-queries';
import { formatPrice } from '@/lib/utils/format';
import {
  bulkEditable,
  bulkReasonCopy,
  type ManagedListingRow,
} from './listingManagementModel';
import type { ListingCondition } from '@/lib/contracts/domain';

type PriceMode = 'keep' | 'set' | 'raise' | 'lower';

const PRICE_MODES: { value: PriceMode; label: string }[] = [
  { value: 'keep', label: 'Keep prices' },
  { value: 'set', label: 'Set price' },
  { value: 'raise', label: 'Increase by %' },
  { value: 'lower', label: 'Decrease by %' },
];

const CONDITIONS: ListingCondition[] = [
  'New with tags',
  'New without tags',
  'Very good',
  'Good',
  'Satisfactory',
];

const MIN_PRICE = 0.5;
const MAX_PRICE = 100_000;

const fieldLabel =
  'mb-1.5 block text-caption font-medium text-text-secondary';
const inputCls =
  'h-11 w-full rounded-md border border-border bg-surface px-3 text-body text-text-primary placeholder:text-text-muted focus:border-text-muted focus:outline-none';

interface BulkEditSheetProps {
  open: boolean;
  rows: ManagedListingRow[];
  pending: boolean;
  result: BulkActionResult | null;
  onApply: (items: { listingId: string; patch: SellerHubListingEditPatch }[]) => void;
  onClose: () => void;
}

export function BulkEditSheet({
  open,
  rows,
  pending,
  result,
  onApply,
  onClose,
}: BulkEditSheetProps) {
  const [priceMode, setPriceMode] = useState<PriceMode>('keep');
  const [priceValue, setPriceValue] = useState('');
  const [category, setCategory] = useState('');
  const [condition, setCondition] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Fresh form each open — a stale % would silently re-apply to a new
  // selection, which is exactly the bulk-edit footgun this sheet exists
  // to prevent.
  useEffect(() => {
    if (open) {
      setPriceMode('keep');
      setPriceValue('');
      setCategory('');
      setCondition('');
      setError(null);
    }
  }, [open]);

  const editable = useMemo(() => rows.filter(bulkEditable), [rows]);
  const skipped = rows.length - editable.length;

  const numeric = Number(priceValue.replace(/[^0-9.]/g, ''));
  const priceReady =
    priceMode === 'keep' ||
    (priceValue.trim() !== '' &&
      Number.isFinite(numeric) &&
      (priceMode === 'set'
        ? numeric >= MIN_PRICE && numeric <= MAX_PRICE
        : numeric > 0 && numeric <= 90));

  const hasChange = priceMode !== 'keep' || category !== '' || condition !== '';

  /** Absolute per-item patches — a "+10%" over a £48 row is a different
   *  priceGbp than over a £120 row; the command records what each row
   *  actually became. */
  const items = useMemo(() => {
    if (!hasChange) return [];
    return editable.map((row) => {
      const patch: SellerHubListingEditPatch = {};
      if (priceMode === 'set') {
        patch.priceGbp = Math.round(numeric * 100) / 100;
      } else if (priceMode === 'raise' || priceMode === 'lower') {
        const factor = priceMode === 'raise' ? 1 + numeric / 100 : 1 - numeric / 100;
        const next = Math.round(row.listing.price * factor * 100) / 100;
        patch.priceGbp = Math.min(MAX_PRICE, Math.max(MIN_PRICE, next));
      }
      if (category) patch.category = category;
      if (condition) patch.condition = condition;
      return { listingId: row.listing.id, patch };
    });
  }, [editable, hasChange, priceMode, numeric, category, condition]);

  const apply = () => {
    if (!hasChange || !editable.length) return;
    if (!priceReady) {
      setError(
        priceMode === 'set'
          ? `Set a price between ${formatPrice(MIN_PRICE)} and ${formatPrice(MAX_PRICE)}`
          : 'Enter a percentage between 1 and 90',
      );
      return;
    }
    // Clamp-check the resolved prices — percent math can push a high row
    // over the ceiling; those rows get the clamp, disclosed below.
    setError(null);
    onApply(items);
  };

  const appliedCount = result?.results.filter((r) => r.state === 'applied').length ?? 0;
  const rejected = result?.results.filter((r) => r.state !== 'applied') ?? [];

  return (
    <Sheet open={open} onClose={onClose} title="Edit listings" maxWidth={520}>
      <div className="px-5 pb-6 pt-1">
        {result ? (
          <>
            <p className="text-body text-text-secondary">
              {result.state === 'complete'
                ? `Updated ${appliedCount} listing${appliedCount === 1 ? '' : 's'}.`
                : `Updated ${appliedCount} · ${rejected.length} skipped.`}
            </p>
            {rejected.length ? (
              <ul className="mt-4 divide-y divide-border-subtle border-y border-border-subtle">
                {rejected.map((r) => {
                  const row = rows.find((x) => x.listing.id === r.listingId);
                  return (
                    <li key={r.listingId} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="clamp-1 text-body text-text-primary">
                        {row?.listing.title || r.listingId}
                      </span>
                      <span className="shrink-0 text-meta text-warning-text">
                        {bulkReasonCopy(r.reason)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <div className="mt-6 flex justify-end">
              <Button variant="primary" size="md" onClick={onClose}>
                Done
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-body text-text-secondary">
              Changes apply to{' '}
              <span className="tnum font-medium text-text-primary">
                {editable.length} listing{editable.length === 1 ? '' : 's'}
              </span>
              {skipped > 0 ? (
                <>
                  {' '}
                  — {skipped} skipped ({skipped === 1 ? 'a' : 'sold or draft'}{' '}
                  {skipped === 1 ? 'row' : 'rows'} can&rsquo;t be edited this way)
                </>
              ) : null}
              . Fields left alone stay as they are.
            </p>

            {/* Price — the dominant edit; relative modes resolve to a real
                number per row so the audit trail stays absolute. */}
            <div className="mt-5">
              <span className={fieldLabel} id="bulk-edit-price-label">
                Price
              </span>
              <div
                className="flex flex-wrap gap-1.5"
                role="group"
                aria-labelledby="bulk-edit-price-label"
              >
                {PRICE_MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    aria-pressed={priceMode === m.value}
                    onClick={() => {
                      setPriceMode(m.value);
                      setError(null);
                    }}
                    className={`pressable h-9 rounded-md border px-3 text-caption font-medium transition-colors ${
                      priceMode === m.value
                        ? 'border-brand bg-brand-subtle text-text-primary'
                        : 'border-border text-text-secondary hover:bg-surface-alt'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              {priceMode !== 'keep' ? (
                <div className="relative mt-3">
                  {priceMode === 'set' ? (
                    <span className="tnum pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-body text-text-muted">
                      £
                    </span>
                  ) : null}
                  <input
                    type="text"
                    inputMode="decimal"
                    value={priceValue}
                    onChange={(e) => {
                      setPriceValue(e.target.value);
                      setError(null);
                    }}
                    placeholder={priceMode === 'set' ? '0.00' : 'e.g. 10'}
                    aria-label={
                      priceMode === 'set' ? 'New price in pounds' : 'Percentage change'
                    }
                    className={`${inputCls} tnum ${priceMode === 'set' ? 'pl-7' : ''}`}
                  />
                  {priceMode !== 'set' ? (
                    <span className="tnum pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-body text-text-muted">
                      %
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Resolved-price preview — what each row actually becomes
                under a % rule, so nothing surprises on apply. */}
            {(priceMode === 'raise' || priceMode === 'lower') &&
            priceReady &&
            editable.length ? (
              <ul className="mt-3 max-h-36 divide-y divide-border-subtle overflow-y-auto border-y border-border-subtle">
                {items.map((item) => {
                  const row = editable.find((r) => r.listing.id === item.listingId);
                  if (!row || item.patch.priceGbp == null) return null;
                  const clamped = Math.abs(
                    item.patch.priceGbp -
                      Math.round(
                        row.listing.price *
                          (priceMode === 'raise' ? 1 + numeric / 100 : 1 - numeric / 100) *
                          100,
                      ) /
                        100,
                  ) > 0.001;
                  return (
                    <li
                      key={item.listingId}
                      className="tnum flex items-center justify-between gap-3 py-2 text-meta"
                    >
                      <span className="clamp-1 text-text-secondary">{row.listing.title}</span>
                      <span className="shrink-0 text-text-primary">
                        {formatPrice(row.listing.price)} → {formatPrice(item.patch.priceGbp)}
                        {clamped ? <span className="text-warning-text"> (capped)</span> : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={fieldLabel}>Category</span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={`${inputCls} appearance-none`}
                >
                  <option value="">Keep current</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={fieldLabel}>Condition</span>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className={`${inputCls} appearance-none`}
                >
                  <option value="">Keep current</option>
                  {CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {error ? (
              <p className="mt-3 text-caption font-medium text-danger-text" role="alert">
                {error}
              </p>
            ) : null}

            <div className="mt-6 flex items-center justify-end gap-2">
              <Button variant="quiet" size="md" onClick={onClose} disabled={pending}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={apply}
                disabled={!hasChange || !editable.length || pending}
                aria-busy={pending}
              >
                {pending
                  ? 'Applying…'
                  : `Apply to ${editable.length || ''} listing${editable.length === 1 ? '' : 's'}`}
              </Button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
