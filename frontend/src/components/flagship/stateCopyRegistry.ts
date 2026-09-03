/**
 * State copy registry — the single source of truth for loading / empty /
 * error / offline / unavailable / partial / conflict copy across ThryftVerse.
 *
 * Design principles (2026 empty-state research):
 *   - Empty states are product surfaces, not placeholders.
 *   - Three empty-state families need different treatment:
 *       firstUse  — show the space, explain it, one primary action.
 *       cleared   — acknowledge the achievement, do not apologize.
 *       error     — explain why it is empty, offer recovery.
 *   - Never leave a dead end — every state offers one clear next step.
 *   - Preserve the working context (list name, filters, scope, query).
 *   - Copy is short, factual and action-oriented. No AI tone
 *     (no "✨", "Oops!", "Uh oh", "Whoops"). No exclamation marks in
 *     headlines. Empty state ≠ error state — different copy for each.
 *
 * Two resolution paths exist:
 *   1. `getStateCopy(domain, variant, overrides?)` — legacy domain-keyed
 *      lookup. Kept for existing callers and as the generic fallback.
 *   2. `resolveStateCopy(variant, context, overrides?)` — context-aware
 *      lookup that picks a screen-specific first-use / cleared / error
 *      message and interpolates working context (query, permission, …).
 *      `FlagshipState` uses this when a `context` prop is supplied.
 */
export type StateVariant =
  | 'loading'
  | 'empty'
  | 'error'
  | 'offline'
  | 'unavailable'
  | 'partial'
  | 'conflict';

/**
 * Icon concepts used by state copy. These are semantic concepts, not raw
 * glyph names — `FlagshipState` maps each concept to a concrete Ionicons
 * outline glyph so the icon family stays consistent (AGENTS §4 icon grammar).
 */
export type IconConcept =
  | 'search'
  | 'camera'
  | 'chat'
  | 'bookmark'
  | 'archive'
  | 'store'
  | 'chart'
  | 'bag'
  | 'tag'
  | 'star'
  | 'bell'
  | 'wifi'
  | 'lock'
  | 'clock'
  | 'image'
  | 'sync'
  | 'alert'
  | 'refresh'
  | 'back';

export interface StateCopy {
  /** Short, factual headline. Never ends in an exclamation mark. */
  headline?: string;
  /** One sentence explaining why the surface is in this state. */
  body?: string;
  /** Label for the single primary next step. */
  actionLabel?: string;
  /** Semantic icon concept for the primary action / state glyph. */
  actionIcon?: IconConcept;
  /** Optional escape-hatch label (secondary action). */
  secondaryAction?: string;
  /** Optional icon concept for the secondary action. */
  secondaryActionIcon?: IconConcept;
  // ── Legacy aliases (backwards compatibility) ───────────────────────────
  /** @deprecated use `headline`. */
  title?: string;
  /** @deprecated use `body`. */
  subtitle?: string;
  /** @deprecated use `secondaryAction`. */
  secondaryActionLabel?: string;
}

export type Domain =
  | 'inbox' | 'chat' | 'discovery' | 'pdp' | 'checkout'
  | 'settings' | 'sellerHub' | 'analytics' | 'inventory'
  | 'orders' | 'wallet' | 'profile' | 'search' | 'generic';

type CopyMap = Record<StateVariant, StateCopy>;

// ---------------------------------------------------------------------------
// Screen keys — the surfaces that own a contextual empty-state voice.
// ---------------------------------------------------------------------------
export type ScreenKey =
  | 'homeFeed'
  | 'searchResults'
  | 'inbox'
  | 'myListings'
  | 'soldComps'
  | 'sellerHub'
  | 'orders'
  | 'offers'
  | 'watchlist'
  | 'reviews'
  | 'settingsNotifications'
  | 'checkoutCart';

/** Why an empty surface is empty. `firstUse` vs `cleared` need different copy. */
export type EmptyReason = 'firstUse' | 'cleared';

/** Why an error-adjacent empty surface is empty. */
export type ErrorReason = 'network' | 'permission' | 'rateLimited';

/**
 * Context carried by a state surface. When passed to `FlagshipState` (or
 * `resolveStateCopy`), it selects screen-specific copy and interpolates
 * working context so the message preserves the user's scope.
 */
export interface StateCopyContext {
  /** Screen that owns the empty state. Selects the contextual voice. */
  screen?: ScreenKey;
  /** Distinguishes first-use from cleared for empty states. */
  emptyReason?: EmptyReason;
  /** Selects an error-adjacent message for error/offline variants. */
  errorReason?: ErrorReason;
  /** Active search query (search results). Preserves working context. */
  query?: string;
  /** Permission name (error-adjacent permission state). */
  permission?: string;
  /** Feature blocked by the missing permission. */
  feature?: string;
  /** Human-readable screen name for generic network errors. */
  screenLabel?: string;
}

// ---------------------------------------------------------------------------
// Generic copy — the last-resort fallback. Refined to avoid AI tone and to
// always offer a next step.
// ---------------------------------------------------------------------------
const GENERIC_COPY: CopyMap = {
  loading: { headline: 'Loading', body: 'One moment while this loads.' },
  empty: {
    headline: 'Nothing here yet',
    body: 'Content will appear here once it is available.',
    actionLabel: 'Refresh',
    actionIcon: 'refresh',
  },
  error: {
    headline: 'Could not load this',
    body: 'Check your connection and try again.',
    actionLabel: 'Retry',
    actionIcon: 'wifi',
  },
  offline: {
    headline: 'You are offline',
    body: 'Reconnect to load the latest content.',
    actionLabel: 'Retry',
    actionIcon: 'wifi',
  },
  unavailable: {
    headline: 'Not available',
    body: 'This is not available right now.',
    actionLabel: 'Go back',
    actionIcon: 'back',
  },
  partial: {
    headline: 'Some items did not load',
    body: 'You can still browse what loaded.',
    actionLabel: 'Retry',
    actionIcon: 'refresh',
  },
  conflict: {
    headline: 'This changed',
    body: 'This was updated elsewhere.',
    actionLabel: 'Refresh',
    actionIcon: 'refresh',
  },
};

// ---------------------------------------------------------------------------
// Domain copy — legacy domain-keyed entries, refined for tone and next-step.
// Used by `getStateCopy` and as the fallback when no screen context is given.
// ---------------------------------------------------------------------------
const DOMAIN_COPY: Record<Domain, Partial<CopyMap>> = {
  inbox: {
    empty: {
      headline: 'No conversations',
      body: 'Start chatting with a seller from any listing.',
      actionLabel: 'Browse listings',
      actionIcon: 'chat',
    },
    error: {
      headline: 'Could not load messages',
      body: 'Check your connection and try again.',
      actionLabel: 'Retry',
      actionIcon: 'wifi',
    },
    offline: {
      headline: 'Inbox is offline',
      body: 'Your messages will sync when you reconnect.',
      actionLabel: 'Retry',
      actionIcon: 'wifi',
    },
  },
  chat: {
    empty: {
      headline: 'Start the conversation',
      body: 'Send a message about this item.',
      actionLabel: 'Send a message',
      actionIcon: 'chat',
    },
    error: {
      headline: 'Message did not send',
      body: 'Check your connection and try again.',
      actionLabel: 'Retry',
      actionIcon: 'wifi',
    },
    offline: {
      headline: 'You are offline',
      body: 'Your message will send when you reconnect.',
    },
  },
  discovery: {
    empty: {
      headline: 'No listings nearby',
      body: 'Try expanding your search radius or browse categories.',
      actionLabel: 'Browse categories',
      actionIcon: 'search',
      secondaryAction: 'Expand search radius',
      secondaryActionIcon: 'search',
    },
    error: {
      headline: 'Could not load items',
      body: 'Pull down to refresh, or check your connection.',
      actionLabel: 'Retry',
      actionIcon: 'wifi',
    },
    loading: { headline: 'Finding items', body: 'Searching the marketplace.' },
  },
  pdp: {
    error: {
      headline: 'Could not load this item',
      body: 'It may have been removed or is temporarily unavailable.',
      actionLabel: 'Retry',
      actionIcon: 'refresh',
    },
    unavailable: {
      headline: 'Item no longer available',
      body: 'This listing has been removed by the seller or violates our policies.',
      actionLabel: 'Browse similar',
      actionIcon: 'search',
    },
  },
  checkout: {
    empty: {
      headline: 'Your bag is empty',
      body: 'Browse listings to add items.',
      actionLabel: 'Browse listings',
      actionIcon: 'bag',
    },
    error: {
      headline: 'Could not start checkout',
      body: 'Try again, or contact support if the problem continues.',
      actionLabel: 'Retry',
      actionIcon: 'refresh',
    },
    offline: {
      headline: 'Cannot checkout offline',
      body: 'Connect to the internet to complete your purchase.',
      actionLabel: 'Retry',
      actionIcon: 'wifi',
    },
  },
  settings: {
    empty: {
      headline: 'No notification preferences set',
      body: 'Configure how we contact you.',
      actionLabel: 'Set preferences',
      actionIcon: 'bell',
    },
    error: {
      headline: 'Could not load settings',
      body: 'Try again in a moment.',
      actionLabel: 'Retry',
      actionIcon: 'refresh',
    },
  },
  sellerHub: {
    empty: {
      headline: 'No listings yet',
      body: 'List your first item to see analytics here.',
      actionLabel: 'List an item',
      actionIcon: 'store',
    },
    error: {
      headline: 'Could not load your dashboard',
      body: 'Try again to see your tasks and metrics.',
      actionLabel: 'Retry',
      actionIcon: 'refresh',
    },
  },
  analytics: {
    empty: {
      headline: 'No data yet',
      body: 'Your analytics will appear here once you have sales activity.',
      actionLabel: 'List an item',
      actionIcon: 'chart',
    },
    error: {
      headline: 'Could not load analytics',
      body: 'Try again to see your performance.',
      actionLabel: 'Retry',
      actionIcon: 'refresh',
    },
    partial: {
      headline: 'Some metrics are unavailable',
      body: 'Showing what we can load. Try again for the full picture.',
      actionLabel: 'Retry',
      actionIcon: 'refresh',
    },
  },
  inventory: {
    empty: {
      headline: 'No listings in your store',
      body: 'Tap the camera button to add your first item.',
      actionLabel: 'Add a listing',
      actionIcon: 'camera',
    },
    error: {
      headline: 'Could not load your listings',
      body: 'Try again to see your inventory.',
      actionLabel: 'Retry',
      actionIcon: 'refresh',
    },
  },
  orders: {
    empty: {
      headline: 'No orders yet',
      body: 'When you buy or sell, orders appear here with tracking.',
      actionLabel: 'Browse listings',
      actionIcon: 'bag',
    },
    error: {
      headline: 'Could not load orders',
      body: 'Try again to see your order history.',
      actionLabel: 'Retry',
      actionIcon: 'refresh',
    },
  },
  wallet: {
    empty: {
      headline: 'No transactions yet',
      body: 'Your earnings and payouts will appear here.',
      actionLabel: 'List an item',
      actionIcon: 'store',
    },
    error: {
      headline: 'Could not load wallet',
      body: 'Try again to see your balance and history.',
      actionLabel: 'Retry',
      actionIcon: 'refresh',
    },
  },
  profile: {
    empty: {
      headline: 'No listings yet',
      body: 'This user has not listed any items.',
      actionLabel: 'Browse listings',
      actionIcon: 'search',
    },
    error: {
      headline: 'Could not load profile',
      body: 'Try again in a moment.',
      actionLabel: 'Retry',
      actionIcon: 'refresh',
    },
  },
  search: {
    empty: {
      headline: 'No results',
      body: 'Try different keywords or browse categories.',
      actionLabel: 'Browse categories',
      actionIcon: 'search',
    },
    error: {
      headline: 'Search failed',
      body: 'Try again, or browse categories instead.',
      actionLabel: 'Retry',
      actionIcon: 'refresh',
    },
  },
  generic: {},
};

// ---------------------------------------------------------------------------
// Screen-specific empty states — first-use vs cleared.
// These are the contextual, anti-generic messages. Each preserves the
// working context and offers one clear next step.
// ---------------------------------------------------------------------------
type ScreenEmptyCopy = {
  firstUse: StateCopy;
  cleared: StateCopy;
};

const SCREEN_EMPTY_COPY: Record<ScreenKey, ScreenEmptyCopy> = {
  homeFeed: {
    firstUse: {
      headline: 'No listings nearby',
      body: 'Try expanding your search radius or browse categories.',
      actionLabel: 'Browse categories',
      actionIcon: 'search',
      secondaryAction: 'Expand search radius',
      secondaryActionIcon: 'search',
    },
    cleared: {
      headline: 'No listings in this area',
      body: 'Adjust your filters or expand the search radius to see more.',
      actionLabel: 'Clear filters',
      actionIcon: 'search',
    },
  },
  searchResults: {
    firstUse: {
      headline: 'No results yet',
      body: 'Search for something to see results here.',
      actionLabel: 'Browse categories',
      actionIcon: 'search',
    },
    cleared: {
      // `query` is interpolated by `resolveStateCopy` when provided.
      headline: 'No results',
      body: 'Try a different term or clear filters.',
      actionLabel: 'Clear filters',
      actionIcon: 'search',
      secondaryAction: 'Edit search',
      secondaryActionIcon: 'search',
    },
  },
  inbox: {
    firstUse: {
      headline: 'No conversations yet',
      body: 'Start chatting with a seller from any listing.',
      actionLabel: 'Browse listings',
      actionIcon: 'chat',
    },
    cleared: {
      headline: 'Inbox cleared',
      body: 'New messages will appear here.',
      actionLabel: 'Browse listings',
      actionIcon: 'chat',
    },
  },
  myListings: {
    firstUse: {
      headline: 'No listings in your store',
      body: 'Tap the camera button to add your first item.',
      actionLabel: 'Add a listing',
      actionIcon: 'camera',
    },
    cleared: {
      headline: 'All listings archived',
      body: 'Your active listings will appear here.',
      actionLabel: 'Add a listing',
      actionIcon: 'camera',
    },
  },
  soldComps: {
    firstUse: {
      headline: 'No sold comparables yet',
      body: 'Listings appear here after your first sale.',
      actionLabel: 'View your listings',
      actionIcon: 'tag',
    },
    cleared: {
      headline: 'No sold comparables in this range',
      body: 'Sold listings will appear here after your next sale.',
      actionLabel: 'View your listings',
      actionIcon: 'tag',
    },
  },
  sellerHub: {
    firstUse: {
      headline: 'No listings yet',
      body: 'List your first item to see analytics here.',
      actionLabel: 'List an item',
      actionIcon: 'store',
    },
    cleared: {
      headline: 'No active listings',
      body: 'List an item to see analytics and orders here.',
      actionLabel: 'List an item',
      actionIcon: 'store',
    },
  },
  orders: {
    firstUse: {
      headline: 'No orders yet',
      body: 'When you buy or sell, orders appear here with tracking.',
      actionLabel: 'Browse listings',
      actionIcon: 'bag',
    },
    cleared: {
      headline: 'No orders in this view',
      body: 'Change the filter to see completed or cancelled orders.',
      actionLabel: 'Clear filters',
      actionIcon: 'refresh',
    },
  },
  offers: {
    firstUse: {
      headline: 'No offers yet',
      body: 'Make an offer on any listing to start negotiating.',
      actionLabel: 'Browse listings',
      actionIcon: 'tag',
    },
    cleared: {
      headline: 'No offers in this view',
      body: 'New offers will appear here as they come in.',
      actionLabel: 'Browse listings',
      actionIcon: 'tag',
    },
  },
  watchlist: {
    firstUse: {
      headline: 'No saved items',
      body: 'Tap the bookmark on any listing to save it here.',
      actionLabel: 'Browse listings',
      actionIcon: 'bookmark',
    },
    cleared: {
      headline: 'All saved items removed',
      body: 'Bookmark listings to save them here.',
      actionLabel: 'Browse listings',
      actionIcon: 'bookmark',
    },
  },
  reviews: {
    firstUse: {
      headline: 'No reviews yet',
      body: 'After your first transaction, buyers can leave reviews.',
      actionLabel: 'Browse listings',
      actionIcon: 'star',
    },
    cleared: {
      headline: 'No reviews in this view',
      body: 'Reviews will appear here after completed transactions.',
      actionLabel: 'Browse listings',
      actionIcon: 'star',
    },
  },
  settingsNotifications: {
    firstUse: {
      headline: 'No notification preferences set',
      body: 'Configure how we contact you.',
      actionLabel: 'Set preferences',
      actionIcon: 'bell',
    },
    cleared: {
      headline: 'Notifications turned off',
      body: 'Re-enable notifications to stay informed about orders and messages.',
      actionLabel: 'Set preferences',
      actionIcon: 'bell',
    },
  },
  checkoutCart: {
    firstUse: {
      headline: 'Your bag is empty',
      body: 'Browse listings to add items.',
      actionLabel: 'Browse listings',
      actionIcon: 'bag',
    },
    cleared: {
      headline: 'Your bag is empty',
      body: 'Items you add will appear here before checkout.',
      actionLabel: 'Browse listings',
      actionIcon: 'bag',
    },
  },
};

// ---------------------------------------------------------------------------
// Error-adjacent states — explain why it is empty and offer recovery.
// Distinct from the generic error copy: these name the cause.
// ---------------------------------------------------------------------------
const ERROR_COPY: Record<ErrorReason, StateCopy> = {
  network: {
    // `screenLabel` is interpolated by `resolveStateCopy` when provided.
    headline: 'Could not load this',
    body: 'Check your connection and try again.',
    actionLabel: 'Retry',
    actionIcon: 'wifi',
  },
  permission: {
    // `permission` + `feature` interpolated by `resolveStateCopy`.
    headline: 'Allow access',
    body: 'Grant access to see this content.',
    actionLabel: 'Allow access',
    actionIcon: 'lock',
  },
  rateLimited: {
    headline: 'Too many requests',
    body: 'Wait a moment and try again.',
    actionLabel: 'Retry',
    actionIcon: 'clock',
  },
};

// ---------------------------------------------------------------------------
// Resolution helpers
// ---------------------------------------------------------------------------

/**
 * Legacy domain-keyed lookup. Returns domain-specific copy when available,
 * falling back to generic copy. Explicit overrides always win.
 *
 * Prefer `resolveStateCopy` for new contextual surfaces.
 */
export function getStateCopy(
  domain: Domain,
  variant: StateVariant,
  overrides?: Partial<StateCopy>,
): StateCopy {
  const domainCopy = DOMAIN_COPY[domain]?.[variant];
  const genericCopy = GENERIC_COPY[variant];
  const base = domainCopy ?? genericCopy;
  return mergeCopy(base, overrides);
}

/**
 * Context-aware lookup. Selects a screen-specific first-use / cleared /
 * error-adjacent message, interpolates working context (query, permission,
 * screen label), and applies overrides.
 *
 * Resolution order for empty states:
 *   1. Screen-specific first-use / cleared copy (when `context.screen` is set).
 *   2. Domain copy for the variant (legacy fallback).
 *   3. Generic copy.
 *
 * Resolution order for error / offline states:
 *   1. Error-adjacent copy for `context.errorReason`.
 *   2. Domain copy for the variant.
 *   3. Generic copy.
 */
export function resolveStateCopy(
  variant: StateVariant,
  context: StateCopyContext = {},
  overrides?: Partial<StateCopy>,
): StateCopy {
  if (variant === 'empty' && context.screen) {
    const screenCopy = SCREEN_EMPTY_COPY[context.screen];
    if (screenCopy) {
      const reason: EmptyReason = context.emptyReason ?? 'firstUse';
      const base = screenCopy[reason] ?? screenCopy.firstUse;
      return mergeCopy(interpolate(base, context), overrides);
    }
  }

  if ((variant === 'error' || variant === 'offline') && context.errorReason) {
    const base = ERROR_COPY[context.errorReason];
    if (base) {
      return mergeCopy(interpolate(base, context), overrides);
    }
  }

  // No contextual match — fall back to generic copy for the variant.
  return mergeCopy(GENERIC_COPY[variant], overrides);
}

/** Merge two StateCopy records; non-undefined values in `over` win. */
function mergeCopy(base: StateCopy, over?: Partial<StateCopy>): StateCopy {
  if (!over) return { ...base };
  const out: StateCopy = { ...base };
  (Object.keys(over) as (keyof StateCopy)[]).forEach((key) => {
    const v = over[key];
    if (v !== undefined) {
      (out as Record<string, unknown>)[key] = v;
    }
  });
  return out;
}

/**
 * Interpolate working-context placeholders into copy. Keeps the user's scope
 * visible (the active query, the missing permission, the screen name).
 */
function interpolate(copy: StateCopy, ctx: StateCopyContext): StateCopy {
  const fill = (text?: string): string | undefined => {
    if (!text) return text;
    let out = text;
    if (ctx.query !== undefined) {
      out = out.split('{query}').join(ctx.query);
    }
    if (ctx.permission !== undefined) {
      out = out.split('{permission}').join(ctx.permission);
    }
    if (ctx.feature !== undefined) {
      out = out.split('{feature}').join(ctx.feature);
    }
    if (ctx.screenLabel !== undefined) {
      out = out.split('{screen}').join(ctx.screenLabel);
    }
    return out;
  };

  // Search-results cleared state surfaces the active query in the headline.
  if (ctx.screen === 'searchResults' && ctx.query !== undefined && copy.headline === 'No results') {
    return {
      ...copy,
      headline: `No results for "${ctx.query}"`,
      body: fill(copy.body) ?? copy.body,
    };
  }

  // Permission error surfaces the permission + feature.
  if (ctx.errorReason === 'permission') {
    const perm = ctx.permission ?? 'this';
    const feat = ctx.feature ?? 'this content';
    return {
      ...copy,
      headline: `Allow ${perm} access`,
      body: `Grant access to see ${feat}.`,
      actionLabel: copy.actionLabel ?? 'Allow access',
    };
  }

  // Network error surfaces the screen name when provided.
  if (ctx.errorReason === 'network' && ctx.screenLabel !== undefined) {
    return {
      ...copy,
      headline: `Couldn't load ${ctx.screenLabel}`,
      body: copy.body ?? 'Check your connection and try again.',
    };
  }

  return {
    ...copy,
    headline: fill(copy.headline),
    body: fill(copy.body),
  };
}
