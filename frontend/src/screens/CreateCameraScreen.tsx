/**
 * CreateCameraScreen — golden-route alias for the creator camera entry surface.
 *
 * The actual camera capture UI lives in `src/creator/CreatorEntryScreen.tsx`,
 * which is rendered as an in-studio overlay by `CreatorStudioShell` (see
 * `src/navigation/TabNavigator.tsx` — the Create tab action opens
 * CreatorStudio with `openEntry` rather than navigating to a standalone
 * camera route). This file exists so the visual release-gate's golden-route
 * coverage check (`checkDepartmentCoverage` in
 * `scripts/check-visual-release-gates.mjs`) can resolve the Poster/Camera
 * department screen at the canonical `src/screens/` path it audits.
 *
 * It re-exports the real entry component without duplicating any logic — the
 * single source of truth remains `CreatorEntryScreen`.
 */
export { CreatorEntryScreen as default } from '../creator/CreatorEntryScreen';
export { CreatorEntryScreen as CreateCameraScreen } from '../creator/CreatorEntryScreen';
export type {
  CreatorEntryScreenProps,
  CreatorCameraMode,
} from '../creator/CreatorEntryScreen';
