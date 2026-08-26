import { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '../lib/apiClient';

export type ExperimentStatus = 'draft' | 'running' | 'paused' | 'completed' | 'killed';
export type ExperimentDecision = 'ship' | 'hold' | 'kill' | 'iterate';

export interface ExperimentVariant {
  key: string;
  name: string;
  description?: string;
}

export interface Experiment {
  experiment_id: string;
  flag_key: string;
  name: string;
  hypothesis: string;
  primary_metric: string;
  guardrail_metrics: string[];
  secondary_metrics: string[];
  variants: ExperimentVariant[];
  sample_size?: number;
  min_detectable_effect?: number;
  start_date?: string;
  end_date?: string;
  status: ExperimentStatus;
  created_by?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  decision?: ExperimentDecision;
  decision_reason?: string;
  decision_by?: string;
  decided_at?: string;
}

export interface GuardrailCheckResult {
  metric: string;
  value: number | null;
  threshold: number;
  breached: boolean;
  comparison: 'lt' | 'gt';
  details: Record<string, unknown>;
}

export interface GuardrailCheckResponse {
  ok: boolean;
  results: GuardrailCheckResult[];
  any_breached: boolean;
  recommendation: 'continue' | 'pause' | 'kill';
  auto_killed: boolean;
}

export interface CreateExperimentInput {
  experiment_id: string;
  flag_key: string;
  name: string;
  hypothesis: string;
  primary_metric: string;
  guardrail_metrics?: string[];
  secondary_metrics?: string[];
  variants?: ExperimentVariant[];
  sample_size?: number;
  min_detectable_effect?: number;
  start_date?: string;
  end_date?: string;
}

export interface UpdateExperimentInput {
  name?: string;
  hypothesis?: string;
  primary_metric?: string;
  guardrail_metrics?: string[];
  secondary_metrics?: string[];
  variants?: ExperimentVariant[];
  sample_size?: number;
  min_detectable_effect?: number;
  start_date?: string;
  end_date?: string;
  status?: ExperimentStatus;
  decision?: ExperimentDecision;
  decision_reason?: string;
}

export async function fetchExperiments(status?: ExperimentStatus): Promise<Experiment[]> {
  const path = status ? `/experiments?status=${encodeURIComponent(status)}` : '/experiments';
  const result = await fetchJson<{ ok: boolean; experiments: Experiment[] }>(path);
  return result.experiments;
}

export async function fetchExperiment(
  experimentId: string,
): Promise<Experiment & { guardrail_checks: GuardrailCheckResult[] }> {
  const result = await fetchJson<{ ok: boolean; experiment: Experiment; guardrail_checks: GuardrailCheckResult[] }>(
    `/experiments/${encodeURIComponent(experimentId)}`,
  );
  return { ...result.experiment, guardrail_checks: result.guardrail_checks };
}

export async function createExperiment(input: CreateExperimentInput): Promise<Experiment> {
  const result = await fetchJson<{ ok: boolean; experiment: Experiment }>('/experiments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return result.experiment;
}

export async function updateExperiment(
  experimentId: string,
  input: UpdateExperimentInput,
): Promise<Experiment> {
  const result = await fetchJson<{ ok: boolean; experiment: Experiment }>(
    `/experiments/${encodeURIComponent(experimentId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return result.experiment;
}

export async function checkExperimentGuardrails(
  experimentId: string,
): Promise<GuardrailCheckResponse> {
  return fetchJson<GuardrailCheckResponse>(
    `/experiments/${encodeURIComponent(experimentId)}/guardrails/check`,
    { method: 'POST' },
  );
}

interface ExperimentDetail extends Experiment {
  guardrail_checks: GuardrailCheckResult[];
}

export function useExperiment(experimentId: string | null): {
  experiment: ExperimentDetail | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const [experiment, setExperiment] = useState<ExperimentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refetchCount, setRefetchCount] = useState(0);

  const refetch = useCallback(() => setRefetchCount((c) => c + 1), []);

  useEffect(() => {
    if (!experimentId) {
      setExperiment(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchExperiment(experimentId)
      .then((data) => {
        if (!cancelled) {
          setExperiment(data);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [experimentId, refetchCount]);

  return { experiment, loading, error, refetch };
}

export function useExperiments(status?: ExperimentStatus): {
  experiments: Experiment[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refetchCount, setRefetchCount] = useState(0);

  const refetch = useCallback(() => setRefetchCount((c) => c + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchExperiments(status)
      .then((data) => {
        if (!cancelled) {
          setExperiments(data);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [status, refetchCount]);

  return { experiments, loading, error, refetch };
}
