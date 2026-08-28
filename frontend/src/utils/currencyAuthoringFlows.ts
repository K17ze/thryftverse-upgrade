import { SupportedCurrencyCode } from '../constants/currencies';
import { FxRates, toFiat, toIze } from './currency';

const COMMERCE_PLATFORM_CHARGE_RATE = 0.05;
const COMMERCE_PLATFORM_CHARGE_FIXED_GBP = 0.7;
const COMMERCE_PLATFORM_CHARGE_MIN_RATE = 0.02;

export function sanitizeDecimalInput(rawValue: string): string {
  const normalized = rawValue.replace(',', '.').replace(/[^0-9.]/g, '');
  const firstDot = normalized.indexOf('.');

  if (firstDot === -1) {
    return normalized;
  }

  return normalized.slice(0, firstDot + 1) + normalized.slice(firstDot + 1).replace(/\./g, '');
}

export function sanitizeIntegerInput(rawValue: string): string {
  return rawValue.replace(/\D/g, '');
}

export function convertGbpToDisplayAmount(
  amountGbp: number,
  currencyCode: SupportedCurrencyCode,
  fxRates: Partial<FxRates>
): number {
  if (currencyCode === 'GBP') {
    return amountGbp;
  }

  const amountIze = toIze(amountGbp, 'GBP', fxRates);
  return toFiat(amountIze, currencyCode, fxRates);
}

export function convertDisplayToGbpAmount(
  amountDisplay: number,
  currencyCode: SupportedCurrencyCode,
  fxRates: Partial<FxRates>
): number {
  if (currencyCode === 'GBP') {
    return amountDisplay;
  }

  const amountIze = toIze(amountDisplay, currencyCode, fxRates);
  return toFiat(amountIze, 'GBP', fxRates);
}

/**
 * Convert a display-currency amount to USD.
 * With the at-par model (1 1ZE = $1.00 USD), the USD amount equals the 1ZE
 * amount, so this is equivalent to `toIze(amountDisplay, currencyCode, fxRates)`.
 */
export function convertDisplayToUsdAmount(
  amountDisplay: number,
  currencyCode: SupportedCurrencyCode,
  fxRates: Partial<FxRates>
): number {
  if (currencyCode === 'USD') {
    return amountDisplay;
  }

  const amountIze = toIze(amountDisplay, currencyCode, fxRates);
  return toFiat(amountIze, 'USD', fxRates);
}

export function calculatePlatformChargeGbp(subtotalGbp: number): number {
  const normalizedSubtotal = Number.isFinite(subtotalGbp) ? Math.max(0, subtotalGbp) : 0;
  const formulaCharge =
    normalizedSubtotal * COMMERCE_PLATFORM_CHARGE_RATE + COMMERCE_PLATFORM_CHARGE_FIXED_GBP;
  const minimumCharge = normalizedSubtotal * COMMERCE_PLATFORM_CHARGE_MIN_RATE;
  return Number(Math.max(formulaCharge, minimumCharge).toFixed(2));
}

export function getSuggestedBidDisplayAmount(
  currentBidGbp: number,
  currencyCode: SupportedCurrencyCode,
  fxRates: Partial<FxRates>
): number {
  const minStep = Math.max(1, Number((currentBidGbp * 0.03).toFixed(2)));
  const suggestedBidGbp = Number((currentBidGbp + minStep).toFixed(2));
  const suggestedDisplay = convertGbpToDisplayAmount(suggestedBidGbp, currencyCode, fxRates);

  return Number.isFinite(suggestedDisplay)
    ? Number(suggestedDisplay.toFixed(2))
    : suggestedBidGbp;
}

export interface OfferSummary {
  offerGbp: number;
  platformChargeGbp: number;
  buyerProtectionFeeGbp: number;
  totalGbp: number;
}

export function calculateOfferSummaryFromDisplay(
  offerDisplay: number,
  currencyCode: SupportedCurrencyCode,
  fxRates: Partial<FxRates>
): OfferSummary {
  const offerGbpRaw = convertDisplayToGbpAmount(offerDisplay, currencyCode, fxRates);
  const offerGbp = Number.isFinite(offerGbpRaw) && offerGbpRaw > 0 ? offerGbpRaw : 0;
  const platformChargeGbp = calculatePlatformChargeGbp(offerGbp);
  const totalGbp = Number((offerGbp + platformChargeGbp).toFixed(2));

  return {
    offerGbp,
    platformChargeGbp,
    buyerProtectionFeeGbp: platformChargeGbp,
    totalGbp,
  };
}

export function getDefaultWithdrawDisplayAmount(
  availableBalanceGbp: number,
  currencyCode: SupportedCurrencyCode,
  fxRates: Partial<FxRates>
): number {
  const displayAmount = convertGbpToDisplayAmount(availableBalanceGbp, currencyCode, fxRates);

  return Number.isFinite(displayAmount)
    ? Number(displayAmount.toFixed(2))
    : Number(availableBalanceGbp.toFixed(2));
}