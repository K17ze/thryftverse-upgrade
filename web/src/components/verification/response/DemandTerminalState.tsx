'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { SellerVerificationDemand } from '@/lib/contracts/verification';
import { demandStatusMeta } from '../demandModel';
import { DemandShell } from './DemandResponsePrimitives';

export function DemandTerminalState({ demand }: { demand: SellerVerificationDemand }) {
  const router = useRouter();
  const meta = demandStatusMeta(demand.status);
  const copy =
    demand.status === 'expired'
      ? 'The deadline for this verification request has passed. Recourse may have been triggered.'
      : demand.status === 'failed'
        ? 'This verification was marked as failed. Recourse has been triggered.'
        : 'This verification request is no longer pending.';

  return (
    <DemandShell>
      <div className="flex flex-col items-center py-12 text-center" aria-live="polite">
        <Icon name={meta.icon} size={36} className="text-text-muted" />
        <h2 className="mt-5 text-section-title font-semibold text-text-primary">
          {demand.status === 'expired' ? 'Deadline passed' : meta.label}
        </h2>
        <p className="mt-1.5 max-w-sm text-body text-text-secondary">{copy}</p>
        <div className="mt-8 flex w-full max-w-sm flex-col gap-2.5">
          <Button
            variant="secondary"
            size="md"
            fullWidth
            onClick={() => router.push(`/co-own/${demand.assetId}`)}
          >
            View asset
          </Button>
          <Link
            href="/verification/demands"
            className="pressable flex h-11 items-center justify-center rounded-md text-body font-medium text-text-secondary hover:text-text-primary"
          >
            Back to requests
          </Link>
        </div>
      </div>
    </DemandShell>
  );
}
