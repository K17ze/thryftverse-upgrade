import { useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { parseApiError } from '../../lib/apiClient';
import {
  createPayoutAccount,
  createStripeConnectAccount,
  createStripeConnectOnboardingLink,
  getStripeConnectStatus,
  listPayoutAccounts,
  type PayoutAccountPayload } from '../../services/walletApi';
import { getUserCountryCapabilities, type UserCountryCapabilities } from '../../services/capabilitiesApi';
import { useToast } from '../../context/ToastContext';
import { t } from '../../i18n';

export interface UsePayoutAccountConnectionOptions {
  userId: string | undefined;
  countryCapabilities: UserCountryCapabilities | null;
  setCountryCapabilities: (capabilities: UserCountryCapabilities | null) => void;
  payoutAccount: PayoutAccountPayload | null;
  setPayoutAccount: (account: PayoutAccountPayload | null) => void;
}

/**
 * usePayoutAccountConnection — owns the Stripe Connect payout-profile
 * flow: capability resolution, Connect account creation, onboarding-link
 * handoff and payout-account sync. Exposes `ensurePayoutAccount` for the
 * withdrawal submission path and `handleConnectPayout` for the
 * "Transfer to" row / setup CTA.
 */
export function usePayoutAccountConnection({
  userId,
  countryCapabilities,
  setCountryCapabilities,
  payoutAccount,
  setPayoutAccount,
}: UsePayoutAccountConnectionOptions) {
  const { show } = useToast();
  const [isConnectingPayout, setIsConnectingPayout] = useState(false);

  const ensureCapabilities = async (): Promise<UserCountryCapabilities | null> => {
    if (!userId) {
      return null;
    }

    if (countryCapabilities) {
      return countryCapabilities;
    }

    try {
      const fetchedCapabilities = await getUserCountryCapabilities(userId);
      setCountryCapabilities(fetchedCapabilities);
      return fetchedCapabilities;
    } catch {
      return null;
    }
  };

  const connectOrSyncPayoutAccount = async (
    resolvedCapabilities: UserCountryCapabilities | null
  ): Promise<PayoutAccountPayload> => {
    if (!userId) {
      throw new Error('Sign in to connect a payout profile.');
    }

    const gatewayPriority = resolvedCapabilities?.payouts?.gatewayPriority ?? ['stripe_americas'];
    if (!gatewayPriority.includes('stripe_americas')) {
      throw new Error('A verified payout provider is not available for your country policy right now.');
    }

    let connectStatus = await getStripeConnectStatus(userId);
    if (!connectStatus.hasConnectAccount) {
      await createStripeConnectAccount(userId);
      connectStatus = await getStripeConnectStatus(userId);
    }

    if (!connectStatus.payoutsEnabled) {
      const { onboardingUrl } = await createStripeConnectOnboardingLink(userId);
      await WebBrowser.openBrowserAsync(onboardingUrl);
      connectStatus = await getStripeConnectStatus(userId);
    }

    if (!connectStatus.payoutsEnabled) {
      throw new Error(
        t('withdraw.error.payoutSetupIncomplete')
      );
    }

    const accounts = await listPayoutAccounts(userId);
    let activeAccount =
      accounts.find(
        (account) =>
          account.gatewayId === 'stripe_americas'
          && account.status === 'active'
      ) ?? null;

    if (!activeAccount) {
      activeAccount = await createPayoutAccount(userId, {
        gatewayId: 'stripe_americas',
        currency: 'GBP',
        countryCode:
          resolvedCapabilities?.effectiveCountryCode
          ?? resolvedCapabilities?.countryCode
          ?? 'GB',
        metadata: {
          source: 'withdraw_screen_stripe_connect_sync',
          capabilityPolicyVersion: resolvedCapabilities?.policyVersion ?? null } });
    }

    if (activeAccount.status !== 'active') {
      throw new Error(t('withdraw.error.payoutsNotEnabled'));
    }

    setPayoutAccount(activeAccount);
    return activeAccount;
  };

  const ensurePayoutAccount = async (): Promise<{
    account: PayoutAccountPayload;
    capabilities: UserCountryCapabilities | null;
  }> => {
    if (!userId) {
      throw new Error('Sign in to withdraw your balance.');
    }

    const resolvedCapabilities = await ensureCapabilities();

    if (payoutAccount && payoutAccount.status === 'active') {
      return {
        account: payoutAccount,
        capabilities: resolvedCapabilities };
    }

    const existingAccounts = await listPayoutAccounts(userId);
    const activeAccount =
      existingAccounts.find((account) => account.status === 'active') ?? null;

    if (activeAccount) {
      setPayoutAccount(activeAccount);
      return {
        account: activeAccount,
        capabilities: resolvedCapabilities };
    }

    const createdAccount = await connectOrSyncPayoutAccount(resolvedCapabilities);
    return {
      account: createdAccount,
      capabilities: resolvedCapabilities };
  };

  const handleConnectPayout = async () => {
    if (!userId || isConnectingPayout) {
      return;
    }

    setIsConnectingPayout(true);
    try {
      const capabilities = await ensureCapabilities();
      await connectOrSyncPayoutAccount(capabilities);
      show('Your verified payout profile is ready.', 'success');
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to connect your payout profile right now.');
      show(parsed.message, 'error');
    } finally {
      setIsConnectingPayout(false);
    }
  };

  return {
    isConnectingPayout,
    ensurePayoutAccount,
    handleConnectPayout,
  };
}
