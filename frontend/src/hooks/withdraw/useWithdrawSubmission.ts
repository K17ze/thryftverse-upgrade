import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { parseApiError } from '../../lib/apiClient';
import {
  createPayoutRequest,
  getIzeFxQuote,
  lookupPayoutByIdempotencyKey,
  type PayoutAccountPayload,
  type PayoutRequestPayload } from '../../services/walletApi';
import type { UserCountryCapabilities } from '../../services/capabilitiesApi';
import { useConnectivity } from '../useConnectivity';
import { useHaptic } from '../useHaptic';
import { useUnknownOutcomeReconciliation } from '../useUnknownOutcomeReconciliation';
import { useToast } from '../../context/ToastContext';
import { createStableId } from '../../utils/createStableId';
import { getDefaultWithdrawDisplayAmount } from '../../utils/currencyAuthoringFlows';
import { track } from '../../analytics';
import type { FxRates } from '../../utils/currency';
import type { SupportedCurrencyCode } from '../../constants/currencies';
import type { WithdrawStep, WithdrawSuccessData } from '../../components/withdraw/withdrawViewModels';

export interface UseWithdrawSubmissionOptions {
  userId: string | undefined;
  /** Withdrawal amount resolved to GBP (2dp). */
  numericAmount: number;
  /** Raw amount as entered in display currency (analytics metadata). */
  numericAmountDisplay: number;
  exceedsBalance: boolean;
  isConnectingPayout: boolean;
  payoutAccount: PayoutAccountPayload | null;
  currencyCode: SupportedCurrencyCode;
  fxRates: FxRates;
  availableBalance: number;
  setAvailableBalance: (balance: number) => void;
  setAmount: (amount: string) => void;
  ensurePayoutAccount: () => Promise<{
    account: PayoutAccountPayload;
    capabilities: UserCountryCapabilities | null;
  }>;
  loadWithdrawals: (userId: string) => Promise<void>;
}

/**
 * useWithdrawSubmission — owns the withdraw money-mutation state machine:
 * the form → confirm → success / unknown_outcome step transitions, the
 * idempotency key lifecycle, the payout-request submission (with FX quote
 * for non-GBP payout currencies) and unknown-outcome reconciliation when
 * the response is lost. The screen binds the returned step and handlers.
 */
export function useWithdrawSubmission({
  userId,
  numericAmount,
  numericAmountDisplay,
  exceedsBalance,
  isConnectingPayout,
  payoutAccount,
  currencyCode,
  fxRates,
  availableBalance,
  setAvailableBalance,
  setAmount,
  ensurePayoutAccount,
  loadWithdrawals,
}: UseWithdrawSubmissionOptions) {
  const navigation = useNavigation<any>();
  const { show } = useToast();
  const { isOffline } = useConnectivity();
  const haptic = useHaptic();
  const { reconcile } = useUnknownOutcomeReconciliation();

  const [step, setStep] = useState<WithdrawStep>('form');
  const [successData, setSuccessData] = useState<WithdrawSuccessData | null>(null);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  const canWithdraw =
    numericAmount > 0
    && !exceedsBalance
    && !isWithdrawing
    && !isConnectingPayout
    && payoutAccount?.status === 'active';

  const handleReview = useCallback(() => {
    if (!canWithdraw) {
      return;
    }
    haptic.patterns.save();
    setStep('confirm');
  }, [canWithdraw, haptic]);

  const handleBackToForm = useCallback(() => {
    haptic.light();
    setStep('form');
  }, [haptic]);

  const handleWithdraw = async () => {
    if (!canWithdraw) {
      return;
    }

    if (!userId) {
      show('Sign in to withdraw your balance.', 'error');
      navigation.navigate('AuthLanding');
      return;
    }
    const withdrawUserId = userId;

    haptic.patterns.save();
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = createStableId('payout');
    }
    const idempotencyKey = idempotencyKeyRef.current;
    setIsWithdrawing(true);
    try {
      const { account: payoutProfile, capabilities: activeCapabilities } = await ensurePayoutAccount();
      const amountGbp = Number(numericAmount.toFixed(2));

      if (!Number.isFinite(amountGbp) || amountGbp <= 0) {
        throw new Error('Enter a valid withdrawal amount.');
      }

      const payoutCurrency = payoutProfile.currency.toUpperCase();

      if (
        activeCapabilities
        && !activeCapabilities.payouts.supportedCurrencies?.includes(payoutCurrency)
      ) {
        throw new Error(
          `Payout currency ${payoutCurrency} is unavailable for your country policy. Update your payout account.`
        );
      }

      let payoutAmount = amountGbp;

      if (payoutCurrency !== 'GBP') {
        const fxQuote = await getIzeFxQuote({
          fromCurrency: 'GBP',
          toCurrency: payoutCurrency,
          amount: amountGbp });

        payoutAmount = Number(fxQuote.quote.convertedAmount.toFixed(2));
      }

      if (!Number.isFinite(payoutAmount) || payoutAmount <= 0) {
        throw new Error('Unable to resolve payout conversion right now.');
      }

      const payoutRequestInput =
        payoutCurrency === 'GBP'
          ? {
              payoutAccountId: payoutProfile.id,
              amountGbp,
              amountCurrency: 'GBP',
              idempotencyKey,
              metadata: {
                source: 'withdraw_screen_request',
                enteredDisplayAmount: numericAmountDisplay,
                enteredDisplayCurrency: currencyCode,
                payoutMode: 'sale_proceeds_only' } }
          : {
              payoutAccountId: payoutProfile.id,
              amount: payoutAmount,
              amountCurrency: payoutCurrency,
              idempotencyKey,
              metadata: {
                source: 'withdraw_screen_request',
                enteredDisplayAmount: numericAmountDisplay,
                enteredDisplayCurrency: currencyCode,
                payoutMode: 'sale_proceeds_only' } };

      track('withdrawal_initiated', { amount: amountGbp, currency: payoutCurrency });

      const payoutResponse = await createPayoutRequest(withdrawUserId, payoutRequestInput);

      const nextBalance = Number(Math.max(0, availableBalance - amountGbp).toFixed(2));
      setAvailableBalance(nextBalance);
      setAmount(getDefaultWithdrawDisplayAmount(nextBalance, currencyCode, fxRates).toFixed(2));

      setSuccessData({
        reference: payoutResponse.payoutRequest.providerPayoutRef ?? payoutResponse.payoutRequest.id,
        amountGbp,
        payoutCurrency,
        createdAt: payoutResponse.payoutRequest.createdAt });
      haptic.success();
      idempotencyKeyRef.current = null;
      setStep('success');
      // Refresh recent withdrawals so the new request appears with its
      // honest status (processing/pending) immediately.
      void loadWithdrawals(withdrawUserId);
    } catch (error) {
      const isNetworkError = isOffline || (error instanceof Error && /network|fetch|timeout/i.test(error.message));

      if (isNetworkError && idempotencyKey) {
        // Lost response during payout submission — the server may have
        // committed. Show unknown_outcome and poll for the authoritative
        // status instead of telling the user the payout failed (which
        // invites an unsafe retry that could create a duplicate).
        setStep('unknown_outcome');
        show('We are confirming your withdrawal. Please do not submit again.');

        const result = await reconcile<PayoutRequestPayload>({
          lookup: () => lookupPayoutByIdempotencyKey(withdrawUserId, idempotencyKey),
          onAcknowledged: (payoutRequest) => {
            setSuccessData({
              reference: payoutRequest.providerPayoutRef ?? payoutRequest.id,
              amountGbp: payoutRequest.amountGbp,
              payoutCurrency: payoutRequest.amountCurrency,
              createdAt: payoutRequest.createdAt });
            haptic.success();
            idempotencyKeyRef.current = null;
            setStep('success');
            void loadWithdrawals(withdrawUserId);
          },
          onSafeToRetry: () => {
            idempotencyKeyRef.current = null;
            setStep('form');
            show('No withdrawal was created. Please try again.', 'info');
          },
          onUnresolved: () => {
            // Keep the idempotency key so a manual retry doesn't create
            // a duplicate. The user can check their withdrawal history.
            setStep('form');
            show('We could not confirm your withdrawal. Check your history before retrying.', 'info');
          },
          shouldContinue: () => isMountedRef.current });

        if (result.outcome === 'acknowledged' || result.outcome === 'safe_to_retry' || result.outcome === 'unresolved') {
          return;
        }
      }

      const parsed = parseApiError(error, isNetworkError ? 'You appear to be offline. Check your connection and try again.' : 'Unable to submit withdrawal right now.');
      show(parsed.message, 'error');
      setStep('form');
    } finally {
      setIsWithdrawing(false);
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  return {
    step,
    successData,
    isWithdrawing,
    canWithdraw,
    handleReview,
    handleBackToForm,
    handleWithdraw,
  };
}
