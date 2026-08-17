/**
 * Semantic bottom sheet wrappers.
 *
 * The low-level `BottomSheet` engine (in ../BottomSheet) handles gestures,
 * backdrop, back-handler, keyboard awareness, and accessibility. These
 * wrappers encode the appropriate material grammar for each task so callers
 * do not have to reason about radius, shadow, or backdrop treatment.
 *
 *   ActionSheet      — short choices, action menus, pickers, confirmations
 *   FormSheet        — forms, editors, settings panels (title bar + actions)
 *   InspectorSheet   — object inspectors, detail panels (lighter backdrop)
 *   TransactionSheet — payment / offer / bid confirmation (action hierarchy)
 *
 * Import from here instead of using `BottomSheet` directly so every sheet
 * gets the right material for its job.
 */
export { ActionSheet } from './ActionSheet';
export type { ActionSheetProps } from './ActionSheet';

export { FormSheet } from './FormSheet';
export type { FormSheetProps } from './FormSheet';

export { InspectorSheet } from './InspectorSheet';
export type { InspectorSheetProps } from './InspectorSheet';

export { TransactionSheet } from './TransactionSheet';
export type { TransactionSheetProps } from './TransactionSheet';

// Re-export the low-level engine and its variant type for advanced callers
// that need direct access (e.g. a bespoke sheet that does not fit a wrapper).
export { BottomSheet, type BottomSheetVariant } from '../BottomSheet';
