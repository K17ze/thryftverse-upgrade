'use client';

/**
 * FirstTradeGate — device-local onboarding check before first fractional trade.
 * Educates on unit ownership, order books, and 1ZE settlement.
 */

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

interface FirstTradeGateProps {
  assetTitle: string;
  onComplete: () => void;
}

export function FirstTradeGate({ assetTitle, onComplete }: FirstTradeGateProps) {
  return (
    <div aria-label="Before your first Co-Own trade">
      <div className="flex items-start gap-2.5">
        <Icon name="info" size={18} className="mt-0.5 shrink-0 text-text-secondary" />
        <div className="min-w-0">
          <p className="text-body-emphasis font-semibold text-text-primary">
            Before your first Co-Own trade
          </p>
          <p className="mt-1.5 text-body text-text-secondary">
            Units of {assetTitle} trade on a live order book, settle in 1ZE
            and carry platform fees. The two-minute guide covers how a
            unit works, what a limit order does and when money moves.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <Link
          href="/co-own/guide"
          className="pressable flex h-11 items-center justify-center rounded-md bg-brand text-body-emphasis font-semibold text-text-inverse hover:bg-brand-pressed"
        >
          Read the Co-Own guide
        </Link>
        <button
          type="button"
          onClick={onComplete}
          className="pressable flex h-11 items-center justify-center rounded-md text-body text-text-secondary hover:text-text-primary"
        >
          I understand — continue to trade
        </button>
      </div>
    </div>
  );
}
