/**
 * Screen capture protection & tracking platform module.
 *
 * - `useScreenCaptureProtection` — blocks screenshots / screen recording on
 *   sensitive screens. Call once at the top of a protected screen component.
 * - `useScreenshotTracking` — detects screenshots on non-protected screens
 *   and reports them to analytics. Mount once at the app root.
 */

export { useScreenCaptureProtection } from './useScreenCaptureProtection';
export { useScreenshotTracking } from './useScreenshotTracking';
