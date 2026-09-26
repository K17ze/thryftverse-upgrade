'use client';

/**
 * ReviewStep — the review workbench. A single summary line carries the
 * counts; the hairline table is the dominant object. Rows edit inline
 * (title / price / condition), validation flags per row, and the include
 * checkbox is the exclude toggle. Mirroring mobile, included rows with
 * unresolved errors block the confirm action — fix or exclude them.
 */

import { useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { CONDITION_OPTIONS } from '@/components/sell/constants';
import { INPUT_CLASS, INPUT_ERROR_CLASS } from '@/components/sell/SellField';
import type { ListingCondition } from '@/lib/contracts/domain';
import {
  hasErrors,
  rowErrors,
  rowLabel,
  type ImportRow,
  type RowErrors,
} from './core';

interface ReviewStepProps {
  rows: ImportRow[];
  onRowsChange: (rows: ImportRow[]) => void;
  onConfirm: () => void;
}

const CELL_INPUT = `${INPUT_CLASS} h-10 px-3`;
const SELECT_CLASS = `${CELL_INPUT} appearance-none pr-8`;

export function ReviewStep({ rows, onRowsChange, onConfirm }: ReviewStepProps) {
  const counts = useMemo(() => {
    let ready = 0;
    let fixes = 0;
    let excluded = 0;
    rows.forEach((row) => {
      if (row.excluded) excluded += 1;
      else if (hasErrors(row)) fixes += 1;
      else ready += 1;
    });
    return { ready, fixes, excluded };
  }, [rows]);

  const patchRow = (id: string, patch: Partial<ImportRow>) =>
    onRowsChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const summaryText = useMemo(() => {
    const parts: string[] = [`${counts.ready} ready`];
    if (counts.fixes > 0) parts.push(`${counts.fixes} need${counts.fixes === 1 ? 's' : ''} fixes`);
    if (counts.excluded > 0) parts.push(`${counts.excluded} excluded`);
    return parts.join(' · ');
  }, [counts]);

  return (
    <div>
      <h1 className="text-screen-title font-bold text-text-primary">Review your listings</h1>
      <p className="mt-2 text-section-title font-semibold text-text-primary">{summaryText}</p>
      <p className="mt-1 text-body text-text-secondary">
        Edit anything that looks off, or uncheck a row to skip it.
      </p>

      {/* ── Column header — flat labels, hairline ── */}
      <div className="mt-6 hidden items-center gap-3 border-b border-border-subtle pb-2 sm:flex">
        <span className="w-7 shrink-0" aria-hidden />
        <span className="flex-1 text-label font-semibold uppercase tracking-wider text-text-muted">
          Item
        </span>
        <span className="w-28 shrink-0 text-label font-semibold uppercase tracking-wider text-text-muted">
          Price
        </span>
        <span className="w-44 shrink-0 text-label font-semibold uppercase tracking-wider text-text-muted">
          Condition
        </span>
      </div>

      <ul className="divide-y divide-border-subtle border-b border-border-subtle">
        {rows.map((row, index) => {
          const errors: RowErrors = row.excluded ? {} : rowErrors(row);
          return (
            <li key={row.id} className={`py-4 ${row.excluded ? 'opacity-50' : ''}`}>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={!row.excluded}
                  onChange={() => patchRow(row.id, { excluded: !row.excluded })}
                  aria-label={`Include ${rowLabel(row)}`}
                  className="mt-2.5 h-4 w-4 shrink-0 accent-brand"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                  {/* ── Item — title input + brand/size meta ── */}
                  <div className="min-w-0 flex-1">
                    <input
                      type="text"
                      value={row.title}
                      disabled={row.excluded}
                      onChange={(e) => patchRow(row.id, { title: e.target.value })}
                      placeholder="Title"
                      aria-label={`Title for row ${index + 1}`}
                      aria-invalid={!!errors.title}
                      maxLength={80}
                      className={`${CELL_INPUT} ${errors.title ? INPUT_ERROR_CLASS : ''} disabled:bg-transparent`}
                    />
                    <p className="mt-1 truncate text-meta text-text-muted">
                      {[row.brand || 'No brand', row.size || 'No size'].join(' · ')}
                      {row.description ? ' · has description' : ''}
                    </p>
                    {errors.title ? (
                      <p role="alert" className="mt-1 text-caption text-danger-text">
                        {errors.title}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex gap-2 sm:contents">
                    {/* ── Price ── */}
                    <div className="w-28 shrink-0">
                      <div className="relative">
                        <span
                          aria-hidden
                          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-body text-text-muted"
                        >
                          £
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.priceText}
                          disabled={row.excluded}
                          onChange={(e) => patchRow(row.id, { priceText: e.target.value })}
                          placeholder="0.00"
                          aria-label={`Price for ${rowLabel(row)}`}
                          aria-invalid={!!errors.price}
                          className={`${CELL_INPUT} tnum pl-6 ${errors.price ? INPUT_ERROR_CLASS : ''} disabled:bg-transparent`}
                        />
                      </div>
                      {errors.price ? (
                        <p role="alert" className="mt-1 text-caption text-danger-text">
                          {errors.price}
                        </p>
                      ) : null}
                    </div>

                    {/* ── Condition ── */}
                    <div className="w-40 shrink-0">
                      <div className="relative">
                        <select
                          value={row.condition}
                          disabled={row.excluded}
                          onChange={(e) =>
                            patchRow(row.id, {
                              condition: e.target.value as ListingCondition,
                              conditionGuessed: false,
                            })
                          }
                          aria-label={`Condition for ${rowLabel(row)}`}
                          className={`${SELECT_CLASS} disabled:bg-transparent`}
                        >
                          {CONDITION_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.value}
                            </option>
                          ))}
                        </select>
                        <Icon
                          name="chevronDown"
                          size={14}
                          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                        />
                      </div>
                      {row.conditionGuessed && !row.excluded ? (
                        <p className="mt-1 text-caption text-warning-text">
                          Guessed — check it
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* ── Confirm — gated by unresolved included errors ── */}
      <div className="mt-6">
        {counts.fixes > 0 ? (
          <p className="mb-3 text-center text-caption font-medium text-danger-text">
            Fix or exclude {counts.fixes} row{counts.fixes === 1 ? '' : 's'} to continue
          </p>
        ) : null}
        <Button size="lg" fullWidth disabled={counts.fixes > 0} onClick={onConfirm}>
          {counts.ready > 0
            ? `Create ${counts.ready} draft${counts.ready === 1 ? '' : 's'}`
            : 'Continue to summary'}
        </Button>
      </div>
    </div>
  );
}
