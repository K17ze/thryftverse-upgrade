import type { LottieAnimationSource } from './LottieAnimation';

/**
 * Central registry of all Lottie animation sources for ThryftVerse.
 *
 * Each constant is either:
 *   - A `require()` to a `.json` Lottie file in `assets/animations/` (when the
 *     designer has delivered the asset), or
 *   - `null` with a comment indicating which asset to add.
 *
 * This allows incremental asset addition without code changes elsewhere —
 * components already handle `null` sources by falling back to ActivityIndicator
 * or a static icon.
 *
 * ── To add an asset ──────────────────────────────────────────────────────
 *
 * 1. Export the animation JSON from After Effects / Rive as a Lottie `.json` file.
 * 2. Place it at `assets/animations/<name>.json`.
 * 3. Replace the `null` below with:
 *
 *      require('../../assets/animations/<name>.json') as AnimationObject
 *
 *    (Import `AnimationObject` from 'lottie-react-native' if needed for the cast.)
 *
 * ── Lottie vs Rive (2026) ────────────────────────────────────────────────
 *
 * Lottie: best for playback-only motion (loading, success, empty states).
 *   - Designer authors in After Effects → exports JSON → engineer plays back.
 *   - 60+ FPS native rendering, small file size, no interactivity.
 *
 * Rive: best for interactive / state-machine-driven motion (onboarding with
 *   gesture-reactive elements, interactive illustrations).
 *   - Designer authors in Rive → exports .riv → engineer wires state machine.
 *   - Smaller files, runtime-driven, supports interactive state machines.
 *
 * This registry covers Lottie assets. Rive assets would live in a separate
 * registry when the `rive-react-native` package is added.
 */

// ── Loading ──────────────────────────────────────────────────────────────

/**
 * Branded loading indicator — a looping animation that communicates
 * "we're preparing something nice for you" instead of a generic spinner.
 *
 * TODO: Add `assets/animations/loading_branded.json`
 */
export const LOADING_BRANDED: LottieAnimationSource | null = null;

// ── Empty states ─────────────────────────────────────────────────────────

/**
 * Empty collection — gentle floating animation for an empty closet/collection.
 * Plays once (entrance), then settles to a static final frame.
 *
 * TODO: Add `assets/animations/empty_collection.json`
 */
export const EMPTY_COLLECTION: LottieAnimationSource | null = null;

/**
 * Empty search — no search results. A subtle "nothing found" motion.
 * Plays once, then settles.
 *
 * TODO: Add `assets/animations/empty_search.json`
 */
export const EMPTY_SEARCH: LottieAnimationSource | null = null;

/**
 * Empty messages — no conversations yet. A gentle envelope/heartbeat motion.
 * Plays once, then settles.
 *
 * TODO: Add `assets/animations/empty_messages.json`
 */
export const EMPTY_MESSAGES: LottieAnimationSource | null = null;

// ── Success moments ──────────────────────────────────────────────────────

/**
 * Generic success checkmark — a one-shot checkmark draw-in animation.
 * Used for confirmations that don't have a bespoke celebration animation.
 *
 * TODO: Add `assets/animations/success_checkmark.json`
 */
export const SUCCESS_CHECKMARK: LottieAnimationSource | null = null;

/**
 * Offer accepted — a one-shot celebration for when a buyer's offer is accepted.
 * More elaborate than the generic checkmark (e.g. confetti burst).
 *
 * TODO: Add `assets/animations/success_offer_accepted.json`
 */
export const SUCCESS_OFFER_ACCEPTED: LottieAnimationSource | null = null;

/**
 * Payment completed — a one-shot celebration for successful payment.
 * Communicates trust and completion (e.g. card swipe + checkmark).
 *
 * TODO: Add `assets/animations/success_payment.json`
 */
export const SUCCESS_PAYMENT: LottieAnimationSource | null = null;

/**
 * Listing published — a one-shot celebration for when a seller's listing
 * goes live. Communicates "your item is now discoverable" (e.g. tag/rocket).
 *
 * TODO: Add `assets/animations/success_listing_published.json`
 */
export const SUCCESS_LISTING_PUBLISHED: LottieAnimationSource | null = null;

// ── Onboarding ───────────────────────────────────────────────────────────

/**
 * Onboarding welcome — the first slide's hero animation.
 * Introduces the app's curated-fashion identity.
 *
 * TODO: Add `assets/animations/onboarding_welcome.json`
 */
export const ONBOARDING_WELCOME: LottieAnimationSource | null = null;

/**
 * Onboarding discover — the "find pieces no one else has" slide animation.
 * Communicates discovery and curation.
 *
 * TODO: Add `assets/animations/onboarding_discover.json`
 */
export const ONBOARDING_DISCOVER: LottieAnimationSource | null = null;

/**
 * Onboarding sell — the "turn your closet into credit" slide animation.
 * Communicates listing and sustainability.
 *
 * TODO: Add `assets/animations/onboarding_sell.json`
 */
export const ONBOARDING_SELL: LottieAnimationSource | null = null;
