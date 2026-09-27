/**
 * SellField — one field chrome for the sell flow: label row (with quiet
 * Required hint), control slot, error line, helper line. Flat — no card.
 */

import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';

interface SellFieldProps {
  id: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  /** Field satisfied — the mobile flow's quiet done-check replaces "Required". */
  done?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export const INPUT_CLASS =
  'h-11 w-full rounded-md border border-border bg-input px-3.5 text-body text-input-text placeholder:text-text-muted transition-colors focus:border-text-muted focus:outline-none';

export const INPUT_ERROR_CLASS = 'border-danger-border';

export function SellField({ id, label, required, optional, done, error, hint, children }: SellFieldProps) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label htmlFor={id} className="text-caption font-medium text-text-secondary">
          {label}
        </label>
        {required && done ? (
          <Icon name="check" size={14} className="text-success-text" />
        ) : required ? (
          <span className="text-micro text-text-muted">Required</span>
        ) : optional ? (
          <span className="text-micro text-text-muted">Optional</span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-caption text-danger-text">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-caption text-text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
