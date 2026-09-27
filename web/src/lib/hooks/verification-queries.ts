'use client';

/**
 * Verification-domain hooks — the only path from the /verification surfaces
 * to data. Live mode delegates to services/verification (the same
 * /co-own/* and /compliance/* endpoints the mobile app uses); fixture mode
 * reads/mutates fixtures-verification and the persisted verification store.
 *
 * Guests have no demands and no DAC7 record — fixture seeds belong to the
 * demo identity, matching the support-tickets posture.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import * as verificationService from '@/lib/api/services/verification';
import type {
  Dac7TaxInfo,
  Dac7TaxInfoInput,
  SellerVerificationDemand,
} from '@/lib/contracts/verification';
import {
  demandById,
  respondToFixtureDemand,
  SELLER_VERIFICATION_DEMANDS,
} from '@/lib/data/fixtures-verification';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated } from '@/lib/store/useStore';
import { useVerificationStore } from '@/components/verification/useVerificationStore';

const tick = (ms = 140) => new Promise((r) => setTimeout(r, ms));

const demandsKey = (userId: string) => ['verification-demands', userId] as const;

/** The seller's verification-demand inbox — pending first, then history. */
export function useVerificationDemands() {
  const { user, isGuest } = useSession();
  const userId = user?.id ?? 'guest';
  return useQuery({
    queryKey: demandsKey(userId),
    queryFn: async (): Promise<SellerVerificationDemand[]> => {
      if (isGuest || !user) return [];
      if (DATA_MODE === 'live') {
        return verificationService.fetchSellerVerificationDemands(user.id);
      }
      await tick();
      return SELLER_VERIFICATION_DEMANDS.map((d) => ({ ...d }));
    },
  });
}

/** One demand by id — used by the respond/detail route. */
export function useVerificationDemand(demandId: number) {
  const { user, isGuest } = useSession();
  const userId = user?.id ?? 'guest';
  return useQuery({
    queryKey: [...demandsKey(userId), demandId],
    queryFn: async (): Promise<SellerVerificationDemand | null> => {
      if (isGuest || !user) return null;
      if (DATA_MODE === 'live') {
        const demands = await verificationService.fetchSellerVerificationDemands(user.id);
        return demands.find((d) => d.id === demandId) ?? null;
      }
      await tick();
      const found = demandById(demandId);
      return found ? { ...found } : null;
    },
  });
}

/**
 * Submit evidence for a pending demand. Live mode posts the respond edge;
 * fixture mode applies the same pending → responded transition to the
 * fixture store and refreshes every demands reader. Evidence media is
 * uploaded by the caller (uploads service) — this hook only sends URIs.
 */
export function useRespondToVerificationDemand() {
  const qc = useQueryClient();
  const { user } = useSession();
  const userId = user?.id ?? 'guest';
  return useMutation({
    mutationFn: async (input: {
      assetId: string;
      demandId: number;
      evidenceUrl: string;
      evidenceNotes?: string;
    }): Promise<Partial<SellerVerificationDemand>> => {
      if (DATA_MODE === 'live') {
        return verificationService.respondToVerificationDemand(
          input.assetId,
          input.demandId,
          input.evidenceUrl,
          input.evidenceNotes,
        );
      }
      await tick(120);
      return respondToFixtureDemand(
        input.demandId,
        input.evidenceUrl,
        input.evidenceNotes,
      );
    },
    onSuccess: () => {
      return qc.invalidateQueries({ queryKey: demandsKey(userId) });
    },
  });
}

// ── DAC7 tax information ────────────────────────────────────────────────────

/**
 * The account's DAC7 record. Live mode queries /compliance/dac7/:userId;
 * fixture mode reads the persisted verification store — hydration-gated so
 * SSR and the first client render agree (null until hydrated).
 */
export function useDac7TaxInfo() {
  const { user, isGuest } = useSession();
  const hydrated = useHydrated();
  const stored = useVerificationStore((s) => s.dac7);

  const query = useQuery({
    queryKey: ['dac7', user?.id ?? 'guest'],
    queryFn: async (): Promise<Dac7TaxInfo | null> => {
      if (!user) return null;
      return verificationService.fetchDac7TaxInfo(user.id);
    },
    enabled: DATA_MODE === 'live',
  });

  if (DATA_MODE === 'live') {
    return { info: isGuest ? null : (query.data ?? null), isLoading: query.isLoading };
  }
  return { info: hydrated && !isGuest ? stored : null, isLoading: !hydrated };
}

/**
 * Save DAC7 details. Live mode posts to the compliance endpoint and
 * invalidates the record; fixture mode writes the persisted store — the
 * record survives reloads, honestly local to this browser.
 */
export function useSaveDac7TaxInfo() {
  const qc = useQueryClient();
  const { user } = useSession();
  const saveToStore = useVerificationStore((s) => s.saveDac7);

  return useMutation({
    mutationFn: async (input: Dac7TaxInfoInput): Promise<Dac7TaxInfo> => {
      if (DATA_MODE === 'live') {
        if (!user) throw new Error('Sign in to save tax information');
        return verificationService.saveDac7TaxInfo(user.id, input);
      }
      await tick(160);
      const now = new Date().toISOString();
      const record: Dac7TaxInfo = {
        ...input,
        selfDeclaredAt: input.selfDeclared ? now : null,
        status: 'declared',
        verifiedAt: null,
        rejectedReason: null,
        createdAt: now,
        updatedAt: now,
      };
      saveToStore(record);
      return record;
    },
    onSuccess: () => {
      if (DATA_MODE === 'live') {
        return qc.invalidateQueries({ queryKey: ['dac7', user?.id ?? 'guest'] });
      }
    },
  });
}

/** Pending-demand count for surfaces that only need the badge number. */
export function usePendingDemandCount(): number {
  const { data } = useVerificationDemands();
  return (data ?? []).filter((d) => d.status === 'pending').length;
}
