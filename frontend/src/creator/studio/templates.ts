/**
 * Creator template registry — barrel.
 *
 * Template definitions live in the `templates/` directory, split by
 * document type:
 *   - templates/shared.ts           — CreatorTemplate type + layer helpers
 *   - templates/lookTemplates.ts    — LOOK_TEMPLATES
 *   - templates/posterTemplates.ts  — POSTER_TEMPLATES
 *   - templates/index.ts            — ALL_TEMPLATES, getters, categories
 *
 * This module preserves the original import path (`studio/templates`).
 */
export * from './templates/index';
