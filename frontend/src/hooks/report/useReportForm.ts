import { useState } from 'react';
import type { ReportReason } from '../../services/profileApi';
import { deriveCanSubmit } from '../../utils/reportLogic';

export interface UseReportFormParams {
  targetId: string | undefined;
  isSubmitting: boolean;
  isUploading: boolean;
}

export interface UseReportFormResult {
  selectedReason: ReportReason | null;
  setSelectedReason: (reason: ReportReason) => void;
  details: string;
  setDetails: (text: string) => void;
  canSubmit: boolean;
}

/** Reason + free-text details form state for ReportScreen. */
export function useReportForm({
  targetId,
  isSubmitting,
  isUploading,
}: UseReportFormParams): UseReportFormResult {
  const [selectedReason, setSelectedReason] =
    useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');

  const canSubmit = deriveCanSubmit({
    targetId,
    selectedReason,
    isSubmitting,
    isUploading,
  });

  return { selectedReason, setSelectedReason, details, setDetails, canSubmit };
}
