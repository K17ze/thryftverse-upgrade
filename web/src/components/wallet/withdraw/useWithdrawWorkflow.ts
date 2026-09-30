import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/Toast';
import { parseApiError } from '@/lib/api/http';
import * as payoutsService from '@/lib/api/services/payouts';
import { withdrawKeys } from '@/lib/hooks/withdraw/useWithdrawData';
import type { User } from '@/lib/contracts/domain';
import type { PayoutRequest } from '@/lib/data/fixtures';
import type { WalletData } from '../useWalletData';
import { walletKeys } from '../walletKeys';
import type { WalletLedgerEntry } from '../ledgerViewModel';
import { round2 } from '../convertViewModel';
import type { usePayoutAccounts } from './usePayoutAccounts';
import {
  canReview,
  destinationLabel,
  newPayoutReference,
  payoutPolicyHint,
  resolvePayoutAvailability,
  withdrawError,
  type PayoutDestination,
  type WithdrawStep,
  type WithdrawSuccessData,
} from './withdrawViewModel';
import type { WalletBalances, UserCountryCapabilities, StripeConnectStatusPayload } from '@/lib/api/services/payouts';

export const FIXTURE_STAGES = [
  'Reserving funds from your demo balance',
  'Recording your payout request',
  'Finishing up',
] as const;

export const LIVE_STAGES = [
  'Submitting your withdrawal request',
  'Confirming it was recorded',
] as const;

const STAGE_MS = 550;

interface UseWithdrawWorkflowOptions {
  user: User | null;
  isLive: boolean;
  data: WalletData | undefined;
  balances: WalletBalances | null | undefined;
  capabilities: UserCountryCapabilities | null | undefined;
  connectStatus: StripeConnectStatusPayload | null | undefined;
  payouts: ReturnType<typeof usePayoutAccounts>;
}

export function useWithdrawWorkflow({
  user,
  isLive,
  data,
  balances,
  capabilities,
  connectStatus,
  payouts,
}: UseWithdrawWorkflowOptions) {
  const queryClient = useQueryClient();
  const { show } = useToast();

  const {
    destinations,
    selectableDestinations,
    defaultDestination,
    refetch: refetchPayouts,
    recordRequest,
  } = payouts;

  const [step, setStep] = useState<WithdrawStep>('form');
  const [amount, setAmount] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [setupSheetOpen, setSetupSheetOpen] = useState(false);
  const [stage, setStage] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<WithdrawSuccessData | null>(null);

  const available = isLive ? (balances?.availableGbp ?? 0) : (data?.available ?? 0);
  const currency = data?.currency ?? 'GBP';
  const numericAmount = Number(amount) || 0;
  const hasPayoutMethod = selectableDestinations.length > 0;
  const error = withdrawError(numericAmount, available, hasPayoutMethod);
  const selected = destinations.find((a) => a.id === selectedId) ?? null;
  const reviewable = canReview(
    numericAmount,
    available,
    hasPayoutMethod && selected?.status === 'active',
    submitting,
  );

  const payoutAvailability = isLive
    ? resolvePayoutAvailability(capabilities ?? null, connectStatus ?? null)
    : 'available';
  const policyHint = isLive ? payoutPolicyHint(capabilities ?? null) : null;

  const idempotencyKeyRef = useRef<string | null>(null);
  useEffect(() => {
    idempotencyKeyRef.current = null;
  }, [numericAmount, selectedId]);

  useEffect(() => {
    if (amount === '' && available > 0 && (!isLive || balances != null)) {
      setAmount(available.toFixed(2));
    }
  }, [available, balances, isLive, amount]);

  useEffect(() => {
    if (selectableDestinations.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !selectableDestinations.some((a) => a.id === selectedId)) {
      const fallback =
        defaultDestination && selectableDestinations.some((d) => d.id === defaultDestination.id)
          ? defaultDestination
          : selectableDestinations[0];
      setSelectedId(fallback.id);
    }
  }, [selectableDestinations, defaultDestination, selectedId]);

  const commitFixture = (account: PayoutDestination, label: string) => {
    const createdAt = new Date().toISOString();
    const request: PayoutRequest = {
      id: `pw-${Date.now().toString(36)}`,
      reference: newPayoutReference(),
      accountId: account.id,
      destinationLabel: label,
      amountGbp: round2(numericAmount),
      currency,
      status: 'requested',
      createdAt,
    };

    recordRequest(request);
    queryClient.setQueryData<WalletData>(walletKeys.all(user?.id), (old) => {
      if (!old) return old;
      const entry: WalletLedgerEntry = {
        id: request.id,
        kind: 'withdrawal',
        amount: -request.amountGbp,
        status: 'pending',
        date: createdAt,
        description: `Withdrawal to ${label} (demo)`,
        balance: null,
      };
      return {
        ...old,
        available: round2(old.available - request.amountGbp),
        session: [entry, ...old.session],
      };
    });

    setResult({
      reference: request.reference,
      amountGbp: request.amountGbp,
      destinationLabel: label,
      createdAt,
    });
    setSubmitting(false);
    setStep('success');
    show('Withdrawal recorded — demo only, stored on this device', 'success');
  };

  const commitLive = async (account: PayoutDestination, label: string) => {
    if (!user?.id || account.accountId == null) {
      show('This payout method cannot receive withdrawals yet.', 'error');
      setSubmitting(false);
      setStep('form');
      return;
    }
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = payoutsService.newPayoutAttemptKey();
    }
    const idempotencyKey = idempotencyKeyRef.current;
    const amountGbp = round2(numericAmount);

    try {
      const res = await payoutsService.submitPayoutRequest(user.id, {
        payoutAccountId: account.accountId,
        amountGbp,
        idempotencyKey,
        metadata: {
          source: 'web_withdraw_screen',
          payoutMode: 'sale_proceeds_only',
        },
        onReconciling: () => setStage(1),
      });

      const debitedGbp = res.payoutRequest.amountGbp;
      const nextAvailable =
        res.sellerPayableAfterRequestGbp ?? round2(Math.max(0, available - debitedGbp));
      queryClient.setQueryData<WalletData>(walletKeys.all(user.id), (old) =>
        old ? { ...old, available: nextAvailable } : old,
      );
      queryClient.setQueryData<payoutsService.WalletBalances>(
        withdrawKeys.balances(user.id),
        (old) => (old ? { ...old, availableGbp: nextAvailable } : old),
      );
      void queryClient.invalidateQueries({ queryKey: walletKeys.root });
      void queryClient.invalidateQueries({ queryKey: withdrawKeys.balances(user.id) });
      void refetchPayouts();

      setResult({
        reference: res.payoutRequest.providerPayoutRef ?? res.payoutRequest.id,
        amountGbp: debitedGbp,
        destinationLabel: label,
        createdAt: res.payoutRequest.createdAt,
      });
      idempotencyKeyRef.current = null;
      setStep('success');
      show('Withdrawal requested — pending review', 'success');
    } catch (e) {
      const err =
        e instanceof payoutsService.PayoutRequestError
          ? e
          : new payoutsService.PayoutRequestError(
              parseApiError(e, 'Unable to submit the withdrawal right now.').message,
            );

      if (err.safeToRetry) {
        idempotencyKeyRef.current = null;
      } else if (err.outcomeUnknown) {
        show(err.message, 'info');
        setStep('form');
        return;
      } else {
        idempotencyKeyRef.current = null;
      }
      show(err.message, 'error');
      setStep('form');
    } finally {
      setSubmitting(false);
    }
  };

  const execute = () => {
    if (!reviewable || !selected) return;
    const destination = selected;
    const label = destinationLabel(destination);
    setStage(0);
    setSubmitting(true);
    setStep('submitting');

    if (isLive) {
      void commitLive(destination, label);
      return;
    }
    FIXTURE_STAGES.forEach((_, i) => {
      window.setTimeout(
        () => {
          if (i === FIXTURE_STAGES.length - 1) commitFixture(destination, label);
          else setStage(i + 1);
        },
        STAGE_MS * (i + 1),
      );
    });
  };

  const openAddFlow = () => (isLive ? setSetupSheetOpen(true) : setAddSheetOpen(true));

  return {
    step,
    setStep,
    amount,
    setAmount,
    selectedId,
    setSelectedId,
    addSheetOpen,
    setAddSheetOpen,
    setupSheetOpen,
    setSetupSheetOpen,
    stage,
    submitting,
    result,
    available,
    currency,
    numericAmount,
    error,
    selected,
    reviewable,
    payoutAvailability,
    policyHint,
    execute,
    openAddFlow,
    stages: isLive ? LIVE_STAGES : FIXTURE_STAGES,
  };
}
