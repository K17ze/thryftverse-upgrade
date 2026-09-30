'use client';

/**
 * ExchangeView — fiat ↔ fiat converter orchestrator for multi-currency wallet.
 * Web port of mobile's WalletExchangeScreen, structured into domain components:
 * ExchangeFormSection, ExchangeReviewSheet, ExchangeExecuting, ExchangeReceipt,
 * and useExchangeWorkflow.
 */

import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { DATA_MODE } from '@/lib/api/client';
import { formatMinorAmount } from '@/lib/api/services/fx';
import { useOnlineStatus } from '@/lib/offline/useOnlineStatus';
import { useSession } from '@/lib/session/SessionProvider';
import { ExchangeReceipt } from './exchange/ExchangeReceipt';
import { ExchangeExecuting } from './exchange/ExchangeExecuting';
import { ExchangeReviewSheet } from './exchange/ExchangeReviewSheet';
import { ExchangeFormSection } from './exchange/ExchangeFormSection';
import { ExchangeSkeleton } from './exchange/ExchangeSkeleton';
import { useExchangeWorkflow, sanitizeAmountInput } from './exchange/useExchangeWorkflow';

export function ExchangeView() {
  const { user, isGuest, sessionLoading } = useSession();
  const { isOffline } = useOnlineStatus();
  const isLive = DATA_MODE === 'live';

  const workflow = useExchangeWorkflow({ user, isLive, isOffline });

  if (sessionLoading || (workflow.isHydrating && workflow.pockets === null)) {
    return <ExchangeSkeleton />;
  }

  if (isGuest) {
    return (
      <EmptyState
        icon="wallet"
        title="Sign in to exchange"
        subtitle="Currency exchange moves between your own funded pockets."
        actionLabel="Sign in"
        onAction={workflow.handleBack}
      />
    );
  }

  if (workflow.balanceError && workflow.pockets === null) {
    return (
      <EmptyState
        icon="wallet"
        title="Balances unavailable"
        subtitle="We couldn't load your currency pockets. Check your connection and try again."
        actionLabel="Retry"
        onAction={() => workflow.setBalanceNonce((n) => n + 1)}
      />
    );
  }

  if (workflow.step === 'receipt' && workflow.result) {
    return (
      <ExchangeReceipt
        result={workflow.result}
        isLive={isLive}
        onExchangeAgain={workflow.resetFlow}
      />
    );
  }

  if (workflow.step === 'executing') {
    return (
      <ExchangeExecuting
        sourceCurrency={workflow.sourceCurrency}
        targetCurrency={workflow.targetCurrency}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl pb-16 lg:max-w-2xl">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <IconButton name="back" aria-label="Back to wallet" onClick={workflow.handleBack} />
        <div>
          <h1 className="text-screen-title text-text-primary">Exchange</h1>
          <p className="text-caption text-text-secondary">Move between your currency pockets</p>
        </div>
      </div>

      {isOffline && (
        <p className="mx-4 mt-4 flex items-center gap-2 border-b border-border-subtle bg-danger-subtle px-4 py-3 text-caption text-text-primary sm:mx-6">
          <Icon name="warning" size={15} className="shrink-0 text-danger-text" />
          You&apos;re offline — exchange is unavailable until you reconnect.
        </p>
      )}

      {/* Available balance hero */}
      <section aria-label="Available balance" className="px-4 pt-6 sm:px-6">
        <p className="text-label text-text-muted">Available in {workflow.sourceCurrency}</p>
        <p className="tnum mt-2 text-display-large font-bold tracking-tight text-text-primary">
          {formatMinorAmount(workflow.sourceBalanceMinor, workflow.sourceCurrency)}
        </p>
      </section>

      {/* Main exchange form section */}
      <ExchangeFormSection
        sourceCurrency={workflow.sourceCurrency}
        targetCurrency={workflow.targetCurrency}
        sourceCodes={workflow.sourceCodes}
        sourceBalanceMinor={workflow.sourceBalanceMinor}
        amount={workflow.amount}
        amountMajor={workflow.amountMajor}
        amountMinorStr={workflow.amountMinorStr}
        exceedsBalance={workflow.exceedsBalance}
        isFetchingQuote={workflow.isFetchingQuote}
        quoteError={workflow.quoteError}
        quote={workflow.quote}
        rateValueLabel={workflow.rateValueLabel}
        rateObservedLabel={workflow.rateObservedLabel}
        quoteExpiryLabel={workflow.quoteExpiryLabel}
        isQuoteExpired={workflow.isQuoteExpired}
        canReview={workflow.canReview}
        step={workflow.step}
        errorMessage={workflow.errorMessage}
        isLive={isLive}
        onSelectSource={workflow.handleSelectSource}
        onSelectTarget={workflow.handleSelectTarget}
        onSwap={workflow.handleSwap}
        onChangeAmount={(raw) => workflow.setAmount(sanitizeAmountInput(raw, workflow.sourceCurrency))}
        onRetryQuote={workflow.handleRetryQuote}
        onReview={() => workflow.setStep('review')}
        onSetStep={workflow.setStep}
      />

      {/* Review sheet modal */}
      <ExchangeReviewSheet
        open={workflow.step === 'review'}
        onClose={() => workflow.setStep('compose')}
        quote={workflow.quote}
        sourceCurrency={workflow.sourceCurrency}
        targetCurrency={workflow.targetCurrency}
        rateValueLabel={workflow.rateValueLabel}
        rateObservedLabel={workflow.rateObservedLabel}
        quoteExpiryLabel={workflow.quoteExpiryLabel}
        isQuoteExpired={workflow.isQuoteExpired}
        isFetchingQuote={workflow.isFetchingQuote}
        isLive={isLive}
        onRetryQuote={workflow.handleRetryQuote}
        onExecute={() => void workflow.handleExecute()}
      />

      {!isLive && (
        <p className="mt-10 flex items-center gap-1.5 px-4 text-caption text-text-muted sm:px-6">
          <Icon name="info" size={14} className="shrink-0" />
          Fixture mode — exchanges are simulated against demo pockets and static demo rates. No money moves.
        </p>
      )}
    </div>
  );
}
