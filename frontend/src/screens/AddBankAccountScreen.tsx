import React, { useEffect, useState } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { isPaymentMethodAllowed } from '../utils/capabilityPolicy';
import { getUserCountryCapabilities, UserCountryCapabilities } from '../services/capabilitiesApi';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { useScreenCaptureProtection } from '../platform/screenCapture';

/**
 * AddBankAccountScreen — reachable only via the `wallet/bank-account` deep
 * link. Truthful gate: ThryftVerse never collects raw bank details in-app.
 *
 * - Buyer payment methods are tokenised by the provider via
 *   POST /v2/payments/setup-intents, which is card-only
 *   (payment_method_types: ['card'] in routes/v2.ts) — bank accounts cannot
 *   be tokenised through that flow.
 * - The legacy POST /users/:userId/payment-methods endpoint this screen used
 *   to call returns 410 TOKENISED_PAYMENT_METHOD_REQUIRED.
 * - Payout bank details are collected by the payout provider's hosted
 *   onboarding (Stripe Connect), launched from the Withdraw screen via
 *   usePayoutAccountConnection — so the honest state points the user there.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'AddBankAccount'>;

export default function AddBankAccountScreen({ navigation }: Props) {
  useScreenCaptureProtection();
  const [isLoadingCapabilities, setIsLoadingCapabilities] = useState(true);
  const [capabilitiesLoadFailed, setCapabilitiesLoadFailed] = useState(false);
  const [countryCapabilities, setCountryCapabilities] = useState<UserCountryCapabilities | null>(null);
  // Bumping the nonce re-runs the capabilities fetch (error-state retry).
  const [retryNonce, setRetryNonce] = useState(0);
  const currentUser = useStore((state) => state.currentUser);

  useEffect(() => {
    let cancelled = false;

    const hydrateCapabilities = async () => {
      if (!currentUser?.id) {
        if (!cancelled) {
          setCountryCapabilities(null);
          setIsLoadingCapabilities(false);
        }
        return;
      }

      try {
        const capabilities = await getUserCountryCapabilities(currentUser.id);
        if (!cancelled) {
          setCountryCapabilities(capabilities);
          setCapabilitiesLoadFailed(false);
        }
      } catch {
        if (!cancelled) {
          // A failed fetch is not a policy verdict — surface the error
          // state with retry instead of the unsupported-region copy.
          setCountryCapabilities(null);
          setCapabilitiesLoadFailed(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingCapabilities(false);
        }
      }
    };

    setIsLoadingCapabilities(true);
    setCapabilitiesLoadFailed(false);
    void hydrateCapabilities();

    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, retryNonce]);

  const bankAllowed = isPaymentMethodAllowed(countryCapabilities, 'bank_account');

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Bank payouts"
          subtitle="For withdrawals"
          onBack={() => navigation.goBack()}
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      {isLoadingCapabilities ? (
        <FlagshipState variant="loading" />
      ) : capabilitiesLoadFailed ? (
        <FlagshipState
          variant="error"
          title="Couldn't check availability"
          subtitle="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => setRetryNonce((n) => n + 1)}
        />
      ) : !bankAllowed ? (
        <FlagshipState
          variant="empty"
          icon="ban-outline"
          title="Bank payouts unavailable"
          subtitle="Bank withdrawals unavailable in your region."
        />
      ) : (
        <FlagshipState
          variant="unavailable"
          icon="lock-closed-outline"
          title="Bank details are never entered here"
          subtitle="For your security, payout accounts are connected through our payment provider's secure onboarding — ThryftVerse never sees your account number or sort code."
          actionLabel="Set up payouts"
          onAction={() => navigation.navigate('Withdraw')}
          secondaryActionLabel="Go back"
          onSecondaryAction={() => navigation.goBack()}
        />
      )}
    </FlagshipScreen>
  );
}
