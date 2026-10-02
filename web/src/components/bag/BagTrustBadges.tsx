'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';

export function BagTrustBadges() {
  const [showProtectionModal, setShowProtectionModal] = useState(false);

  return (
    <div className="mt-5 border-t border-border-subtle pt-4">
      <button
        type="button"
        onClick={() => setShowProtectionModal(true)}
        className="pressable flex items-center gap-1.5 text-caption font-medium text-text-secondary hover:text-text-primary"
      >
        <Icon name="shieldCheck" size={15} className="text-commerce-trust" />
        Buyer Protection — how it works
      </button>
      <p className="mt-2.5 text-meta text-text-muted">
        Secure checkout · Visa, Mastercard, Apple Pay, 1ZE
      </p>

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
