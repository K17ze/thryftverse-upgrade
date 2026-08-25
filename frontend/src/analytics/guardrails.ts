/**
 * Guardrail metric thresholds for ThryftVerse experimentation.
 *
 * These thresholds define the auto-kill boundaries for A/B experiments.
 * The auto-kill engine (a separate backend worker) reads these values
 * and monitors experiment arms against them in real time. If any arm
 * breaches a guardrail, the experiment is automatically stopped to
 * prevent user harm.
 *
 * Thresholds are intentionally conservative — a guardrail breach means
 * the experiment is causing measurable degradation to a core product
 * metric, and the cost of continuing outweighs the learning value.
 */

export const GUARDRAIL_METRICS = {
  crashRate: { threshold: 0.01, window: '24h' },
  appStartTime: { threshold: 3000, window: '24h' },
  day1Retention: { threshold: 0.4, window: '24h' },
  day7Retention: { threshold: 0.2, window: '7d' },
  day30Retention: { threshold: 0.1, window: '30d' },
  supportTicketVolume: { threshold: 100, window: '24h' },
  pushDeliveryRate: { threshold: 0.95, window: '24h' },
} as const;
