/**
 * buildPosterTextLayer — factory for the Poster composer's direct-on-
 * canvas text layer (Snapchat/Instagram pattern: tapping Text places a
 * layer on the canvas immediately, then opens the in-place editor).
 *
 * Extracted from PosterComposerScreen's `handleAddText` (pure
 * extraction — no behavioral change).
 */
import { makeStableId } from '../../../utils/createStableId';
import type { CreatorLayer } from '../../core/projectStore/composition';

/**
 * Returns a new empty text layer: centered, 70% wide, white "clean"
 * style. `addLayerToPage` re-assigns zIndex to maxZ + 1 on insert.
 */
export function buildPosterTextLayer(): CreatorLayer {
  const newLayer: CreatorLayer = {
    id: makeStableId('text'),
    type: 'text',
    x: 0.5,
    y: 0.5,
    width: 0.7,
    height: 0.12,
    scale: 1,
    rotation: 0,
    zIndex: 10, // addLayerToPage re-assigns to maxZ + 1
    locked: false,
    hidden: false,
    opacity: 1,
    payload: {
      text: '',
      textStyle: 'clean',
      fill: { space: 'srgb', r: 1, g: 1, b: 1, a: 1 },
      textColor: '#ffffff',
      alignment: 'center',
      opacity: 1,
    },
  } as CreatorLayer;
  return newLayer;
}
