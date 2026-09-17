import { makeStableId } from '../../../utils/createStableId';
import type { CreatorDocument, CreatorLayer, CreatorPage } from '../../core/projectStore/composition';

export interface CreatorTemplate {
  id: string;
  name: string;
  type: 'look' | 'poster';
  description: string;
  category: 'featured' | 'announcement' | 'interactive' | 'story' | 'editorial' | 'sale' | 'moodboard';
  /** Optional style tags used to sort templates by user preferences. */
  styleTags?: string[];
  build: () => CreatorDocument;
}

export function page(layers: CreatorLayer[], durationMs?: number): CreatorPage {
  return { id: makeStableId('page'), layers, durationMs };
}

export function baseLayer(id: string, zIndex: number): Pick<CreatorLayer, 'id' | 'x' | 'y' | 'scale' | 'rotation' | 'opacity' | 'zIndex' | 'locked' | 'hidden'> {
  return {
    id,
    x: 0.5,
    y: 0.5,
    scale: 1,
    rotation: 0,
    opacity: 1,
    zIndex,
    locked: false,
    hidden: false,
  };
}
