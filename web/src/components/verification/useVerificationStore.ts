'use client';

/**
 * Verification store — the single source of truth for the demo KYC outcome.
 * Persisted to localStorage so /settings and /profile read the same status
 * across reloads. In fixture mode there is no backend, so this store plays
 * the role the compliance API plays on mobile — honestly labelled as a
 * simulated review, never presented as a real identity check.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Dac7TaxInfo } from '@/lib/contracts/verification';
import type { KycDocumentType, VerificationStatus } from './verificationModel';

/** What a submission remembers — document metadata only, never file data. */
export interface KycSubmissionRecord {
  fullName: string;
  dob: string;
  addressLine: string;
  city: string;
  postcode: string;
  documentType: KycDocumentType;
  documentName: string;
}

interface VerificationState {
  status: VerificationStatus;
  submittedAt: string | null;
  rejectionReason: string | null;
  /** Last submitted details — prefills the form on retry, shown on review. */
  record: KycSubmissionRecord | null;
  /**
   * Fixture-mode DAC7 record — the browser-local stand-in for the
   * compliance API's persisted tax info. Null until the seller saves it.
   */
  dac7: Dac7TaxInfo | null;

  submitVerification: (record: KycSubmissionRecord) => void;
  /** Simulated review tick — in_review → approved. */
  completeReview: () => void;
  /** Simulated decline — in_review → rejected with a human reason. */
  declineReview: (reason: string) => void;
  resetVerification: () => void;
  /** Fixture-mode DAC7 save — full record replaces the previous one. */
  saveDac7: (info: Dac7TaxInfo) => void;
}

export const useVerificationStore = create<VerificationState>()(
  persist(
    (set) => ({
      status: 'not_started',
      submittedAt: null,
      rejectionReason: null,
      record: null,
      dac7: null,

      submitVerification: (record) =>
        set({
          status: 'in_review',
          submittedAt: new Date().toISOString(),
          rejectionReason: null,
          record,
        }),
      completeReview: () =>
        set((s) => (s.status === 'in_review' ? { status: 'approved', rejectionReason: null } : s)),
      declineReview: (reason) =>
        set((s) =>
          s.status === 'in_review' ? { status: 'rejected', rejectionReason: reason } : s,
        ),
      resetVerification: () =>
        set({ status: 'not_started', submittedAt: null, rejectionReason: null, record: null }),
      saveDac7: (info) => set({ dac7: info }),
    }),
    {
      name: 'thryftverse.web.verification',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        status: s.status,
        submittedAt: s.submittedAt,
        rejectionReason: s.rejectionReason,
        record: s.record,
        dac7: s.dac7,
      }),
    },
  ),
);
