'use client';

/**
 * WithdrawView — payout orchestrator: amount composer → destination selector
 * → confirmation modal → progress tracker → success receipt.
 * Web port of the mobile WithdrawScreen state machine.
 *
 * Factored into domain components (<400 LOC standard):
 *  - WithdrawSkeleton
 *  - WithdrawSuccessReceipt
 *  - WithdrawConfirmCard
 *  - WithdrawSubmitting
 *  - WithdrawDestinationsSection
 *  - WithdrawRecentRequests
 *  - WithdrawAmountSection
 *  - WithdrawStickyFooter
 *  - useWithdrawWorkflow
 */

import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/Toast';
import { useWithdrawData } from '@/lib/hooks/withdraw/useWithdrawData';
import { useSession } from '@/lib/session/SessionProvider';
import { useWalletData } from '../useWalletData';
import { AddBankAccountSheet } from './AddBankAccountSheet';
import { PayoutSetupSheet } from './PayoutSetupSheet';
import { usePayoutAccounts } from './usePayoutAccounts';

// Domain components
import { WithdrawSkeleton } from './WithdrawSkeleton';
import { WithdrawSuccessReceipt } from './WithdrawSuccessReceipt';
import { WithdrawConfirmCard } from './WithdrawConfirmCard';
import { WithdrawSubmitting } from './WithdrawSubmitting';
import { WithdrawDestinationsSection } from './WithdrawDestinationsSection';
import { WithdrawRecentRequests } from './WithdrawRecentRequests';
import { WithdrawAmountSection } from './WithdrawAmountSection';
import { WithdrawStickyFooter } from './WithdrawStickyFooter';
import { useWithdrawWorkflow } from './useWithdrawWorkflow';

export function WithdrawView() {
  const router = useRouter();
  const { show } = useToast();
  const { data, isLoading, isError, refetch } = useWalletData();
  const { user, isGuest, sessionLoading } = useSession();
  const payouts = usePayoutAccounts();
  const {
    mode,
    destinations,
    requests,
    isLoading: payoutsLoading,
    isError: payoutsError,
    requestsError,
    refetch: refetchPayouts,
    fixtureAccounts,
    addAccount,
  } = payouts;
  const isLive = mode === 'live';
  const {
    balances,
    isHydratingBalance,
    balanceError,
    reloadBalance,
    capabilities,
    connectStatus,
  } = useWithdrawData();

  const workflow = useWithdrawWorkflow({
    user,
    isLive,
    data,
    balances,
    capabilities,
    connectStatus,
    payouts,
  });

  if (sessionLoading || isLoading || payoutsLoading || isHydratingBalance) {
    return <WithdrawSkeleton />;
  }

  if (isGuest) {
    return (
      <EmptyState
        icon="wallet"
        title="Sign in to withdraw"
        subtitle="Payouts are tied to your account and balance."
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

  if (workflow.step === 'success' && workflow.result) {
    return <WithdrawSuccessReceipt result={workflow.result} isLive={isLive} />;
  }

  if (workflow.step === 'submitting') {
    return (
      <WithdrawSubmitting
        numericAmount={workflow.numericAmount}
        selected={workflow.selected}
        stage={workflow.stage}
        stages={workflow.stages}
      />
    );
  }

  if (workflow.step === 'confirm' && workflow.selected) {
    return (
      <WithdrawConfirmCard
        numericAmount={workflow.numericAmount}
        selected={workflow.selected}
        onExecute={workflow.execute}
        onBack={() => workflow.setStep('form')}
      />
    );
  }

  const recentRequests = requests.slice(0, 3);
  const nothingAvailable = workflow.available <= 0;

  if (isLive && balanceError) {
    return (
      <div className="mx-auto w-full max-w-xl pb-10 lg:max-w-2xl">
        <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
          <IconButton
            name="back"
            aria-label="Back to wallet"
            onClick={() => router.push('/wallet')}
          />
          <h1 className="text-screen-title text-text-primary">Withdraw</h1>
        </div>
        <EmptyState
          compact
          icon="wallet"
          title={balanceError}
          subtitle="Your funds are safe — this is a read failure, not a missing balance."
          actionLabel="Try again"
          onAction={reloadBalance}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl pb-10 lg:max-w-2xl">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <IconButton name="back" aria-label="Back to wallet" onClick={() => router.push('/wallet')} />
        <h1 className="text-screen-title text-text-primary">Withdraw</h1>
      </div>

      {nothingAvailable ? (
        <EmptyState
          compact
          icon="wallet"
          title="Nothing to withdraw yet"
          subtitle="Money from your sales lands here once orders are delivered."
          actionLabel="Back to wallet"
          onAction={() => router.push('/wallet')}
        />
      ) : (
        <>
          {/* Amount composer */}
          <WithdrawAmountSection
            available={workflow.available}
            currency={workflow.currency}
            amount={workflow.amount}
            onAmountChange={workflow.setAmount}
            numericAmount={workflow.numericAmount}
            error={workflow.error}
          />

          {/* Transfer to destination */}
          <WithdrawDestinationsSection
            destinations={destinations}
            selectedId={workflow.selectedId}
            policyHint={workflow.policyHint}
            payoutsError={payoutsError}
            isLive={isLive}
            payoutAvailability={workflow.payoutAvailability}
            connectStatus={connectStatus}
            onSelectDestination={workflow.setSelectedId}
            onOpenAddFlow={workflow.openAddFlow}
            onRefetchPayouts={() => void refetchPayouts()}
          />

          {/* Recent withdrawals */}
          <WithdrawRecentRequests
            recentRequests={recentRequests}
            requestsError={requestsError}
            onRefetchPayouts={() => void refetchPayouts()}
          />

          {/* Sticky footer with ETA and review CTA */}
          <WithdrawStickyFooter
            isLive={isLive}
            reviewable={workflow.reviewable}
            error={workflow.error}
            numericAmount={workflow.numericAmount}
            payoutAvailability={workflow.payoutAvailability}
            destinationsCount={destinations.length}
            onReview={() => workflow.setStep('confirm')}
          />
        </>
      )}

      {isLive ? (
        <PayoutSetupSheet
          open={workflow.setupSheetOpen}
          onClose={() => workflow.setSetupSheetOpen(false)}
          onReady={() => show('Your payout method is ready.', 'success')}
        />
      ) : (
        <AddBankAccountSheet
          open={workflow.addSheetOpen}
          onClose={() => workflow.setAddSheetOpen(false)}
          accounts={fixtureAccounts}
          onSave={(input) => {
            const account = addAccount(input);
            workflow.setSelectedId(account.id);
            show(`${account.bankName} •••• ${account.last4} saved`, 'success');
          }}
        />
      )}
    </div>
  );
}
