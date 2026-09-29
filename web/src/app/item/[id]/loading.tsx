import { PdpSkeleton } from '@/components/pdp/PdpSkeleton';

/** Streaming skeleton for the PDP segment — mirrors the composed grid
 *  (media stage + evidence left, buy panel pinned right). */
export default function Loading() {
  return <PdpSkeleton />;
}
