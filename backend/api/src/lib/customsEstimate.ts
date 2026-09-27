import { countryToJurisdictionGroups, normalizeCountryCode } from './compliance.js';

export interface CustomsAssessment {
  crossBorder: boolean;
  sameCustomsTerritory: boolean;
  sellerCountry: string | null;
  buyerCountry: string;
  dutiesEstimateGbp: { low: number; high: number } | null;
  note: string | null;
}

type CorridorRule = {
  deMinimisGbp: number;
  belowThresholdRate: number;
  aboveThresholdRate: number;
};

const UPPER_BOUND_NOTE =
  'Estimate band only — actual duties and import taxes are set by destination customs and collected by the carrier on delivery.';

const CORRIDOR_RULES: Record<string, CorridorRule> = {
  'UK>EU': { deMinimisGbp: 135, belowThresholdRate: 0.2, aboveThresholdRate: 0.32 },
  'EU>UK': { deMinimisGbp: 120, belowThresholdRate: 0.2, aboveThresholdRate: 0.32 },
  '>US': { deMinimisGbp: 615, belowThresholdRate: 0, aboveThresholdRate: 0.16 },
  DEFAULT: { deMinimisGbp: 0, belowThresholdRate: 0.3, aboveThresholdRate: 0.4 },
};

function inEu(countryCode: string): boolean {
  return countryToJurisdictionGroups(countryCode).includes('EU');
}

function isUk(countryCode: string): boolean {
  return countryCode === 'GB' || countryCode === 'UK';
}

function sameCustomsTerritory(sellerCountry: string, buyerCountry: string): boolean {
  if (sellerCountry === buyerCountry) {
    return true;
  }
  if (isUk(sellerCountry) && isUk(buyerCountry)) {
    return true;
  }
  return inEu(sellerCountry) && inEu(buyerCountry);
}

function corridorRule(sellerCountry: string, buyerCountry: string): CorridorRule {
  if (isUk(sellerCountry) && inEu(buyerCountry)) {
    return CORRIDOR_RULES['UK>EU'];
  }
  if (inEu(sellerCountry) && isUk(buyerCountry)) {
    return CORRIDOR_RULES['EU>UK'];
  }
  if (buyerCountry === 'US') {
    return CORRIDOR_RULES['>US'];
  }
  return CORRIDOR_RULES.DEFAULT;
}

export function assessCustomsExposure(input: {
  sellerCountry: string | null | undefined;
  buyerCountry: string | null | undefined;
  declaredValueGbp: number | null | undefined;
}): CustomsAssessment {
  const buyerCountry = normalizeCountryCode(input.buyerCountry);
  const sellerCountry = input.sellerCountry ? normalizeCountryCode(input.sellerCountry) : null;

  const base: CustomsAssessment = {
    crossBorder: false,
    sameCustomsTerritory: true,
    sellerCountry,
    buyerCountry,
    dutiesEstimateGbp: null,
    note: null,
  };

  if (!sellerCountry || sellerCountry === buyerCountry) {
    return base;
  }

  if (sameCustomsTerritory(sellerCountry, buyerCountry)) {
    return base;
  }

  const value = input.declaredValueGbp;
  if (!value || !Number.isFinite(value) || value <= 0) {
    return {
      ...base,
      crossBorder: true,
      sameCustomsTerritory: false,
      note: 'Cross-border order — import duties and taxes may apply and are collected by the carrier on delivery.',
    };
  }

  const rule = corridorRule(sellerCountry, buyerCountry);
  const rate = value <= rule.deMinimisGbp ? rule.belowThresholdRate : rule.aboveThresholdRate;
  const high = Math.round(value * rate * 100) / 100;

  return {
    crossBorder: true,
    sameCustomsTerritory: false,
    sellerCountry,
    buyerCountry,
    dutiesEstimateGbp: { low: 0, high },
    note: UPPER_BOUND_NOTE,
  };
}
