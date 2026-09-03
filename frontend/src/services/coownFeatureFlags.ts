/**
 * Co-Own feature flags — runtime-controlled progressive degradation.
 *
 * Phase 4: Enables controlled launch by allowing operators to disable
 * functionality without deploying code changes. Flags are evaluated
 * at runtime and can be updated via a remote config endpoint.
 *
 * Degradation levels:
 * - normal: All systems operational
 * - light: Non-critical features disabled (analytics, notifications)
 * - moderate: Secondary features disabled (real-time updates)
 * - severe: Read-only mode (no new orders, serve cached data)
 * - paper: Paper trading mode (full flow, no real money)
 */

export type DegradationLevel = 'normal' | 'light' | 'moderate' | 'severe' | 'paper';

export interface CoOwnFeatureFlags {
  /** Current degradation level */
  level: DegradationLevel;
  /** Whether order placement is allowed */
  canPlaceOrders: boolean;
  /** Whether order cancellation is allowed */
  canCancelOrders: boolean;
  /** Whether real-time updates are enabled */
  realtimeEnabled: boolean;
  /** Whether analytics tracking is enabled */
  analyticsEnabled: boolean;
  /** Whether notifications are enabled */
  notificationsEnabled: boolean;
  /** Whether this is a paper trading environment */
  isPaperMode: boolean;
  /** Maximum order size allowed (null = no limit) */
  maxOrderSize: number | null;
  /** Allowed user IDs for restricted cohort (null = all users) */
  allowedUserIds: string[] | null;
  /** Timestamp when flags were last updated */
  lastUpdated: string;
}

const DEFAULT_FLAGS: CoOwnFeatureFlags = {
  level: 'normal',
  canPlaceOrders: true,
  canCancelOrders: true,
  realtimeEnabled: true,
  analyticsEnabled: true,
  notificationsEnabled: true,
  isPaperMode: false,
  maxOrderSize: null,
  allowedUserIds: null,
  lastUpdated: new Date().toISOString(),
};

// Degradation level → flag mapping
const LEVEL_CONFIG: Record<DegradationLevel, Partial<CoOwnFeatureFlags>> = {
  normal: {
    canPlaceOrders: true,
    canCancelOrders: true,
    realtimeEnabled: true,
    analyticsEnabled: true,
    notificationsEnabled: true,
    isPaperMode: false,
  },
  light: {
    canPlaceOrders: true,
    canCancelOrders: true,
    realtimeEnabled: true,
    analyticsEnabled: false,
    notificationsEnabled: true,
    isPaperMode: false,
  },
  moderate: {
    canPlaceOrders: true,
    canCancelOrders: true,
    realtimeEnabled: false,
    analyticsEnabled: false,
    notificationsEnabled: false,
    isPaperMode: false,
  },
  severe: {
    canPlaceOrders: false,
    canCancelOrders: true,
    realtimeEnabled: false,
    analyticsEnabled: false,
    notificationsEnabled: false,
    isPaperMode: false,
  },
  paper: {
    canPlaceOrders: true,
    canCancelOrders: true,
    realtimeEnabled: true,
    analyticsEnabled: true,
    notificationsEnabled: true,
    isPaperMode: true,
  },
};

let currentFlags: CoOwnFeatureFlags = { ...DEFAULT_FLAGS };
const listeners: Set<(flags: CoOwnFeatureFlags) => void> = new Set();

/**
 * Get the current feature flags.
 */
export function getCoOwnFlags(): CoOwnFeatureFlags {
  return { ...currentFlags };
}

/**
 * Set the degradation level. This updates all flags according to the
 * level configuration, then notifies listeners.
 */
export function setDegradationLevel(level: DegradationLevel): void {
  const config = LEVEL_CONFIG[level];
  currentFlags = {
    ...currentFlags,
    ...config,
    level,
    lastUpdated: new Date().toISOString(),
  };
  notifyListeners();
}

/**
 * Update individual flags (for fine-grained control).
 */
export function updateFlags(partial: Partial<CoOwnFeatureFlags>): void {
  currentFlags = {
    ...currentFlags,
    ...partial,
    lastUpdated: new Date().toISOString(),
  };
  notifyListeners();
}

/**
 * Check if a specific user is allowed to trade.
 */
export function isUserAllowed(userId: string): boolean {
  if (currentFlags.allowedUserIds === null) return true;
  return currentFlags.allowedUserIds.includes(userId);
}

/**
 * Check if an order size is within the allowed limit.
 */
export function isOrderSizeAllowed(units: number): boolean {
  if (currentFlags.maxOrderSize === null) return true;
  return units <= currentFlags.maxOrderSize;
}

/**
 * Subscribe to flag changes. Returns an unsubscribe function.
 */
export function subscribeToFlagChanges(
  listener: (flags: CoOwnFeatureFlags) => void
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyListeners(): void {
  const snapshot = getCoOwnFlags();
  listeners.forEach(listener => listener(snapshot));
}
