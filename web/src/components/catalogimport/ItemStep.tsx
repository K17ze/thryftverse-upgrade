'use client';

/**
 * ItemStep — the per-item editor for catalog import (mobile
 * CatalogImportItemScreen parity). One item at a time: a media rail
 * (honest empty state — CSV rows carry no photos), field rows showing
 * what the file detected vs what it says now, the parser's extraction
 * candidates with confidence, an issue navigator that jumps to blocking
 * fields, and the keep/exclude decision.
 */

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { CONDITION_OPTIONS } from '@/components/sell/constants';
import { INPUT_CLASS, INPUT_ERROR_CLASS } from '@/components/sell/SellField';
import type { ListingCondition } from '@/lib/contracts/domain';
import {
  extractionCandidates,
  rowErrors,
  rowLabel,
  type ImportRow,
} from './core';

type FieldKey = 'title' | 'brand' | 'size' | 'condition' | 'price' | 'description';

interface ItemIssue {
  field: FieldKey;
  label: string;
  /** 'block' = the row can't import until fixed; 'warn' = check it. */
  level: 'block' | 'warn';
}

function fieldId(field: FieldKey) {
  return `import-item-field-${field}`;
}

interface ItemStepProps {
  rows: ImportRow[];
  index: number;
  onRowsChange: (rows: ImportRow[]) => void;
  onIndexChange: (index: number) => void;
  onBack: () => void;
}

export function ItemStep({
  rows,
  index,
  onRowsChange,
  onIndexChange,
  onBack,
}: ItemStepProps) {
  const row = rows[index] ?? null;
  const [focusField, setFocusField] = useState<FieldKey | null>(null);

  const issues = useMemo((): ItemIssue[] => {
    if (!row) return [];
    const errs = rowErrors(row);
    const list: ItemIssue[] = [];
    if (errs.title) list.push({ field: 'title', label: errs.title, level: 'block' });
    if (errs.price) list.push({ field: 'price', label: errs.price, level: 'block' });
    if (row.conditionGuessed) {
      list.push({
        field: 'condition',
        label: `Condition guessed — the file said “${row.detected.conditionText || 'blank'}”`,
        level: 'warn',
      });
    }
    return list;
  }, [row]);

  const candidates = useMemo(() => (row ? extractionCandidates(row) : []), [row]);

  if (!row) {
    return (
      <div>
        <h1 className="text-screen-title text-text-primary">Item not found</h1>
        <p className="mt-2 text-body text-text-secondary">This row is no longer in the import.</p>
        <Button variant="secondary" size="md" className="mt-5" onClick={onBack}>
          Back to review
        </Button>
      </div>
    );
  }

  const patch = (p: Partial<ImportRow>) =>
    onRowsChange(rows.map((r) => (r.id === row.id ? { ...r, ...p } : r)));

  const jumpToIssue = (issue: ItemIssue) => {
    setFocusField(issue.field);
    document
      .getElementById(fieldId(issue.field))
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const detectedDiffers = (detected: string, current: string) =>
    detected.trim() !== current.trim();

  /** One field row — label, the raw cell it came from when it differs
   *  (or is empty), then the editable current value. */
  const fieldRow = (
    field: FieldKey,
    label: string,
    detected: string,
    control: React.ReactNode,
  ) => {
    const differs = detectedDiffers(detected, '');
    return (
      <div
        id={fieldId(field)}
        className={`rounded-md px-3 py-3 transition-shadow ${
          focusField === field ? 'ring-1 ring-brand' : ''
        }`}
      >
        <div className="flex items-baseline justify-between gap-3">
          <label
            htmlFor={fieldId(field)}
            className="text-caption font-medium text-text-secondary"
          >
            {label}
          </label>
          {differs ? (
            <span className="clamp-1 text-meta text-text-muted">
              File: “{detected || 'blank'}”
            </span>
          ) : null}
        </div>
        <div className="mt-1.5">{control}</div>
      </div>
    );
  };

  const titleErr = row.excluded ? undefined : rowErrors(row).title;
  const priceErr = row.excluded ? undefined : rowErrors(row).price;

  return (
    <div>
      {/* Position + item nav — the file's own ordering, nothing hidden. */}
      <div className="flex items-center justify-between">
        <h1 className="text-screen-title text-text-primary">
          Item {index + 1} of {rows.length}
        </h1>
        <div className="flex items-center gap-1">
          <IconButton
            name="back"
            aria-label="Previous item"
            disabled={index === 0}
            onClick={() => onIndexChange(index - 1)}
          />
          <IconButton
            name="forward"
            aria-label="Next item"
            disabled={index >= rows.length - 1}
            onClick={() => onIndexChange(index + 1)}
          />
        </div>
      </div>
      <p className="mt-1 text-meta text-text-muted">
        Line {row.line} · {rowLabel(row)}
      </p>

      {/* Keep / exclude — the seller's decision for this row. */}
      <div
        className="mt-4 flex items-center gap-2"
        role="group"
        aria-label="Item decision"
      >
        <Button
          variant={row.excluded ? 'secondary' : 'primary'}
          size="sm"
          onClick={() => patch({ excluded: false })}
        >
          Keep in import
        </Button>
        <Button
          variant={row.excluded ? 'danger' : 'secondary'}
          size="sm"
          onClick={() => patch({ excluded: true })}
        >
          Exclude
        </Button>
        {row.excluded ? (
          <Badge variant="neutral">Excluded</Badge>
        ) : issues.some((i) => i.level === 'block') ? (
          <Badge variant="warning">Needs fixes</Badge>
        ) : (
          <Badge variant="success">Ready</Badge>
        )}
      </div>

      {/* Media rail — CSV imports genuinely carry no photos; say so. */}
      <div className="mt-6">
        <span className="text-caption font-medium text-text-secondary">Photos</span>
        <div className="mt-1.5 flex h-20 items-center gap-3 rounded-md border border-dashed border-border px-3">
          <Icon name="camera" size={18} className="shrink-0 text-text-muted" />
          <p className="text-meta text-text-muted">
            No photos in the file — add them when you finish each draft.
          </p>
        </div>
      </div>

      {/* Field rows — detected value vs current, editable in place. */}
      <div className="mt-6 space-y-1">
        {fieldRow(
          'title',
          'Title',
          row.detected.title,
          <input
            id={fieldId('title')}
            type="text"
            value={row.title}
            disabled={row.excluded}
            onChange={(e) => patch({ title: e.target.value })}
            aria-invalid={!!titleErr}
            maxLength={80}
            className={`${INPUT_CLASS} h-11 ${titleErr ? INPUT_ERROR_CLASS : ''}`}
          />,
        )}
        {fieldRow(
          'price',
          'Price',
          row.detected.priceText,
          <input
            id={fieldId('price')}
            type="text"
            inputMode="decimal"
            value={row.priceText}
            disabled={row.excluded}
            onChange={(e) => patch({ priceText: e.target.value })}
            aria-invalid={!!priceErr}
            className={`${INPUT_CLASS} tnum h-11 ${priceErr ? INPUT_ERROR_CLASS : ''}`}
          />,
        )}
        {fieldRow(
          'condition',
          'Condition',
          row.detected.conditionText,
          <select
            id={fieldId('condition')}
            value={row.condition}
            disabled={row.excluded}
            onChange={(e) =>
              patch({
                condition: e.target.value as ListingCondition,
                conditionGuessed: false,
              })
            }
            className={`${INPUT_CLASS} h-11 appearance-none`}
          >
            {CONDITION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.value}
              </option>
            ))}
          </select>,
        )}
        {fieldRow(
          'brand',
          'Brand',
          row.detected.brand,
          <input
            id={fieldId('brand')}
            type="text"
            value={row.brand}
            disabled={row.excluded}
            onChange={(e) => patch({ brand: e.target.value })}
            className={`${INPUT_CLASS} h-11`}
          />,
        )}
        {fieldRow(
          'size',
          'Size',
          row.detected.size,
          <input
            id={fieldId('size')}
            type="text"
            value={row.size}
            disabled={row.excluded}
            onChange={(e) => patch({ size: e.target.value })}
            className={`${INPUT_CLASS} h-11`}
          />,
        )}
        {fieldRow(
          'description',
          'Description',
          row.detected.description,
          <textarea
            id={fieldId('description')}
            value={row.description}
            disabled={row.excluded}
            onChange={(e) => patch({ description: e.target.value })}
            rows={3}
            className={`${INPUT_CLASS} h-auto py-2.5`}
          />,
        )}
      </div>

      {/* Extraction candidates — real parser provenance, low-confidence
          rows flagged for the seller to check. */}
      {candidates.length ? (
        <div className="mt-6">
          <h2 className="text-caption font-medium text-text-secondary">Detected values</h2>
          <ul className="mt-1.5 divide-y divide-border-subtle border-y border-border-subtle">
            {candidates.map((c) => (
              <li key={c.field} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block text-body text-text-primary">{c.label}</span>
                  <span className="tnum block truncate text-meta text-text-muted">
                    “{c.detected}” to {c.resolved}
                  </span>
                </span>
                <Badge variant={c.confidence === 'low' ? 'warning' : 'neutral'}>
                  {c.confidence === 'low' ? 'Check' : 'Parsed'}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Issue navigator — pins at the foot when anything needs the
          seller; jumps land on the field, highlighted. */}
      {issues.length ? (
        <div className="sticky bottom-4 mt-6 rounded-md border border-border bg-surface-elevated px-4 py-3 shadow-subtle">
          <div className="flex items-center justify-between gap-3">
            <p className="tnum text-caption font-medium text-text-primary">
              {issues.length} issue{issues.length === 1 ? '' : 's'} on this item
            </p>
            <div className="flex items-center gap-1">
              {issues.map((issue, i) => (
                <button
                  key={issue.field}
                  type="button"
                  onClick={() => jumpToIssue(issue)}
                  aria-label={`Issue ${i + 1}: ${issue.label}`}
                  aria-pressed={focusField === issue.field}
                  className={`pressable h-8 rounded-md px-2 text-meta font-medium ${
                    issue.level === 'block' ? 'text-danger-text' : 'text-warning-text'
                  } ${focusField === issue.field ? 'bg-surface-alt' : 'hover:bg-surface-alt'}`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1 clamp-1 text-meta text-text-muted">{issues[0]!.label}</p>
        </div>
      ) : null}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" size="md" onClick={onBack}>
          Back to review
        </Button>
        <Button
          variant="primary"
          size="md"
          disabled={index >= rows.length - 1}
          onClick={() => onIndexChange(index + 1)}
        >
          Next item
        </Button>
      </div>
    </div>
  );
}
