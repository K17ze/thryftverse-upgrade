import { haptics } from './haptics';

/**
 * Compound haptic patterns — "haptics-as-language" sequences that
 * communicate specific UI events through timed tactile gestures.
 *
 * Each pattern composes the primitive haptic helpers (light / medium /
 * heavy / success / error / warning / selection) into a short gesture
 * that maps to a real product moment. Per AGENTS.md §13 the haptic
 * level for every primitive is chosen deliberately, and per §4 the
 * resulting interaction feels native rather than a single blunt buzz.
 *
 * Patterns are fire-and-forget; the underlying primitives swallow
 * errors on unsupported platforms so callers never need to await.
 */
export const HapticPatterns = {
  // Like / double-tap: two quick light taps — a tactile "heartbeat"
  like: () => {
    haptics.tap();
    setTimeout(() => haptics.tap(), 60);
  },

  // Purchase complete: medium impact → success notification
  purchaseComplete: () => {
    haptics.press();
    setTimeout(() => haptics.success(), 100);
  },

  // Bid placed: selection → light tap (commitment then confirmation)
  bidPlaced: () => {
    haptics.selection();
    setTimeout(() => haptics.tap(), 50);
  },

  // Outbid: warning notification — urgency without alarm
  outbid: () => {
    haptics.warning();
  },

  // Swipe-to-delete: heavy impact → error notification
  delete: () => {
    haptics.heavyPress();
    setTimeout(() => haptics.error(), 80);
  },

  // Reach end of feed: subtle selection tick
  feedEnd: () => {
    haptics.selection();
  },

  // Pull-to-refresh trigger: medium impact
  refresh: () => {
    haptics.press();
  },

  // Tab switch: selection tick
  tabSwitch: () => {
    haptics.selection();
  },

  // Toggle: light tap
  toggle: () => {
    haptics.tap();
  },

  // Long-press reveal: heavy impact
  longPress: () => {
    haptics.heavyPress();
  },

  // Co-Own unit purchased: success → light tap
  coOwnUnit: () => {
    haptics.success();
    setTimeout(() => haptics.tap(), 120);
  },

  // Auction won: success → success (double celebration)
  auctionWon: () => {
    haptics.success();
    setTimeout(() => haptics.success(), 200);
  },

  // Save / bookmark: light tap → selection
  save: () => {
    haptics.tap();
    setTimeout(() => haptics.selection(), 40);
  },
};
