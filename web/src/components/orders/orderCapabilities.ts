/**
 * Order capabilities — 1:1 port of the mobile orderCapabilities.ts
 * (frontend/src/components/orders/orderCapabilities.ts), minus the theme
 * dependency. This is the single canonical status classifier + action
 * resolver: every orders surface consumes it instead of re-deriving
 * status semantics locally.
 *
 * Decomposed into modular units:
 * - capabilities/orderStatusModel.ts: Status normalisation, classification, tone, badge
 * - capabilities/orderActionCapabilities.ts: Capabilities resolution, actions, ETA, hints
 * - capabilities/orderAttentionExperience.ts: Order attention derivation and experience projection
 */

export * from './capabilities/orderStatusModel';
export * from './capabilities/orderActionCapabilities';
export * from './capabilities/orderAttentionExperience';
