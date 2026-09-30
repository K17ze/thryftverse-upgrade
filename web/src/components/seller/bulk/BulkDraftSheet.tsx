'use client';

/**
 * BulkDraftSheet — the per-item editor for the bulk-list grid. Photos are
 * local picks (blob: URIs, same as the sell composer); validation runs on
 * save so a row can sit as 'pending' while the seller fills the gaps.
 */

import { useEffect, useRef, useState } from 'react';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { useCategoryDirectory } from '@/components/search/useCategoryDirectory';
import type { ListingCondition } from '@/lib/contracts/domain';
import {
  BULK_PRICE_MAX,
  BULK_PRICE_MIN,
  BULK_TITLE_MAX,
  type BulkDraftItem,
} from './bulkListingModel';

const CONDITIONS: ListingCondition[] = [
  'New with tags',
  'New without tags',
  'Very good',
  'Good',
  'Satisfactory',
];

const MAX_PHOTOS = 8;

const fieldLabel = 'mb-1.5 block text-caption font-medium text-text-secondary';
const inputCls =
  'h-11 w-full rounded-md border border-border bg-surface px-3 text-body text-text-primary placeholder:text-text-muted focus:border-text-muted focus:outline-none';

interface BulkDraftSheetProps {
  open: boolean;
  /** The draft being edited — null means a fresh row. */
  draft: BulkDraftItem | null;
  onSave: (draft: BulkDraftItem) => void;
  onClose: () => void;
}

export function BulkDraftSheet({ open, draft, onSave, onClose }: BulkDraftSheetProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<BulkDraftItem | null>(null);
  const [priceText, setPriceText] = useState('');
  const { categories } = useCategoryDirectory();

  useEffect(() => {
    if (open) {
      setForm(draft ? { ...draft, images: [...draft.images] } : null);
      setPriceText(draft && draft.price > 0 ? String(draft.price) : '');
    }
  }, [open, draft]);

  if (!form) {
    // Keep the Sheet mounted for the open transition; content hydrates
    // from the draft on the open effect.
    return <Sheet open={open} onClose={onClose} title="Edit item" maxWidth={560}>{null}</Sheet>;
  }

  const addPhotos = (files: FileList | null) => {
    if (!files?.length) return;
    const urls = [...files]
      .slice(0, MAX_PHOTOS - form.images.length)
      .map((f) => URL.createObjectURL(f));
    setForm((f) => (f ? { ...f, images: [...f.images, ...urls] } : f));
  };

  const save = () => {
    const price = Number(priceText.replace(/[^0-9.]/g, ''));
    onSave({
      ...form,
      title: form.title,
      price: Number.isFinite(price) ? Math.round(price * 100) / 100 : 0,
      // Saved rows re-validate — the grid's status is always earned.
      status: 'pending',
      errors: [],
      listingId: undefined,
      publishError: undefined,
    });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={draft?.title.trim() ? 'Edit item' : 'Add item'}
      maxWidth={560}
    >
      <div className="px-5 pb-6 pt-1">
        {/* Photos — horizontal rail, real thumbs; the first is the cover. */}
        <span className={fieldLabel}>Photos</span>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addPhotos(e.target.files);
            e.target.value = '';
          }}
        />
        <ul className="no-scrollbar flex gap-2 overflow-x-auto pb-1" aria-label="Item photos">
          {form.images.map((uri, i) => (
            <li key={uri} className="relative h-20 w-20 shrink-0">
              <AppImage src={uri} alt={`Photo ${i + 1}`} fill sizes="80px" className="rounded-md" />
              <button
                type="button"
                onClick={() =>
                  setForm((f) =>
                    f ? { ...f, images: f.images.filter((u) => u !== uri) } : f,
                  )
                }
                aria-label={`Remove photo ${i + 1}`}
                className="pressable absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-surface-elevated text-text-primary shadow-subtle"
              >
                <Icon name="close" size={12} />
              </button>
            </li>
          ))}
          {form.images.length < MAX_PHOTOS ? (
            <li className="shrink-0">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label="Add photos"
                className="pressable flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-text-muted hover:border-text-muted hover:text-text-primary"
              >
                <Icon name="camera" size={18} />
                <span className="text-micro">Add</span>
              </button>
            </li>
          ) : null}
        </ul>

        <label className="mt-4 block">
          <span className={fieldLabel}>Title</span>
          <input
            type="text"
            value={form.title}
            maxLength={BULK_TITLE_MAX + 10}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Vintage Levi's 501s"
            className={inputCls}
          />
        </label>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={fieldLabel}>Price</span>
            <span className="relative block">
              <span className="tnum pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-body text-text-muted">
                £
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={priceText}
                onChange={(e) => setPriceText(e.target.value)}
                placeholder={`${BULK_PRICE_MIN.toFixed(2)}–${BULK_PRICE_MAX.toLocaleString('en-GB')}`}
                className={`${inputCls} tnum pl-7`}
              />
            </span>
          </label>
          <label className="block">
            <span className={fieldLabel}>Category</span>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className={`${inputCls} appearance-none`}
            >
              <option value="">Select…</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={fieldLabel}>Condition</span>
            <select
              value={form.condition}
              onChange={(e) =>
                setForm({ ...form, condition: e.target.value as ListingCondition | '' })
              }
              className={`${inputCls} appearance-none`}
            >
              <option value="">Select…</option>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={fieldLabel}>Brand</span>
            <input
              type="text"
              value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
              placeholder="Optional"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className={fieldLabel}>Size</span>
            <input
              type="text"
              value={form.size}
              onChange={(e) => setForm({ ...form, size: e.target.value })}
              placeholder="Optional"
              className={inputCls}
            />
          </label>
        </div>

        <label className="mt-4 block">
          <span className={fieldLabel}>Description</span>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            placeholder="Optional — buyers buy faster with detail"
            className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-body text-text-primary placeholder:text-text-muted focus:border-text-muted focus:outline-none"
          />
        </label>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="quiet" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="md" onClick={save}>
            {draft ? 'Save item' : 'Add item'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
