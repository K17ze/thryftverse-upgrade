import type { CoOwnAsset } from '@/lib/contracts/coown';
import type { Syndicate } from '@/lib/contracts/syndicate';
import { isMemberCapReached, syndicatePhase } from '@/lib/contracts/syndicate';

/**
 * Pool state tag — status dot + word, no badge chrome. Mirrors
 * LifecycleTag's grammar. 'Member cap reached' only surfaces to
 * non-members — members of a capped pool can still top up.
 */
export function SyndicateStatusTag({
  syndicate,
  asset,
  viewerIsMember = false,
  className = '',
}: {
  syndicate: Syndicate;
  asset: CoOwnAsset;
  viewerIsMember?: boolean;
  className?: string;
}) {
  const phase = syndicatePhase(syndicate, asset);
  let label: string;
  let dot: string;
  if (phase === 'executed') {
    label = 'Executed';
    dot = 'bg-text-muted';
  } else if (phase === 'dissolved') {
    label = 'Dissolved';
    dot = 'bg-text-muted';
  } else if (phase === 'funded') {
    label = 'Fully funded';
    dot = 'bg-antique-gold';
  } else if (!viewerIsMember && isMemberCapReached(syndicate)) {
    label = 'Member cap reached';
    dot = 'bg-antique-gold';
  } else {
    label = 'Open';
    dot = 'bg-coown-up';
  }
  return (
    <span className={`inline-flex items-center gap-1.5 text-meta text-text-secondary ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  );
}
