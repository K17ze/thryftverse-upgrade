// Web shim for @stripe/stripe-react-native
// The native module imports codegenNativeCommands which doesn't exist on web.
// This shim provides no-op stubs so the web bundle can build.
// On native platforms, the real module is used.

export const initStripe = () => {};
export const useStripe = () => ({
  confirmPayment: async () => ({ error: { message: 'Stripe not available on web' } }),
  createPaymentMethod: async () => ({ error: { message: 'Stripe not available on web' } }),
  retrievePaymentIntent: async () => ({ paymentIntent: null, error: { message: 'Stripe not available on web' } }),
  confirmSetupIntent: async () => ({ error: { message: 'Stripe not available on web' } }),
});
export const useConfirmSetup = () => ({ confirmSetupIntent: async () => ({ error: { message: 'Stripe not available on web' } }) });
export const useConfirmPayment = () => ({ confirmPayment: async () => ({ error: { message: 'Stripe not available on web' } }) });
export const createToken = async () => ({ error: { message: 'Stripe not available on web' } });

export const CardField = () => null;
export const StripeProvider = ({ children }: { children: React.ReactNode }) => children;
export const PaymentSheet = () => null;
export const ApplePayButton = () => null;
export const GooglePayButton = () => null;
export const AuBECSDebitForm = () => null;
export const CardForm = () => null;
export const PaymentMethodCreateParams = {};
export const createPaymentMethod = async () => ({ error: { message: 'Stripe not available on web' } });

export type Card = {
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
};

export type PaymentMethod = {
  id: string;
  type: string;
  card?: Card;
};

export type PaymentIntent = {
  id: string;
  clientSecret: string;
  status: string;
};

export type SetupIntent = {
  id: string;
  clientSecret: string;
  status: string;
};

export type StripeError = {
  code: string;
  message: string;
};
