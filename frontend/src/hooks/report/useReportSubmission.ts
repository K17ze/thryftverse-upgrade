import { useCallback, useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { track } from '../../analytics';
import { formatSubmittedAt } from '../../utils/reportLogic';
import type { ReportReason } from '../../services/profileApi';

export interface ReportSubmitContext {
  targetId: string;
  reason: ReportReason;
}

export interface UseReportSubmissionResult {
  isSubmitting: boolean;
  isSubmitted: boolean;
  reportId: string | null;
  submittedAt: string | null;
  /**
   * Runs the caller-supplied report API dispatch, owns the submitting /
   * submitted lifecycle, failure toast and `report_submitted` tracking.
   * Resolves `true` when the report was accepted.
   */
  submit: (
    execute: () => Promise<{ reportId: string }>,
    ctx: ReportSubmitContext,
  ) => Promise<boolean>;
}

/** Submission lifecycle state for ReportScreen. */
export function useReportSubmission(): UseReportSubmissionResult {
  const { show } = useToast();
  const { t } = useAppTranslation('report');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);

  const submit = useCallback(
    async (
      execute: () => Promise<{ reportId: string }>,
      ctx: ReportSubmitContext,
    ): Promise<boolean> => {
      setIsSubmitting(true);
      try {
        const result = await execute();
        setReportId(result.reportId);
        setSubmittedAt(formatSubmittedAt());
        setIsSubmitted(true);
        track('report_submitted', { target_id: ctx.targetId, reason: ctx.reason });
        return true;
      } catch {
        show(t('toast.reportFailed'), 'error');
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [show, t],
  );

  return { isSubmitting, isSubmitted, reportId, submittedAt, submit };
}
