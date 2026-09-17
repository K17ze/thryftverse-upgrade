import type { CreatorTemplate } from './shared';
import { LOOK_TEMPLATES } from './lookTemplates';
import { POSTER_TEMPLATES } from './posterTemplates';

export type { CreatorTemplate } from './shared';
export { LOOK_TEMPLATES } from './lookTemplates';
export { POSTER_TEMPLATES } from './posterTemplates';

export const ALL_TEMPLATES: CreatorTemplate[] = [...LOOK_TEMPLATES, ...POSTER_TEMPLATES];

export function getTemplateById(id: string): CreatorTemplate | undefined {
  return ALL_TEMPLATES.find((t) => t.id === id);
}

export function getTemplatesByType(type: 'look' | 'poster'): CreatorTemplate[] {
  return type === 'look' ? LOOK_TEMPLATES : POSTER_TEMPLATES;
}

export type TemplateCategory = CreatorTemplate['category'];

export const TEMPLATE_CATEGORIES: Array<{ key: TemplateCategory | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'featured', label: 'Featured' },
  { key: 'announcement', label: 'Announce' },
  { key: 'interactive', label: 'Interactive' },
  { key: 'story', label: 'Story' },
  { key: 'sale', label: 'Sale' },
  { key: 'editorial', label: 'Editorial' },
  { key: 'moodboard', label: 'Moodboard' },
];

export function getTemplatesByCategory(type: 'look' | 'poster', category: TemplateCategory | 'all'): CreatorTemplate[] {
  const all = getTemplatesByType(type);
  if (category === 'all') return all;
  return all.filter((t) => t.category === category);
}
