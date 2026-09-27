/**
 * /outfits/builder — the outfit composer. All state lives in OutfitBuilder
 * (client); this route is a thin shell so the page itself can stay metadata-
 * capable if needed later.
 */

import { OutfitBuilder } from '@/components/outfits/OutfitBuilder';

export default function OutfitBuilderPage() {
  return <OutfitBuilder />;
}
