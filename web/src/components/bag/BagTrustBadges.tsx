'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';

export function BagTrustBadges() {
  const [showProtectionModal, setShowProtectionModal] = useState(false);

  return (
    <div className="space-y-3.5 pt-3">
      {/* Buyer Protection Explainer Bar */}
      <div className="rounded-lg border border-border-subtle bg-surface-alt/50 p-3">
        <div className="flex items-start gap-2.5">
          <Icon name="shieldCheck" size={17} className="mt-0.5 shrink-0 text-commerce-trust" />
          <div className="min-w-0 flex-1">
            <p className="text-caption font-semibold text-text-primary">
              ThryftVerse Buyer Protection
            </p>
            <p className="mt-0.5 text-meta text-text-secondary leading-relaxed">
              Your money is held in escrow until you verify your items. Full refund if not as described or lost in transit.
            </p>
            <button
              type="button"
              onClick={() => setShowProtectionModal(true)}
              className="pressable mt-1.5 inline-flex items-center gap-1 text-meta font-medium text-brand hover:underline"
            >
              How protection works
              <Icon name="forward" size={11} />
            </button>
          </div>
        </div>
      </div>

      {/* Payment Rails Logos & Security */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3">
        <span className="flex items-center gap-1.5 text-meta text-text-muted">
          <Icon name="lock" size={12} className="text-text-muted" />
          256-bit encrypted checkout
        </span>
        <div className="flex items-center gap-2 text-text-secondary">
          <span className="rounded bg-surface-alt px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-text-muted">
            APPLE PAY
          </span>
          <span className="rounded bg-surface-alt px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-text-muted">
            VISA
          </span>
          <span className="rounded bg-surface-alt px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-text-muted">
            MC
          </span>
          <span className="rounded bg-surface-alt px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-brand">
            1ZE
          </span>
        </div>
      </div>

      <Sheet
        open={showProtectionModal}
        onClose={() => setShowProtectionModal(false)}
        title="Buyer Protection"
        maxWidth={440}
      >
        <div className="space-y-3.5 px-5 py-4 text-caption leading-relaxed text-text-secondary">
          <div className="flex gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-meta font-bold text-brand">
              1
            </span>
            <div>
              <strong className="text-text-primary">Escrow Settlement:</strong> Sellers do not receive payment until 48 hours after delivery tracking confirms package arrival.
            </div>
          </div>
          <div className="flex gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-meta font-bold text-brand">
              2
            </span>
            <div>
              <strong className="text-text-primary">Significant Misdescription:</strong> If condition, measurements or authenticity differ significantly from listing photographs, you are entitled to a full return.
            </div>
          </div>
          <div className="flex gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-meta font-bold text-brand">
              3
            </span>
            <div>
              <strong className="text-text-primary">Physical Authentication:</strong> Luxury items over £150 undergo mandatory multi-point physical verification before dispatch to you.
            </div>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
