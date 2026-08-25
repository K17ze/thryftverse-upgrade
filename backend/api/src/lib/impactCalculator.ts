import type { Pool } from 'pg';
import { calculateShippingEmissions } from './squakeClient.js';

export interface ImpactInput {
  material: string;
  weightKg: number;
  category: string;
  originLat?: number;
  originLng?: number;
  destLat?: number;
  destLng?: number;
  carrierMode?: 'air' | 'road' | 'rail' | 'sea';
  packagingType?: 'cardboard' | 'poly_mailer' | 'none';
}

export interface ImpactResult {
  co2eAvoidedKg: number;
  co2eProductionAvoidedKg: number;
  co2eEolAvoidedKg: number;
  co2eShippingKg: number;
  co2ePackagingKg: number;
  methodologyVersion: string;
  factorSources: string[];
}

export const METHODOLOGY_VERSION = '2026-08-v1';

const DEFAULT_SHIPPING_DISTANCE_KM = 800;
const DEFAULT_CARRIER_MODE = 'road' as const;
const DEFAULT_PACKAGING_TYPE = 'poly_mailer' as const;

const EARTH_RADIUS_KM = 6371;

interface EmissionsFactorRow {
  co2e_kg_per_kg: string;
  source: string;
}

function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

async function lookupFactor(
  db: Pool,
  factorType: 'production' | 'eol' | 'transport' | 'packaging',
  material: string,
): Promise<{ co2eKgPerKg: number; source: string } | null> {
  const result = await db.query<EmissionsFactorRow>(
    `SELECT co2e_kg_per_kg::text, source
     FROM emissions_factors
     WHERE factor_type = $1 AND material = $2
     ORDER BY effective_date DESC
     LIMIT 1`,
    [factorType, material],
  );
  if (!result.rowCount) {
    return null;
  }
  const value = Number(result.rows[0].co2e_kg_per_kg);
  if (!Number.isFinite(value)) {
    return null;
  }
  return { co2eKgPerKg: value, source: result.rows[0].source };
}

export async function calculateImpact(
  input: ImpactInput,
  db: Pool,
): Promise<ImpactResult | null> {
  if (!input.material || !Number.isFinite(input.weightKg) || input.weightKg <= 0) {
    return null;
  }

  const material = input.material.trim().toLowerCase();

  const productionFactor = await lookupFactor(db, 'production', material);
  const eolFactor = await lookupFactor(db, 'eol', material);
  if (!productionFactor || !eolFactor) {
    return null;
  }

  const co2eProductionAvoidedKg = input.weightKg * productionFactor.co2eKgPerKg;
  const co2eEolAvoidedKg = input.weightKg * eolFactor.co2eKgPerKg;

  const factorSources = new Set<string>();
  factorSources.add(productionFactor.source);
  factorSources.add(eolFactor.source);

  const carrierMode = input.carrierMode ?? DEFAULT_CARRIER_MODE;
  let distanceKm: number;
  if (
    Number.isFinite(input.originLat) &&
    Number.isFinite(input.originLng) &&
    Number.isFinite(input.destLat) &&
    Number.isFinite(input.destLng)
  ) {
    distanceKm = haversineDistanceKm(
      input.originLat!,
      input.originLng!,
      input.destLat!,
      input.destLng!,
    );
  } else {
    distanceKm = DEFAULT_SHIPPING_DISTANCE_KM;
  }

  let co2eShippingKg: number;
  const squakeResult = await calculateShippingEmissions({
    weightKg: input.weightKg,
    distanceKm,
    mode: carrierMode,
  });
  if (squakeResult) {
    co2eShippingKg = squakeResult.co2eKg;
    factorSources.add(squakeResult.source);
  } else {
    const transportFactor = await lookupFactor(db, 'transport', carrierMode);
    if (!transportFactor) {
      return null;
    }
    factorSources.add(transportFactor.source);
    co2eShippingKg = distanceKm * input.weightKg * transportFactor.co2eKgPerKg;
  }

  const packagingMaterial =
    input.packagingType && input.packagingType !== 'none'
      ? input.packagingType
      : DEFAULT_PACKAGING_TYPE;
  let co2ePackagingKg = 0;
  if (input.packagingType !== 'none') {
    const packagingFactor = await lookupFactor(db, 'packaging', packagingMaterial);
    if (!packagingFactor) {
      return null;
    }
    factorSources.add(packagingFactor.source);
    co2ePackagingKg = packagingFactor.co2eKgPerKg;
  }

  const co2eAvoidedKg =
    co2eProductionAvoidedKg + co2eEolAvoidedKg - co2eShippingKg - co2ePackagingKg;

  return {
    co2eAvoidedKg: roundTo(co2eAvoidedKg, 4),
    co2eProductionAvoidedKg: roundTo(co2eProductionAvoidedKg, 4),
    co2eEolAvoidedKg: roundTo(co2eEolAvoidedKg, 4),
    co2eShippingKg: roundTo(co2eShippingKg, 4),
    co2ePackagingKg: roundTo(co2ePackagingKg, 4),
    methodologyVersion: METHODOLOGY_VERSION,
    factorSources: Array.from(factorSources),
  };
}
