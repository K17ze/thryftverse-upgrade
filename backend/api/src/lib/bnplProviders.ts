/**
 * BNPL (Buy Now, Pay Later) providers — Klarna, Clearpay (Afterpay), Affirm.
 *
 * Klarna is routed through Mollie (already integrated) or directly via
 * the Klarna Payments API.
 * Clearpay/Afterpay is routed via Stripe Sources or direct API.
 * Affirm is routed via Stripe or direct API.
 *
 * This module provides BNPL intent creation and availability checks.
 */

export type BnplType = 'klarna' | 'clearpay' | 'affirm';

export interface BnplIntentInput {
  type: BnplType;
  intentId: string;
  amount: number;
  currency: string;
  returnUrl: string;
  metadata: Record<string, unknown>;
}

export interface BnplIntentResult {
  providerIntentRef: string;
  checkoutUrl: string | null;
  initialStatus: 'requires_confirmation';
  providerStatus: string;
  scaExpiresAt: string;
}

export interface BnplInstallmentPlan {
  installmentCount: number;
  installmentAmount: number;
  firstInstallmentAmount: number;
  totalAmount: number;
  apr: number;
}

/**
 * Get available BNPL providers for a country/currency corridor.
 * Klarna: EU + US. Clearpay: UK + AU + US. Affirm: US + CA.
 */
export function getAvailableBnplForCorridor(country: string, currency: string): BnplType[] {
  const c = country.toUpperCase();
  const cur = currency.toUpperCase();
  const bnpls: BnplType[] = [];

  // Klarna: EU + US
  if (['GB', 'DE', 'NL', 'BE', 'AT', 'SE', 'FI', 'DK', 'NO', 'US'].includes(c) || cur === 'EUR' || cur === 'USD' || cur === 'GBP') {
    bnpls.push('klarna');
  }

  // Clearpay (Afterpay): UK + AU + US
  if (['GB', 'AU', 'US', 'CA', 'NZ'].includes(c) || cur === 'GBP' || cur === 'AUD' || cur === 'USD') {
    bnpls.push('clearpay');
  }

  // Affirm: US + CA
  if (['US', 'CA'].includes(c) || cur === 'USD' || cur === 'CAD') {
    bnpls.push('affirm');
  }

  return bnpls;
}

/**
 * Compute the installment plan for a BNPL provider.
 * Klarna: 4 installments (Pay in 4). Clearpay: 4 installments (25% each).
 * Affirm: variable terms (3/6/12 months).
 */
export function computeBnplInstallmentPlan(type: BnplType, totalAmount: number): BnplInstallmentPlan {
  switch (type) {
    case 'klarna':
    case 'clearpay': {
      // Pay in 4: 25% at purchase, 25% every 2 weeks
      const installmentAmount = roundTo(totalAmount / 4, 2);
      return {
        installmentCount: 4,
        installmentAmount,
        firstInstallmentAmount: installmentAmount,
        totalAmount,
        apr: 0,
      };
    }
    case 'affirm': {
      // Affirm: 3-month plan at 0-30% APR (simplified to 10% for display)
      const installmentCount = 3;
      const apr = 10;
      const monthlyRate = apr / 100 / 12;
      const payment = roundTo(
        (totalAmount * monthlyRate * Math.pow(1 + monthlyRate, installmentCount))
        / (Math.pow(1 + monthlyRate, installmentCount) - 1),
        2
      );
      return {
        installmentCount,
        installmentAmount: payment,
        firstInstallmentAmount: payment,
        totalAmount: roundTo(payment * installmentCount, 2),
        apr,
      };
    }
  }
}

function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
