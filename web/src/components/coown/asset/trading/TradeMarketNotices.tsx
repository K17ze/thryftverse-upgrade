'use client';

/**
 * TradeMarketNotices — state notices for halted, delisted, and preview-tier co-owned assets.
 * Contains PausedNotice, DelistedPanel, and PreviewPanel with recourse agreement signature.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { CoOwnAsset } from '@/lib/contracts/coown';
import { useSignCoOwnRecourse } from '@/lib/hooks/coown-queries';
import { RecourseTerms } from '../../RecourseTerms';

export function PausedNotice({ exitUnderway }: { exitUnderway: boolean }) {
  return (
    <div
      role="status"
      className="rounded-lg border border-warning-border bg-warning-subtle p-4"
    >
      <div className="flex items-center gap-2">
        <Icon name="pause" size={18} className="text-warning-text" />
        <p className="text-body-emphasis font-semibold text-warning-text">
          {exitUnderway ? 'Exit underway' : 'Trading paused'}
        </p>
      </div>
      <p className="mt-2 text-body text-text-secondary">
        {exitUnderway
          ? 'This asset is exiting. Units redeem from the sale proceeds — no further trades.'
          : 'Orders are paused on this market. Your position and resting orders are unaffected.'}
      </p>
    </div>
  );
}

export function DelistedPanel() {
  return (
    <div
      role="status"
      className="rounded-lg border border-border-subtle p-4"
    >
      <p className="text-body-emphasis font-semibold text-text-primary">
        Delisted
      </p>
      <p className="mt-2 text-body text-text-secondary">
        This market has been removed from public listing. Existing
        positions and the issuer&rsquo;s recourse obligation still stand
        — the holding ledger below keeps the record.
      </p>
    </div>
  );
}

export function PreviewPanel({
  asset,
  isIssuer,
}: {
  asset: CoOwnAsset;
  isIssuer: boolean;
}) {
  const [accepted, setAccepted] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const signRecourse = useSignCoOwnRecourse(asset.id);

  if (!isIssuer) {
    return (
      <div
        role="status"
        className="rounded-lg border border-border-subtle p-4"
      >
        <p className="text-body-emphasis font-semibold text-text-primary">
          Not live yet
        </p>
        <p className="mt-2 text-body text-text-secondary">
          The issuer hasn&rsquo;t signed the recourse agreement — units
          can&rsquo;t be bought or sold until they do.
        </p>
      </div>
    );
  }

  const sign = async () => {
    if (!accepted || signRecourse.isPending) return;
    setSignError(null);
    try {
      await signRecourse.mutateAsync({ personalGuarantee: true });
    } catch (err) {
      setSignError(
        err instanceof Error ? err.message : 'Signing failed — try again',
      );
    }
  };

  return (
    <div className="rounded-lg border border-border-subtle p-4">
      <p className="text-body-emphasis font-semibold text-text-primary">
        Your market is unsigned
      </p>
      <p className="mt-2 text-body text-text-secondary">
        One signature left — the recourse agreement — before units can
        trade. You keep custody of the item and are personally liable for
        it.
      </p>
      <div className="mt-4">
        <RecourseTerms
          asset={asset}
          accepted={accepted}
          onAccept={(v: boolean) => {
            setAccepted(v);
            setSignError(null);
          }}
        />
      </div>
      {signError ? (
        <p role="alert" className="mt-3 text-meta text-danger-text">
          {signError}
        </p>
      ) : null}
      <Button
        className="mt-4 w-full"
        onClick={() => void sign()}
        disabled={!accepted || signRecourse.isPending}
      >
        {signRecourse.isPending ? 'Signing…' : 'Sign and take live'}
      </Button>
    </div>
  );
}
