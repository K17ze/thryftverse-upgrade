import { useEffect, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';

import { parseApiError } from '../../lib/apiClient';
import {
  convertIzeToFiat,
  type ConvertQuotePayload } from '../../services/walletApi';
import { useConnectivity } from '../useConnectivity';
import { useHaptic } from '../useHaptic';
import { useToast } from '../../context/ToastContext';
import type { UseBiometricGateResult } from '../useBiometricGate';
import type { SupportedCurrencyCode } from '../../constants/currencies';
import type {
  ConversionResult,
  ConvertStep } from '../../components/wallet/convertViewModels';

export interface UseConvertSubmissionOptions {
  userId: string | undefined;
  izeValue: number;
  currencyCode: SupportedCurrencyCode;
  availableIze: number;
  setAvailableIze: (value: number) => void;
  exceedsBalance: boolean;
  isWalletOperational: boolean;
  quote: ConvertQuotePayload | null;
  isFetchingQuote: boolean;
  quoteError: boolean;
  biometricGate: UseBiometricGateResult;
}

/**
 * useConvertSubmission — owns the convert money-mutation state machine:
 * the amount → review → authenticating → executing → receipt / error step
 * transitions, the biometric auth gate, the idempotency-keyed
 * convert-1ze-to-fiat submission and the post-success balance update.
 * The screen binds the returned step and handlers. Mirrors
 * hooks/withdraw/useWithdrawSubmission.
 */
export function useConvertSubmission({
  userId,
  izeValue,
  currencyCode,
  availableIze,
  setAvailableIze,
  exceedsBalance,
  isWalletOperational,
  quote,
  isFetchingQuote,
  quoteError,
  biometricGate,
}: UseConvertSubmissionOptions) {
  const navigation = useNavigation<any>();
  const haptic = useHaptic();
  const { show } = useToast();
  const { isOffline } = useConnectivity();

  const [step, setStep] = useState<ConvertStep>('amount');
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  // Persisted across retries: the server replays a stored response for a
  // repeated (userId, 'convert_1ze_to_fiat', key) — so "Try again" after a
  // lost response cannot burn the balance a second time. Mirrors the
  // idempotency-key lifecycle in useWithdrawSubmission.
  const idempotencyKeyRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);
  // A changed amount/currency is a different request — the stored payload
  // hash would mismatch, so the key resets when the inputs do.
  useEffect(() => {
    idempotencyKeyRef.current = null;
  }, [izeValue, currencyCode]);

  const canReview =
    Number.isFinite(izeValue) &&
    izeValue > 0 &&
    !exceedsBalance &&
    !isExecuting &&
    isWalletOperational &&
    quote !== null &&
    !isFetchingQuote &&
    !quoteError;

  // -- Step transitions --
  const handleReview = () => {
    if (!canReview) {
      return;
    }
    haptic.medium();
    setStep('review');
  };

  const handleBackToAmount = () => {
    haptic.light();
    setStep('amount');
  };

  const handleConfirm = async () => {
    haptic.medium();
    // Trigger biometric authentication before execution.
    setStep('authenticating');
    const success = await biometricGate.authenticate('Authenticate to convert 1ZE');
    if (success) {
      void handleExecute();
    }
    // On failure, the authenticating step UI shows retry / cancel.
  };

  const handleRetryAuth = async () => {
    haptic.light();
    const success = await biometricGate.authenticate('Authenticate to convert 1ZE');
    if (success) {
      void handleExecute();
    }
  };

  const handleCancelAuth = () => {
    haptic.light();
    setStep('review');
  };

  const handleExecute = async () => {
    if (!userId) {
      show('Sign in to convert your 1ZE balance.', 'error');
      navigation.navigate('AuthLanding');
      return;
    }

    setStep('executing');
    setIsExecuting(true);
    try {
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `convert_${userId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      }
      const idempotencyKey = idempotencyKeyRef.current;

      const response = await convertIzeToFiat({
        userId,
        izeAmount: izeValue,
        fiatCurrency: currencyCode,
        idempotencyKey });

      const conversion = response.conversion;
      const nextAvailable = Math.max(0, availableIze - conversion.izeAmount);
      setAvailableIze(nextAvailable);

      setResult({
        izeAmount: conversion.izeAmount,
        fiatAmount: conversion.netFiatAmount,
        fiatCurrency: conversion.fiatCurrency,
        feeAmount: conversion.feeAmount,
        feeBps: conversion.feeBps,
        principalAmount: conversion.principalAmount,
        netRedemption: conversion.netFiatAmount,
        rateUsed: conversion.rateUsed,
        timestamp: new Date().toISOString() });

      haptic.success();
      idempotencyKeyRef.current = null;
      setStep('receipt');
    } catch (error) {
      const isNetworkError =
        isOffline ||
        (error instanceof Error && /network|fetch|timeout/i.test(error.message));
      // On a lost response the server may have committed — the idempotency
      // key is kept so Try again replays the stored result rather than
      // burning the balance twice, and the copy must not claim failure.
      const parsed = parseApiError(
        error,
        isNetworkError
          ? 'The connection dropped while converting. Try again — the same request will resume safely, or check your wallet history.'
          : 'Unable to convert 1ZE right now.'
      );
      setErrorMessage(parsed.message);
      haptic.error();
      setStep('error');
    } finally {
      if (isMountedRef.current) setIsExecuting(false);
    }
  };

  const handleTryAgain = () => {
    haptic.light();
    setErrorMessage('');
    setStep('review');
  };

  const handleCancelError = () => {
    haptic.light();
    setErrorMessage('');
    setStep('amount');
  };

  const handleDone = () => {
    haptic.light();
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Wallet');
    }
  };

  const handleBack = () => {
    if (isExecuting) {
      return; // Back disabled during execution
    }
    haptic.light();
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Wallet');
    }
  };

  return {
    step,
    result,
    errorMessage,
    isExecuting,
    canReview,
    handleReview,
    handleBackToAmount,
    handleConfirm,
    handleRetryAuth,
    handleCancelAuth,
    handleTryAgain,
    handleCancelError,
    handleDone,
    handleBack,
  };
}
