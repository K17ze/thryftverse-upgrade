'use client';

import type React from 'react';
import type { ReturnRemedy } from '@/lib/contracts/domain';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function remedyLabel(remedy: ReturnRemedy | null | undefined): string {
  switch (remedy) {
    case 'full_refund':
      return 'Full refund';
    case 'partial_refund':
      return 'Partial refund';
    case 'replacement':
      return 'Replacement';
    case 'repair':
      return 'Repair';
    case 'reject':
      return 'No refund offered';
    default:
      return 'Remedy pending';
  }
}

export type FormKind =
  | 'decision_approved'
  | 'decision_rejected'
  | 'evidence'
  | 'shipment'
  | 'inspection'
  | 'remedy'
  | 'appeal'
  | 'remedy_reject';

export const REMEDY_OPTIONS: { remedy: ReturnRemedy; label: string }[] = [
  { remedy: 'full_refund', label: 'Full refund' },
  { remedy: 'partial_refund', label: 'Partial refund' },
  { remedy: 'replacement', label: 'Replacement' },
  { remedy: 'repair', label: 'Repair' },
  { remedy: 'reject', label: 'No refund' },
];

export const inputCls =
  'w-full rounded-md border border-border bg-input px-3 py-2 text-body text-input-text placeholder:text-text-muted focus:border-text-muted';

export function ActionRow({
  label,
  icon,
  danger,
  disabled,
  onPress,
}: {
  label: string;
  icon: AppIconName;
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      className={`pressable flex min-h-11 items-center gap-2.5 py-1.5 text-body-emphasis font-medium ${
        danger ? 'text-danger-text' : 'text-commerce-trust'
      } disabled:opacity-50`}
    >
      <Icon name={icon} size={18} />
      {label}
    </button>
  );
}

export function FormShell({
  children,
  submitLabel,
  submitDisabled,
  isSubmitting,
  onCancel,
  onSubmit,
}: {
  children: React.ReactNode;
  submitLabel: string;
  submitDisabled?: boolean;
  isSubmitting?: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 pt-2">
      {children}
      <div className="flex items-center justify-end gap-3">
        <Button variant="quiet" size="sm" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onSubmit}
          disabled={isSubmitting || submitDisabled}
        >
          {isSubmitting ? 'Submitting…' : submitLabel}
        </Button>
      </div>
    </div>
  );
}
