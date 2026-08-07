import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { initStripe } from '@stripe/stripe-react-native';

let configuredPublishableKey: string | null = null;

export function getStripeReturnUrl(): string {
  return Constants.appOwnership === 'expo'
    ? Linking.createURL('/--/payments/return')
    : Linking.createURL('payments/return');
}

export async function configureStripeMobile(publishableKey: string): Promise<void> {
  const normalizedKey = publishableKey.trim();
  if (!/^pk_(?:test|live)_[A-Za-z0-9]+/.test(normalizedKey)) {
    throw new Error('Stripe publishable key is unavailable.');
  }
  if (configuredPublishableKey === normalizedKey) return;

  const merchantIdentifier =
    process.env.EXPO_PUBLIC_STRIPE_APPLE_MERCHANT_IDENTIFIER?.trim() || undefined;
  await initStripe({
    publishableKey: normalizedKey,
    merchantIdentifier,
    urlScheme: getStripeReturnUrl(),
    setReturnUrlSchemeOnAndroid: true,
  });
  configuredPublishableKey = normalizedKey;
}
