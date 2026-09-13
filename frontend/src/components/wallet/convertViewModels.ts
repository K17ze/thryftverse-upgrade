export type ConvertStep =
  | 'amount'
  | 'review'
  | 'authenticating'
  | 'executing'
  | 'receipt'
  | 'error';

export interface ConversionResult {
  izeAmount: number;
  fiatAmount: number;
  fiatCurrency: string;
  feeAmount: number;
  feeBps: number;
  principalAmount: number;
  netRedemption: number;
  rateUsed: number;
  timestamp: string;
}

// -- Step indicator --
export const CONVERT_STEP_LABELS = ['Amount', 'Review', 'Auth', 'Done'];

export function getConvertActiveStepIndex(step: ConvertStep): number {
  return step === 'amount'
    ? 0
    : step === 'review'
      ? 1
      : step === 'authenticating' || step === 'executing'
        ? 2
        : step === 'receipt' || step === 'error'
          ? 3
          : 0;
}
