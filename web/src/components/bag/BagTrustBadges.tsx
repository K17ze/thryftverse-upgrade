'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';

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

      {/* Explainer Modal */}
      {showProtectionModal ? (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-scrim/60 p-4">
          <div
            className="w-full max-w-md rounded-xl border border-border-subtle bg-surface p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="shieldCheck" size={20} className="text-commerce-trust" />
                <h3 className="text-body-emphasis font-bold text-text-primary">
                  Buyer Protection Policy
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowProtectionModal(false)}
                className="pressable rounded-full p-1 text-text-muted hover:bg-surface-alt hover:text-text-primary"
                aria-label="Close"
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-3.5 text-caption text-text-secondary leading-relaxed">
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

            <button
              type="button"
              onClick={() => setShowProtectionModal(false)}
              className="pressable mt-6 w-full rounded-md bg-brand py-2.5 text-caption font-semibold text-text-inverse hover:bg-brand-pressed"
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
