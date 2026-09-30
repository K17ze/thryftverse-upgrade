'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { formatDate } from '@/lib/utils/format';
import type { SellerVerificationDemand } from '@/lib/contracts/verification';
import { DemandShell } from './DemandResponsePrimitives';

export function DemandResponseReceipt({ demand }: { demand: SellerVerificationDemand }) {
  const router = useRouter();

  return (
    <DemandShell>
      <div className="flex flex-col items-center py-12 text-center" aria-live="polite">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success-subtle">
          <Icon name="check" filled size={30} className="text-success-text" />
        </span>
        <h2 className="mt-5 text-section-title font-semibold text-text-primary">
          Evidence submitted
        </h2>
        <p className="mt-1.5 max-w-sm text-body text-text-secondary">
          The buyer has been notified. You&apos;ll be informed of the platform&apos;s verdict.
        </p>

        {demand.evidenceUrl ? (
          <div className="mt-6 flex w-full max-w-sm items-center gap-3 rounded-lg border border-border-subtle bg-surface p-3 text-left">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={demand.evidenceUrl}
              alt="Submitted evidence"
              className="h-14 w-14 rounded-md object-cover"
            />
            <div className="min-w-0">
              <p className="text-label text-text-muted">Evidence submitted</p>
              <p className="mt-0.5 text-caption text-text-secondary">
                {demand.respondedAt ? formatDate(demand.respondedAt) : ''}
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-8 flex w-full max-w-sm flex-col gap-2.5">
          <Button
            variant="primary"
            size="md"
            fullWidth
            onClick={() => router.push('/verification/demands')}
          >
            Back to requests
          </Button>
          <Link
            href={`/co-own/${demand.assetId}`}
            className="pressable flex h-11 items-center justify-center rounded-md text-body font-medium text-text-secondary hover:text-text-primary"
          >
            View asset
          </Link>
        </div>
      </div>
    </DemandShell>
  );
}
