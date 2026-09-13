import React from 'react';
import { useStore } from '../../store/useStore';
import {
  fetchKycStatus,
  fetchDac7TaxInfo,
  type Dac7TaxInfo,
  type KycStatus } from '../../services/complianceApi';

export interface UseVerificationStatusResult {
  /** Email confirmation flag derived from the signed-in user record. */
  emailVerified: boolean;
  /** True while the initial backend compliance status load is in flight. */
  isStatusLoading: boolean;
  /** Backend-authoritative KYC status (null until loaded). */
  kycStatus: KycStatus | null;
  /** Persisted DAC7 tax info (null until loaded / never provided). */
  dac7Info: Dac7TaxInfo | null;
  /** Backend says identity is verified. */
  kycVerified: boolean;
  /** Backend says identity verification is under review. */
  kycPending: boolean;
  /** DAC7 tax info exists on the backend. */
  dac7Completed: boolean;
  /** Raw DAC7 lifecycle status, when present. */
  dac7Status: Dac7TaxInfo['status'] | null;
  /** Re-fetch KYC status from the backend (used after session creation). */
  refreshKycStatus: () => Promise<void>;
  /** Apply a freshly saved DAC7 record to local backend-status state. */
  applyDac7Info: (info: Dac7TaxInfo) => void;
}

/**
 * Loads the real backend compliance status on mount and derives the
 * screen-level truth flags.
 *
 * §11 truthfulness: verification status must be backend-authoritative.
 * Local coOwnCompliance.kycVerified is a stale cache that can outlive a
 * revocation — never use it to grant a verified badge.
 */
export function useVerificationStatus(): UseVerificationStatusResult {
  const currentUser = useStore((state) => state.currentUser);

  const emailVerified = currentUser?.emailVerified ?? false;

  const [kycStatus, setKycStatus] = React.useState<KycStatus | null>(null);
  const [dac7Info, setDac7Info] = React.useState<Dac7TaxInfo | null>(null);
  const [isStatusLoading, setIsStatusLoading] = React.useState(true);

  React.useEffect(() => {
    if (!currentUser?.id) {
      setIsStatusLoading(false);
      return;
    }
    let cancelled = false;
    const loadStatus = async () => {
      try {
        const [kycRes, dac7Res] = await Promise.all([
          fetchKycStatus(currentUser.id).catch(() => null),
          fetchDac7TaxInfo(currentUser.id).catch(() => null),
        ]);
        if (cancelled) return;
        if (kycRes?.kycStatus) setKycStatus(kycRes.kycStatus);
        if (dac7Res?.taxInfo) setDac7Info(dac7Res.taxInfo);
      } catch {
        // Non-critical — fall back to local state
      } finally {
        if (!cancelled) setIsStatusLoading(false);
      }
    };
    void loadStatus();
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  const refreshKycStatus = React.useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const statusRes = await fetchKycStatus(currentUser.id);
      setKycStatus(statusRes.kycStatus);
    } catch {
      // Non-critical
    }
  }, [currentUser?.id]);

  const applyDac7Info = React.useCallback((info: Dac7TaxInfo) => {
    setDac7Info(info);
  }, []);

  return {
    emailVerified,
    isStatusLoading,
    kycStatus,
    dac7Info,
    kycVerified: kycStatus?.status === 'verified',
    kycPending: kycStatus?.status === 'pending',
    dac7Completed: dac7Info != null,
    dac7Status: dac7Info?.status ?? null,
    refreshKycStatus,
    applyDac7Info,
  };
}
