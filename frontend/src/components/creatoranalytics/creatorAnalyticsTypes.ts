import type { AnalyticsPeriod } from '../../services/creatorAnalyticsApi';

export type PeriodKey = AnalyticsPeriod;

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days' };
