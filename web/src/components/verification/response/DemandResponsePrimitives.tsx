'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Spinner } from '@/components/ui/Spinner';
import type { SellerVerificationDemand } from '@/lib/contracts/verification';
import {
  demandDaysLeft,
  isDemandOverdue,
  type DemandEvidence,
} from '../demandModel';

export function DeadlineBadge({ demand }: { demand: SellerVerificationDemand }) {
  const overdue = isDemandOverdue(demand);
  const days = demandDaysLeft(demand);
  const text = overdue
    ? 'Deadline passed — respond immediately'
    : days <= 0
      ? 'Due today'
      : days === 1
        ? '1 day remaining'
        : `${days} days remaining`;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-meta font-medium ${
        overdue ? 'bg-danger-subtle text-danger-text' : 'bg-surface-alt text-text-secondary'
      }`}
    >
      <Icon name={overdue ? 'warning' : 'clock'} size={14} />
      {text}
    </span>
  );
}

export function DemandShell({
  children,
  backTo,
}: {
  children: React.ReactNode;
  backTo?: string;
}) {
  const router = useRouter();
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-16 sm:px-6 lg:max-w-[1100px]">
      <div className="flex items-center pt-2 md:pt-6">
        <IconButton
          name="back"
          aria-label="Back to verification requests"
          onClick={() => router.push(backTo ?? '/verification/demands')}
          className="-ml-2"
        />
        <h1 className="ml-1 text-screen-title text-text-primary">
          Respond to verification
        </h1>
      </div>
      {children}
    </div>
  );
}

export function EvidenceGrid({
  items,
  onRemove,
}: {
  items: DemandEvidence[];
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, i) => (
        <div key={item.id} className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element -- object-URL previews cannot go through next/image */}
          <img
            src={item.uri}
            alt={`Evidence photo ${i + 1}`}
            className={`h-[88px] w-[88px] rounded-md object-cover ${item.uploading ? 'opacity-60' : ''}`}
          />
          {item.uploading ? (
            <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
              <Spinner size={20} tone="scrim" />
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            aria-label={`Remove evidence photo ${i + 1}`}
            className="pressable absolute -right-1.5 -top-1.5 min-h-11 min-w-11 text-danger-text"
          >
            <Icon name="close" filled size={22} />
          </button>
        </div>
      ))}
    </div>
  );
}
