/**
 * Conversational-search engine — deterministic, fully local.
 *
 * Port of mobile's extractFilters() (services/conversationalSearchApi.ts) to
 * the web fixture taxonomy. Every dictionary is derived from the real
 * LISTINGS catalogue — brand names, subcategory terms, colour words — so a
 * matched chip always names a value the catalogue can actually satisfy.
 *
 * Decomposed into modular units:
 * - engine/convSearchTypes.ts: Intent types, constraint chip model, trust metrics
 * - engine/convSearchVocab.ts: Taxonomy dictionaries, brand aliases, diacritics
 * - engine/convSearchParser.ts: Deterministic keyword parser and turn merger
 * - engine/convSearchChips.ts: Chip rendering and single-constraint removal
 * - engine/convSearchMatching.ts: Catalogue filtering, text and colour affinity
 * - engine/convSearchUrl.ts: URL param serialization and /search hand-off
 * - engine/convSearchTurnContent.ts: Assistant replies, refinements, and confidence
 */

export * from './engine/convSearchTypes';
export * from './engine/convSearchVocab';
export * from './engine/convSearchParser';
export * from './engine/convSearchChips';
export * from './engine/convSearchMatching';
export * from './engine/convSearchUrl';
export * from './engine/convSearchTurnContent';
