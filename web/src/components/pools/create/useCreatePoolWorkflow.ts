'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { useSignupWall } from '@/components/auth/SignupWall';
import { SYNDICATE_LIMITS } from '@/lib/contracts/syndicate';
import { useCoOwnAssets } from '@/lib/hooks/coown-queries';
import { useSyndicateActions } from '@/lib/hooks/syndicate-queries';
import { useSession } from '@/lib/session/SessionProvider';
import { gbp } from '@/components/coown/format';
import type { CreatePoolStep } from './StepRail';

export function useCreatePoolWorkflow() {
  const router = useRouter();
  const { user } = useSession();
  const { requireAuth, wall } = useSignupWall();
  const { createSyndicate } = useSyndicateActions();
  const { show } = useToast();
  const assetsQ = useCoOwnAssets();

  const [step, setStep] = useState<CreatePoolStep>('asset');
  const [assetId, setAssetId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [memberCapRaw, setMemberCapRaw] = useState('6');
  const [unitsRaw, setUnitsRaw] = useState('10');
  const [minRaw, setMinRaw] = useState('100');
  const [maxRaw, setMaxRaw] = useState('1000');
  const [terms, setTerms] = useState('');
  // Errors surface on field blur or a create attempt — not on mount.
  const [errorsVisible, setErrorsVisible] = useState(false);

  const asset = useMemo(
    () => assetsQ.data?.find((a) => a.id === assetId) ?? null,
    [assetsQ.data, assetId],
  );

  const memberCap = Math.floor(Number(memberCapRaw));
  const unitsTarget = Math.floor(Number(unitsRaw));
  const minContribution = Number(minRaw);
  const maxContribution = Number(maxRaw);

  /** Rule validation — every check a pool must pass before it exists. */
  const errors = useMemo(() => {
    const list: string[] = [];
    if (!name.trim()) list.push('Give the pool a name');
    if (
      !Number.isFinite(memberCap) ||
      memberCap < SYNDICATE_LIMITS.memberCapMin ||
      memberCap > SYNDICATE_LIMITS.memberCapMax
    ) {
      list.push(
        `Member cap must be ${SYNDICATE_LIMITS.memberCapMin}–${SYNDICATE_LIMITS.memberCapMax}`,
      );
    }
    if (!Number.isFinite(unitsTarget) || unitsTarget < 1) {
      list.push('Units target must be at least 1');
    } else if (asset && unitsTarget > asset.totalUnits) {
      list.push(`Can't exceed the issue size (${asset.totalUnits} units)`);
    }
    if (!Number.isFinite(minContribution) || minContribution <= 0) {
      list.push('Minimum contribution must be above £0');
    }
    if (!Number.isFinite(maxContribution) || maxContribution <= 0) {
      list.push('Maximum contribution must be above £0');
    } else if (Number.isFinite(minContribution) && minContribution > maxContribution) {
      list.push("Minimum can't exceed the maximum");
    }
    if (
      asset &&
      Number.isFinite(unitsTarget) &&
      unitsTarget >= 1 &&
      Number.isFinite(memberCap) &&
      Number.isFinite(maxContribution) &&
      maxContribution > 0
    ) {
      const target = unitsTarget * asset.unitPriceGbp;
      const raiseable = memberCap * maxContribution;
      if (raiseable < target) {
        list.push(
          `${memberCap} members × ${gbp(maxContribution)} raises at most ${gbp(
            raiseable,
          )} — below the ${gbp(target)} target`,
        );
      }
    }
    return list;
  }, [name, memberCap, unitsTarget, minContribution, maxContribution, asset]);

  const canCreate = asset != null && errors.length === 0;
  const targetTotal =
    asset && unitsTarget >= 1 ? unitsTarget * asset.unitPriceGbp : null;

  const create = () => {
    if (!canCreate) {
      setErrorsVisible(true);
      return;
    }
    if (!requireAuth('purchase')) return;
    if (!user || !asset) return;
    const syndicate = createSyndicate(
      {
        name: name.trim(),
        assetId: asset.id,
        memberCap,
        unitsTarget,
        minContributionGbp: Math.round(minContribution * 100) / 100,
        maxContributionGbp: Math.round(maxContribution * 100) / 100,
        termsNote: terms.trim() ? terms.trim() : null,
      },
      { id: user.id, username: user.username, displayName: null, avatar: user.avatar },
    );
    show('Pool created — invite members to fund it', 'success');
    router.push(`/co-own/pools/${syndicate.id}`);
  };

  return {
    step,
    setStep,
    assetId,
    setAssetId,
    asset,
    name,
    setName,
    memberCapRaw,
    setMemberCapRaw,
    unitsRaw,
    setUnitsRaw,
    minRaw,
    setMinRaw,
    maxRaw,
    setMaxRaw,
    terms,
    setTerms,
    errorsVisible,
    setErrorsVisible,
    memberCap,
    unitsTarget,
    maxContribution,
    targetTotal,
    errors,
    canCreate,
    assetsQ,
    create,
    wall,
  };
}
