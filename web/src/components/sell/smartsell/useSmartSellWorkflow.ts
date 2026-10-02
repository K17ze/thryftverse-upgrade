'use client';

import { useEffect, useState, type KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import { ApiRequestError, parseApiError } from '@/lib/api/http';
import {
  computeGrossForNet,
  computeNetQuote,
  createSmartSellPolicy,
  defaultSmartSellPolicy,
  disableSmartSell,
  enableSmartSell,
  fetchSmartSellDecisions,
  fetchSmartSellPolicy,
  listSmartSellPolicies,
  pauseSmartSellPolicy,
  resumeSmartSellPolicy,
  serverPolicyToPreview,
  updateSmartSellPolicy,
  updateSmartSellPolicyById,
  type ServerNetProceeds,
  type ServerSmartSellPolicy,
  type SmartSellPolicy,
} from '@/lib/api/services/smartSell';
import { useSession } from '@/lib/session/SessionProvider';
import { formatPrice } from '@/lib/utils/format';
import { parsePriceInput } from '../constants';

const tick = (ms = 200) => new Promise((r) => setTimeout(r, ms));

export interface SmartSellState {
  policy: SmartSellPolicy;
  serverPolicyId: string | null;
  /** Live-only: the server's counter strategy. Null on the preview path —
   *  the strategy chips never render there. */
  counterStrategy: 'firm' | 'gradual' | null;
}

function stateForServerPolicy(
  p: ServerSmartSellPolicy,
  netProceeds?: ServerNetProceeds,
): SmartSellState {
  return {
    policy: serverPolicyToPreview(p, netProceeds),
    serverPolicyId: p.id,
    counterStrategy: p.counterStrategy,
  };
}

export type SmartSellWrite =
  | { kind: 'toggle'; next: boolean }
  | { kind: 'floor'; minimumNet: number; floorGbp: number }
  | { kind: 'autoDecline'; enabled: boolean; declineBelowGross?: number }
  | { kind: 'counterStrategy'; counterStrategy: 'firm' | 'gradual' }
  | { kind: 'maxCounterRounds'; maxCounterRounds: number };

/** First-enable floor seed — mobile parity: 90% of the listing price. */
function seedFloorGbp(listingPrice?: number): number {
  if (!listingPrice || listingPrice <= 0) return 0;
  return Math.round(listingPrice * 0.9 * 100) / 100;
}

const previewState = (listingId: string): SmartSellState => ({
  policy: fetchSmartSellPolicy(listingId),
  serverPolicyId: null,
  counterStrategy: null,
});

export function useSmartSellWorkflow(listingId: string, listingPrice?: number) {
  const { user } = useSession();
  const qc = useQueryClient();
  const queryKey = ['seller', 'smart-sell', listingId, DATA_MODE, user?.id] as const;

  const stateQuery = useQuery({
    queryKey,
    queryFn: async ({ signal }): Promise<SmartSellState> => {
      if (DATA_MODE === 'live') {
        const policies = await listSmartSellPolicies(undefined, signal);
        const existing = policies.find(
          (p) => p.listingId === listingId && p.status !== 'cancelled',
        );
        if (existing) return stateForServerPolicy(existing);
        return {
          policy: defaultSmartSellPolicy(listingId, { kind: 'active' }),
          serverPolicyId: null,
          counterStrategy: null,
        };
      }
      await tick(180);
      return previewState(listingId);
    },
    enabled: DATA_MODE !== 'live' || Boolean(user?.id),
  });

  const policy = stateQuery.data?.policy ?? null;
  const serverPolicyId = stateQuery.data?.serverPolicyId ?? null;
  const minimumNet = policy?.minimumNet ?? 0;
  const acceptGrossThreshold = policy?.acceptGrossThreshold ?? 0;
  const declineBelowGross = policy?.declineBelowGross ?? 0;
  const maxAutoCounters = policy?.maxAutoCounters;

  const [netText, setNetText] = useState('');
  const [floorText, setFloorText] = useState('');
  const [declineText, setDeclineText] = useState('');
  const [roundsText, setRoundsText] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setNetText(minimumNet > 0 ? String(minimumNet) : '');
    setFloorText(acceptGrossThreshold > 0 ? String(acceptGrossThreshold) : '');
    setDeclineText(declineBelowGross > 0 ? String(declineBelowGross) : '');
    setRoundsText(maxAutoCounters != null ? String(maxAutoCounters) : '');
  }, [minimumNet, acceptGrossThreshold, declineBelowGross, maxAutoCounters]);

  const write = useMutation({
    mutationFn: async (w: SmartSellWrite): Promise<SmartSellState> => {
      const current = qc.getQueryData<SmartSellState>(queryKey);
      const policyId = current?.serverPolicyId ?? null;

      if (DATA_MODE === 'live') {
        switch (w.kind) {
          case 'toggle': {
            if (!w.next) {
              if (!policyId) {
                return (
                  current ?? {
                    policy: defaultSmartSellPolicy(listingId, { kind: 'active' }),
                    serverPolicyId: null,
                    counterStrategy: null,
                  }
                );
              }
              const p = await pauseSmartSellPolicy(policyId);
              return stateForServerPolicy(p);
            }
            if (policyId) {
              const p = await resumeSmartSellPolicy(policyId);
              return stateForServerPolicy(p);
            }
            const floor =
              current && current.policy.acceptGrossThreshold > 0
                ? current.policy.acceptGrossThreshold
                : seedFloorGbp(listingPrice);
            if (!floor) throw new Error('Set a listing price first');
            try {
              const res = await createSmartSellPolicy({ listingId, floorPriceGbp: floor });
              return stateForServerPolicy(res.policy, res.floorNetProceeds);
            } catch (err) {
              if (err instanceof ApiRequestError && err.status === 409) {
                const policies = await listSmartSellPolicies();
                const existing = policies.find(
                  (p) => p.listingId === listingId && p.status !== 'cancelled',
                );
                if (existing) return stateForServerPolicy(existing);
              }
              throw err;
            }
          }
          case 'floor': {
            if (!policyId) throw new Error('Turn on Smart Sell first');
            const p = await updateSmartSellPolicyById(policyId, { floorPriceGbp: w.floorGbp });
            return stateForServerPolicy(p);
          }
          case 'counterStrategy': {
            if (!policyId) throw new Error('Turn on Smart Sell first');
            const p = await updateSmartSellPolicyById(policyId, {
              counterStrategy: w.counterStrategy,
            });
            return stateForServerPolicy(p);
          }
          case 'maxCounterRounds': {
            if (!policyId) throw new Error('Turn on Smart Sell first');
            const p = await updateSmartSellPolicyById(policyId, {
              maxCounterRounds: w.maxCounterRounds,
            });
            return stateForServerPolicy(p);
          }
          case 'autoDecline':
            throw new Error('Auto-decline is not available yet');
        }
      }

      await tick(220);
      switch (w.kind) {
        case 'toggle':
          return {
            policy: w.next
              ? enableSmartSell(listingId, listingPrice)
              : disableSmartSell(listingId),
            serverPolicyId: null,
            counterStrategy: null,
          };
        case 'floor':
          return {
            policy: updateSmartSellPolicy(listingId, {
              minimumNet: w.minimumNet,
              acceptGrossThreshold: w.floorGbp,
            }),
            serverPolicyId: null,
            counterStrategy: null,
          };
        case 'autoDecline':
          return {
            policy: updateSmartSellPolicy(listingId, {
              autoDeclineEnabled: w.enabled,
              ...(w.declineBelowGross != null
                ? { declineBelowGross: w.declineBelowGross }
                : {}),
            }),
            serverPolicyId: null,
            counterStrategy: null,
          };
        case 'maxCounterRounds':
          return {
            policy: updateSmartSellPolicy(listingId, {
              maxAutoCounters: w.maxCounterRounds,
            }),
            serverPolicyId: null,
            counterStrategy: null,
          };
        case 'counterStrategy':
          return current ?? previewState(listingId);
      }
    },
    onSuccess: (next) => {
      setNotice(null);
      qc.setQueryData(queryKey, next);
    },
    onError: (err) => {
      setNotice(parseApiError(err, "Couldn't update Smart Sell — try again").message);
    },
  });

  const decisionsQuery = useQuery({
    queryKey: ['seller', 'smart-sell', 'decisions', serverPolicyId],
    queryFn: ({ signal }) => fetchSmartSellDecisions(serverPolicyId as string, 10, signal),
    enabled:
      DATA_MODE === 'live' && Boolean(serverPolicyId) && Boolean(policy?.enabled),
  });

  const isLive = DATA_MODE === 'live';
  const busy = write.isPending;
  const configured = Boolean(
    policy && (policy.enabled || policy.state === 'paused' || acceptGrossThreshold > 0),
  );

  const floorBoundsError = (gross: number): string | null => {
    if (!listingPrice || gross <= 0) return null;
    if (gross > listingPrice) {
      return `The floor can't exceed the listing price (${formatPrice(listingPrice)}).`;
    }
    if (gross < listingPrice * 0.1) {
      return `The floor must be at least 10% of the listing price (${formatPrice(
        Math.round(listingPrice * 0.1 * 100) / 100,
      )}).`;
    }
    return null;
  };

  const commitNet = () => {
    if (!policy || busy) return;
    const net = parsePriceInput(netText) ?? 0;
    if (net === policy.minimumNet) return;
    if (net <= 0) {
      setNotice('Enter a minimum payout above £0 — Smart Sell needs a floor.');
      return;
    }
    const gross = computeGrossForNet(net, policy.feeRate);
    const bounds = floorBoundsError(gross);
    if (bounds) {
      setNotice(bounds);
      return;
    }
    write.mutate({ kind: 'floor', minimumNet: net, floorGbp: gross });
  };

  const commitFloor = () => {
    if (!policy || busy) return;
    const gross = parsePriceInput(floorText) ?? 0;
    if (gross === policy.acceptGrossThreshold) return;
    if (gross <= 0) {
      setNotice('Enter a floor above £0.');
      return;
    }
    const bounds = floorBoundsError(gross);
    if (bounds) {
      setNotice(bounds);
      return;
    }
    const quote = computeNetQuote(gross, policy.feeRate);
    write.mutate({ kind: 'floor', minimumNet: quote.net, floorGbp: gross });
  };

  const commitDecline = () => {
    if (!policy || busy) return;
    const gross = parsePriceInput(declineText) ?? 0;
    if (gross === policy.declineBelowGross) return;
    write.mutate({
      kind: 'autoDecline',
      enabled: policy.autoDeclineEnabled,
      declineBelowGross: gross,
    });
  };

  const commitRounds = () => {
    if (!policy || busy) return;
    const rounds = Number.parseInt(roundsText, 10);
    if (!Number.isFinite(rounds) || rounds < 0 || rounds > 10) {
      setNotice('Counter rounds must be between 0 and 10.');
      return;
    }
    if (rounds === policy.maxAutoCounters) return;
    write.mutate({ kind: 'maxCounterRounds', maxCounterRounds: rounds });
  };

  const commitOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
  };

  const quote =
    policy && acceptGrossThreshold > 0
      ? computeNetQuote(acceptGrossThreshold, policy.feeRate)
      : null;

  const summary = !policy?.enabled
    ? policy?.state === 'paused'
      ? `Paused — floor ${formatPrice(acceptGrossThreshold)}`
      : 'Auto-accept offers above your floor'
    : quote
      ? `Auto-accepts at ${formatPrice(quote.gross)} · you get ${formatPrice(quote.net)}`
      : 'Auto-negotiation on';

  return {
    user,
    stateQuery,
    decisionsQuery,
    policy,
    serverPolicyId,
    counterStrategy: stateQuery.data?.counterStrategy ?? null,
    isLive,
    busy,
    configured,
    quote,
    summary,
    netText,
    setNetText,
    floorText,
    setFloorText,
    declineText,
    setDeclineText,
    roundsText,
    setRoundsText,
    showAdvanced,
    setShowAdvanced,
    notice,
    setNotice,
    write,
    commitNet,
    commitFloor,
    commitDecline,
    commitRounds,
    commitOnEnter,
  };
}
