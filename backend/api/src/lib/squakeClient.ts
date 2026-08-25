export interface SquakeShipmentInput {
  weightKg: number;
  distanceKm: number;
  mode: 'air' | 'road' | 'rail' | 'sea';
}

export interface SquakeEmissionsResult {
  co2eKg: number;
  source: string;
}

const SQUAKE_API_URL = 'https://api.squake.earth/v1/emissions';

export async function calculateShippingEmissions(
  input: SquakeShipmentInput,
): Promise<SquakeEmissionsResult | null> {
  const apiKey = process.env.SQUAKE_API_KEY;
  if (!apiKey) {
    return null;
  }

  const response = await fetch(SQUAKE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      weightKg: input.weightKg,
      distanceKm: input.distanceKm,
      mode: input.mode,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json() as { co2eKg?: number; source?: string };
  if (typeof data.co2eKg !== 'number' || !Number.isFinite(data.co2eKg)) {
    return null;
  }

  return {
    co2eKg: data.co2eKg,
    source: data.source ?? 'Squake API',
  };
}
