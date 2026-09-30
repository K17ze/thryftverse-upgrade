'use client';

/**
 * Convert surface — 1ZE ⇄ fiat. Mirrors the mobile wallet flows:
 * amount → review sheet → executing → receipt.
 *
 * Factored into domain components (<400 LOC standard):
 *  - ConvertBalanceSection
 *  - ConvertFormSection
 *  - ConvertReviewSheet
 *  - ConvertReceipt
 *  - useConvertWorkflow
 */

import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { DATA_MODE } from '@/lib/api/client';
import { useSession } from '@/lib/session/SessionProvider';
import { useWalletData } from './useWalletData';
import { ConvertReceipt } from './ConvertReceipt';
import { ConvertReviewSheet } from './ConvertReviewSheet';
import { ConvertBalanceSection } from './ConvertBalanceSection';
import { ConvertFormSection } from './ConvertFormSection';
import { useConvertWorkflow } from './useConvertWorkflow';

function ConvertSkeleton() {
  return (
    <div aria-busy aria-label="Loading convert" className="mx-auto w-full max-w-xl lg:max-w-2xl">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <Skeleton className="h-11 w-11 rounded-full" />
        <Skeleton className="h-7 w-32" />
      </div>
      <div className="px-4 pt-8 sm:px-6">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="mt-3 h-12 w-52" />
        <div className="mt-6 flex flex-col gap-3">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="mt-8 px-4 sm:px-6">
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="mt-6 h-24 w-full rounded-lg" />
        <Skeleton className="mt-6 h-[52px] w-full rounded-md" />
      </div>
    </div>
  );
}

export function ConvertView() {
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useWalletData();
  const { user, isGuest, sessionLoading } = useSession();
  const isLive = DATA_MODE === 'live';

  const workflow = useConvertWorkflow({ data, user, isLive });

  if (sessionLoading || isLoading) return <ConvertSkeleton />;

  if (isGuest) {
    return (
      <EmptyState
        icon="wallet"
        title="Sign in to convert"
        subtitle="Conversions move between your fiat balance and 1ZE."
        actionLabel="Sign in"
        onAction={() => router.push('/auth')}
      />
    );
  }

  if (isError || !data) {
    return (
      <EmptyState
        icon="wallet"
        title="Wallet unavailable"
        subtitle="We couldn't load your balance. Check your connection and try again."
        actionLabel="Retry"
        onAction={() => void refetch()}
      />
    );
  }

  if (isLive && !data.ize) {
    return (
      <EmptyState
        icon="wallet"
        title="1ZE balance unavailable"
        subtitle="We couldn't load your 1ZE position. Check your connection and try again."
        actionLabel="Retry"
        onAction={() => void refetch()}
      />
    );
  }

  if (workflow.step === 'receipt' && workflow.result) {
    return (
      <ConvertReceipt
        result={workflow.result}
        pocketCurrency={workflow.pocketCurrency}
        isLive={isLive}
        newIzeBalance={workflow.newIzeBalance}
        available={data.available}
        settledIze={workflow.ize.settled}
        onDone={() => router.push('/wallet')}
        onConvertAgain={workflow.resetFlow}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl pb-16 lg:max-w-2xl">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <IconButton name="back" aria-label="Back to wallet" onClick={() => router.push('/wallet')} />
        <div>
          <h1 className="text-screen-title text-text-primary">Instant Convert</h1>
          <p className="text-caption text-text-secondary">
            {isLive
              ? `Between your ${workflow.pocketCurrency} balance and 1ZE`
              : 'Real-time zero-slippage liquidity exchange'}
          </p>
        </div>
      </div>

      <ConvertBalanceSection
        settledLabel={workflow.settledLabel}
        direction={workflow.direction}
        ize={workflow.ize}
        data={data}
        isLive={isLive}
        fiatPocket={workflow.fiatPocket}
        pocketCurrency={workflow.pocketCurrency}
      />

      <ConvertFormSection
        direction={workflow.direction}
        setDirection={workflow.setDirection}
        amount={workflow.amount}
        setAmount={workflow.setAmount}
        maxAmount={workflow.maxAmount}
        pocketExp={workflow.pocketExp}
        isLive={isLive}
        pocketCurrency={workflow.pocketCurrency}
        exceeds={workflow.exceeds}
        numericAmount={workflow.numericAmount}
        directionSupported={workflow.directionSupported}
        pocketsQueryError={workflow.pocketsQuery.isError}
        onRetryPockets={() => void workflow.pocketsQuery.refetch()}
        quote={workflow.quote}
        quoteLoading={workflow.quoteLoading}
        quoteError={workflow.quoteError}
        onRetryQuote={() => workflow.setQuoteNonce((n) => n + 1)}
        quoteRateLabel={workflow.quoteRateLabel}
        secondsRemaining={workflow.secondsRemaining}
        step={workflow.step}
        setStep={workflow.setStep}
        errorMessage={workflow.errorMessage}
        onReview={() => workflow.setReviewing(true)}
        onSetPercentage={workflow.setPercentage}
      />

      <ConvertReviewSheet
        open={workflow.reviewing && workflow.quote != null}
        onClose={() => workflow.setReviewing(false)}
        quote={workflow.quote}
        direction={workflow.direction}
        numericAmount={workflow.numericAmount}
        pocketCurrency={workflow.pocketCurrency}
        quoteRateLabel={workflow.quoteRateLabel}
        isLive={isLive}
        step={workflow.step}
        onExecute={workflow.execute}
      />

      {isLive ? null : (
        <p className="mt-10 flex items-center gap-1.5 px-4 text-caption text-text-muted sm:px-6">
          <Icon name="info" size={14} className="shrink-0" />
          Fixture mode — conversions are simulated for design review. No money moves.
        </p>
      )}
    </div>
  );
}
