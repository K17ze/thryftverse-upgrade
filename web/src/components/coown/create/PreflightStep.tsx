'use client';

/**
 * Step 0 — issuer verification preflight. Advisory read of the same
 * coown_issuer_verification_profile row the write enforces; every
 * non-passing state fails closed (denied or unavailable, never assumed).
 */

import { useRouter } from 'next/navigation';
import type { UseQueryResult } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  canIssueCoOwn,
  type IssuerVerification,
} from '@/lib/api/services/coownIssuance';

interface PreflightStepProps {
  query: UseQueryResult<IssuerVerification | null>;
}

function GatePanel({ children }: { children: React.ReactNode }) {
  // Flat hairline panel — the only bounded surface on the step, reserved
  // for the blocking verdict.
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border-subtle px-4 py-4">
      {children}
    </div>
  );
}

export function PreflightStep({ query }: PreflightStepProps) {
  const router = useRouter();
  const verification = query.data;

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-3" aria-busy aria-label="Checking issuer verification">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <GatePanel>
        <Icon name="warning" size={20} className="mt-0.5 shrink-0 text-text-muted" />
        <div className="min-w-0 flex-1">
          <p className="text-body-emphasis font-medium text-text-primary">
            Verification status unavailable
          </p>
          <p className="mt-1 text-body text-text-secondary">
            We couldn&apos;t confirm your issuer verification. Check your connection and
            retry — issuance stays locked until the check passes.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void query.refetch()}
            disabled={query.isRefetching}
          >
            {query.isRefetching ? 'Checking…' : 'Retry'}
          </Button>
        </div>
      </GatePanel>
    );
  }

  if (!canIssueCoOwn(verification)) {
    return (
      <GatePanel>
        <Icon name="lock" size={20} className="mt-0.5 shrink-0 text-text-muted" />
        <div className="min-w-0 flex-1">
          <p className="text-body-emphasis font-medium text-text-primary">
            Identity verification required
          </p>
          <p className="mt-1 text-body text-text-secondary">
            Issuing a Co-Own requires verified identity — it protects unit buyers and
            meets regulatory standards.
            {verification?.tier === 'email'
              ? ' Your account is email-verified; ID verification is the next tier.'
              : ''}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => router.push('/verification')}>
              Verify your identity
            </Button>
            <Button
              variant="quiet"
              size="sm"
              onClick={() => void query.refetch()}
              disabled={query.isRefetching}
            >
              {query.isRefetching ? 'Checking…' : 'Re-check status'}
            </Button>
          </div>
        </div>
      </GatePanel>
    );
  }

  return (
    <div className="flex items-center gap-3 border-b border-border-subtle pb-6">
      <Icon name="verified" size={20} filled className="shrink-0 text-success-text" />
      <div className="min-w-0 flex-1">
        <p className="text-body-emphasis font-medium text-text-primary">
          {verification?.tier === 'seller' ? 'Seller verified' : 'ID verified'}
        </p>
        <p className="mt-0.5 text-caption text-text-muted">
          Your account clears the issuer requirement — the check runs again on submit.
        </p>
      </div>
    </div>
  );
}
