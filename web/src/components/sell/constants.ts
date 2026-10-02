/**
 * Sell-flow domain constants — mirrors the mobile listing-authoring
 * vocabulary (SellScreen + currencyAuthoringFlows) for the web flow.
 *
 * Decomposed into modular domain units:
 * - model/sellDraftTypes.ts: Core interfaces, media caps, conditions, sustainability & postage options
 * - model/sellPricing.ts: Price input parsing, buyer protection fee, and market comparables
 * - model/sellDraftTransform.ts: Listing hydrate/preview transformations and publish completeness check
 */

export {
  allowedConditionsFor,
  conditionAllowedFor,
  isSizelessCategory,
  isSizeRequiredCategory,
  sizesForCategory,
} from './taxonomy';

export * from './model/sellDraftTypes';
export * from './model/sellPricing';
export * from './model/sellDraftTransform';
