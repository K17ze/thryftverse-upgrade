import {
  deriveLifecycleState,
  type AssetLifecycleState,
  type CoOwnAsset,
} from '@/lib/contracts/coown';
import { LIFECYCLE_LABEL } from './format';

const TONE: Record<AssetLifecycleState, string> = {
  secondaryTrading: 'bg-coown-up',
  initialOffering: 'bg-antique-gold',
  tradingPaused: 'bg-warning',
  exitUnderway: 'bg-text-muted',
};

/** Quiet market-state tag — status dot + word, no badge chrome. */
export function LifecycleTag({ asset, className = '' }: { asset: CoOwnAsset; className?: string }) {
  const state = deriveLifecycleState(asset);
  return (
    <span className={`inline-flex items-center gap-1.5 text-meta text-text-secondary ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${TONE[state]}`} aria-hidden="true" />
      {LIFECYCLE_LABEL[state]}
    </span>
  );
}
