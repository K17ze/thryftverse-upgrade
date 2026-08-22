/**
 * Barrel export for the ThryftVerse animation system.
 *
 * Reusable Lottie/Rive animation components for onboarding, loading, empty
 * states, and success moments — designer-authored motion that plays back at
 * 60+ FPS natively.
 */

// ── Core component ───────────────────────────────────────────────────────
export {
  LottieAnimation,
  type LottieAnimationSource,
  type LottieAnimationHandle,
  type LottieAnimationProps,
} from './LottieAnimation';

// ── State components ─────────────────────────────────────────────────────
export {
  AnimatedEmptyState,
  type AnimatedEmptyStateProps,
} from './AnimatedEmptyState';

export {
  AnimatedLoadingState,
  type AnimatedLoadingStateProps,
} from './AnimatedLoadingState';

export {
  AnimatedSuccessState,
  type AnimatedSuccessStateProps,
} from './AnimatedSuccessState';

// ── CSS Transition utility ───────────────────────────────────────────────
export {
  CssTransition,
  type CssTransitionProps,
} from './CssTransition';

// ── Animation asset registry ─────────────────────────────────────────────
export {
  // Loading
  LOADING_BRANDED,
  // Empty states
  EMPTY_COLLECTION,
  EMPTY_SEARCH,
  EMPTY_MESSAGES,
  // Success moments
  SUCCESS_CHECKMARK,
  SUCCESS_OFFER_ACCEPTED,
  SUCCESS_PAYMENT,
  SUCCESS_LISTING_PUBLISHED,
  // Onboarding
  ONBOARDING_WELCOME,
  ONBOARDING_DISCOVER,
  ONBOARDING_SELL,
} from './animationAssets';
