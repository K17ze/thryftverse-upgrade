import type { Pool } from 'pg';

export const GUARDRAIL_DEFINITIONS = {
  crash_rate: {
    name: 'crash_rate',
    threshold: 0.01,
    comparison: 'lt' as const,
    window: '24h',
    source: 'sentry',
    description: 'Crash rate must remain below 1%',
  },
  app_start_time: {
    name: 'app_start_time',
    threshold: 3000,
    comparison: 'lt' as const,
    window: '24h',
    source: 'sentry',
    description: 'App cold start must remain below 3 seconds',
  },
  day1_retention: {
    name: 'day1_retention',
    threshold: 0.4,
    comparison: 'gt' as const,
    window: '24h',
    source: 'posthog',
    description: 'Day 1 retention must remain above 40%',
  },
  day7_retention: {
    name: 'day7_retention',
    threshold: 0.2,
    comparison: 'gt' as const,
    window: '7d',
    source: 'posthog',
    description: 'Day 7 retention must remain above 20%',
  },
  day30_retention: {
    name: 'day30_retention',
    threshold: 0.1,
    comparison: 'gt' as const,
    window: '30d',
    source: 'posthog',
    description: 'Day 30 retention must remain above 10%',
  },
  support_ticket_volume: {
    name: 'support_ticket_volume',
    threshold: 100,
    comparison: 'lt' as const,
    window: '24h',
    source: 'backend',
    description: 'Support ticket volume must remain below 100 per 24h',
  },
  push_delivery_rate: {
    name: 'push_delivery_rate',
    threshold: 0.95,
    comparison: 'gt' as const,
    window: '24h',
    source: 'backend',
    description: 'Push delivery rate must remain above 95%',
  },
} as const;

export type GuardrailMetricName = keyof typeof GUARDRAIL_DEFINITIONS;
export type GuardrailComparison = 'lt' | 'gt';

export interface GuardrailResult {
  metric: string;
  value: number | null;
  threshold: number;
  breached: boolean;
  comparison: GuardrailComparison;
  details: Record<string, unknown>;
}

export function evaluateGuardrail(
  metricName: GuardrailMetricName,
  value: number | null,
): GuardrailResult {
  const def = GUARDRAIL_DEFINITIONS[metricName];
  if (value === null) {
    return {
      metric: metricName,
      value: null,
      threshold: def.threshold,
      breached: false,
      comparison: def.comparison,
      details: { reason: 'metric_unavailable' },
    };
  }
  const breached = def.comparison === 'lt' ? value >= def.threshold : value <= def.threshold;
  return {
    metric: metricName,
    value,
    threshold: def.threshold,
    breached,
    comparison: def.comparison,
    details: {},
  };
}

export async function evaluateExperimentGuardrails(
  db: Pool,
  experimentId: string,
  guardrailMetricNames: string[],
): Promise<{
  results: GuardrailResult[];
  anyBreached: boolean;
  recommendation: 'continue' | 'pause' | 'kill';
}> {
  const results: GuardrailResult[] = [];
  for (const metricName of guardrailMetricNames) {
    if (metricName in GUARDRAIL_DEFINITIONS) {
      const result = evaluateGuardrail(metricName as GuardrailMetricName, null);
      results.push(result);
    }
  }
  const anyBreached = results.some((r) => r.breached);
  const anyUnavailable = results.some((r) => r.value === null);
  const recommendation = anyBreached ? 'kill' : anyUnavailable ? 'pause' : 'continue';
  return { results, anyBreached, recommendation };
}

export async function persistGuardrailCheck(
  db: Pool,
  experimentId: string,
  results: GuardrailResult[],
  actionTaken: string,
): Promise<void> {
  for (const result of results) {
    await db.query(
      `INSERT INTO experiment_guardrail_checks
         (experiment_id, metric_name, metric_value, threshold, breached, action_taken, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        experimentId,
        result.metric,
        result.value,
        result.threshold,
        result.breached,
        actionTaken,
        JSON.stringify(result.details),
      ],
    );
  }
}
