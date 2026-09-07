/**
 * commandPaletteApi — Linear-style command registry for the ThryftVerse
 * command palette.
 *
 * This service is the single source of truth for every command the palette
 * can surface. It is deliberately decoupled from React/React Navigation so it
 * can be unit-tested in isolation and consumed by any UI host.
 *
 * Truthful by design (AGENTS.md §11): every navigation/action command maps to
 * a real route that exists in AppNavigator. No fabricated destinations, no
 * "Coming soon" stubs. Settings commands toggle real persisted preferences.
 * Help commands open real support surfaces.
 *
 * Categories follow the Linear model:
 *   - navigation: go to a screen
 *   - action:     create / start / perform a primary verb
 *   - search:     open a search surface (global, category, conversational, visual)
 *   - settings:   adjust a preference or open a settings sub-department
 *   - help:       contact support, report a bug, view legal info
 */
import { updateThemePreference } from '../theme/themePreference';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CommandCategory =
  | 'navigation'
  | 'action'
  | 'search'
  | 'settings'
  | 'help';

export interface Command {
  id: string;
  label: string;
  subtitle?: string;
  category: CommandCategory;
  /** Ionicons glyph name (e.g. 'home-outline'). */
  icon?: string;
  /** Additional tokens searched in addition to label/subtitle. */
  keywords?: string[];
  /** Run the command. Bound to a navigation/context at getCommands() time. */
  action: () => void;
  /** Display-only shortcut hint (e.g. '⌘K'). Never captured. */
  shortcut?: string;
}

/**
 * Minimal navigation surface the registry needs. Typed as a structural
 * `navigate` method so the service stays decoupled from React Navigation's
 * concrete prop types while still being type-checked at the call site.
 */
export interface CommandNavigation {
  navigate: (route: string, params?: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------
// Fuzzy matching — subsequence + Levenshtein hybrid
// ---------------------------------------------------------------------------

/**
 * Levenshtein edit distance between two strings. Used to rank near-misses
 * (typos) once a subsequence match has been established. Capped at the
 * shorter string length so it stays O(n*m) but cheap for short queries.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

/** True if every char of `query` appears in `target` in order (subsequence). */
export function isSubsequence(query: string, target: string): boolean {
  if (!query) return true;
  let qi = 0;
  for (let ti = 0; ti < target.length && qi < query.length; ti++) {
    if (target[ti] === query[qi]) qi++;
  }
  return qi === query.length;
}

interface CandidateScore {
  /** 0 none | 1 fuzzy subsequence | 2 word-prefix | 3 exact */
  tier: 0 | 1 | 2 | 3;
  score: number;
}

/**
 * Score a single candidate string against the query. Higher is better.
 * Combines subsequence density (tighter matches rank higher) with a
 * Levenshtein penalty so close typo-matches still surface.
 */
function scoreCandidate(query: string, candidate: string): CandidateScore {
  if (!query) return { tier: 3, score: 0 };
  const q = query.toLowerCase();
  const c = candidate.toLowerCase();
  if (c === q) return { tier: 3, score: 1000 + (1000 - c.length) };

  // Word-boundary prefix: "sel" matches "Sell an item" on the first word.
  const words = c.split(/[\s-_/.]+/);
  for (const w of words) {
    if (w.startsWith(q)) return { tier: 2, score: 600 + (500 - w.length) };
  }

  if (c.startsWith(q)) return { tier: 2, score: 500 + (500 - c.length) };

  if (isSubsequence(q, c)) {
    const density = q.length / c.length;
    // Fold in a Levenshtein closeness bonus so "wlalet" still ranks "wallet".
    const dist = levenshtein(q, c);
    const closeness = Math.max(0, 1 - dist / Math.max(q.length, c.length));
    return { tier: 1, score: Math.round(density * 80 + closeness * 20) };
  }

  // Last resort: small Levenshtein distance (typo tolerance).
  const dist = levenshtein(q, c);
  if (dist > 0 && dist <= Math.max(1, Math.floor(q.length / 2))) {
    return { tier: 1, score: Math.round((1 - dist / c.length) * 60) };
  }

  return { tier: 0, score: 0 };
}

/** Score a Command across its label, subtitle and keywords. */
function scoreCommand(query: string, command: Command): CandidateScore {
  if (!query) return { tier: 3, score: 0 };
  const labelScore = scoreCandidate(query, command.label);
  const subScore = command.subtitle
    ? scoreCandidate(query, command.subtitle)
    : { tier: 0 as const, score: 0 };
  const kwScores = (command.keywords ?? []).map((k) => scoreCandidate(query, k));
  const all = [labelScore, subScore, ...kwScores];
  let best = all[0];
  for (const s of all) {
    if (s.tier > best.tier || (s.tier === best.tier && s.score > best.score)) {
      best = s;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Command catalog
// ---------------------------------------------------------------------------

/**
 * Build the full command list, binding each command's `action` to the given
 * navigation surface. Commands are recreated per call so the bound navigation
 * is always current (e.g. after a navigator re-mount).
 *
 * Every route referenced here is registered in AppNavigator (AGENTS.md §11).
 */
export function getCommands(navigation: CommandNavigation): Command[] {
  const nav = (route: string, params?: Record<string, unknown>) => () =>
    navigation.navigate(route, params);

  const navigationCommands: Command[] = [
    {
      id: 'nav-home',
      label: 'Home',
      subtitle: 'Go to your feed',
      category: 'navigation',
      icon: 'home-outline',
      keywords: ['feed', 'main', 'for you', 'foryou'],
      action: nav('MainTabs', { screen: 'Home' }),
    },
    {
      id: 'nav-explore',
      label: 'Explore',
      subtitle: 'Discover the marketplace',
      category: 'navigation',
      icon: 'search-outline',
      keywords: ['discover', 'browse', 'trending'],
      action: nav('MainTabs', { screen: 'Explore' }),
    },
    {
      id: 'nav-search',
      label: 'Search',
      subtitle: 'Browse the marketplace',
      category: 'navigation',
      icon: 'search-outline',
      keywords: ['global search', 'find', 'lookup'],
      action: nav('UnifiedDiscovery'),
    },
    {
      id: 'nav-sell',
      label: 'Sell',
      subtitle: 'List something new',
      category: 'navigation',
      icon: 'bag-handle-outline',
      keywords: ['list', 'listing', 'add item'],
      action: nav('Sell'),
    },
    {
      id: 'nav-wallet',
      label: 'Wallet',
      subtitle: 'Balance & payouts',
      category: 'navigation',
      icon: 'wallet-outline',
      keywords: ['balance', 'money', 'payouts', 'funds', 'cash'],
      action: nav('Wallet'),
    },
    {
      id: 'nav-profile',
      label: 'Profile',
      subtitle: 'Your closet & looks',
      category: 'navigation',
      icon: 'person-outline',
      keywords: ['me', 'my profile', 'closet', 'account'],
      action: nav('MainTabs', { screen: 'Profile' }),
    },
    {
      id: 'nav-settings',
      label: 'Settings',
      subtitle: 'Preferences & account',
      category: 'navigation',
      icon: 'settings-outline',
      keywords: ['preferences', 'config', 'gear'],
      action: nav('Settings'),
    },
    {
      id: 'nav-inbox',
      label: 'Inbox',
      subtitle: 'Messages & chats',
      category: 'navigation',
      icon: 'chatbubbles-outline',
      keywords: ['messages', 'chat', 'dm', 'conversations'],
      action: nav('MainTabs', { screen: 'Inbox' }),
    },
    {
      id: 'nav-notifications',
      label: 'Notifications',
      subtitle: 'Activity & alerts',
      category: 'navigation',
      icon: 'notifications-outline',
      keywords: ['alerts', 'activity', 'bell'],
      action: nav('NotificationsList'),
    },
    {
      id: 'nav-closet',
      label: 'Closet',
      subtitle: 'Your wardrobe',
      category: 'navigation',
      icon: 'shirt-outline',
      keywords: ['wardrobe', 'my items', 'closet'],
      action: nav('Closet'),
    },
    {
      id: 'nav-portfolio',
      label: 'Portfolio',
      subtitle: 'Holdings & positions',
      category: 'navigation',
      icon: 'pie-chart-outline',
      keywords: ['holdings', 'positions', 'investments'],
      action: nav('Portfolio'),
    },
    {
      id: 'nav-auctions',
      label: 'Auctions',
      subtitle: 'Live & upcoming bidding',
      category: 'navigation',
      icon: 'trophy-outline',
      keywords: ['bidding', 'auction home', 'live auction'],
      action: nav('AuctionHome'),
    },
    {
      id: 'nav-coownhub',
      label: 'Co-Own Hub',
      subtitle: 'Co-Own market & exchange',
      category: 'navigation',
      icon: 'trending-up-outline',
      keywords: ['co own', 'market', 'exchange', 'trade'],
      action: nav('CoOwnHub'),
    },
    {
      id: 'nav-galleria',
      label: 'Galleria',
      subtitle: 'Curated Co-Own collections',
      category: 'navigation',
      icon: 'grid-outline',
      keywords: ['gallery', 'editorial', 'curated'],
      action: nav('Galleria'),
    },
    {
      id: 'nav-mybids',
      label: 'My Bids',
      subtitle: 'Auction bids you placed',
      category: 'navigation',
      icon: 'flag-outline',
      keywords: ['bids', 'auction bids'],
      action: nav('MyBids'),
    },
    {
      id: 'nav-mylistings',
      label: 'My Listings',
      subtitle: 'Your seller inventory',
      category: 'navigation',
      icon: 'list-outline',
      keywords: ['seller', 'my items', 'inventory'],
      action: nav('MyListings'),
    },
    {
      id: 'nav-myorders',
      label: 'My Orders',
      subtitle: 'Purchases & fulfilment',
      category: 'navigation',
      icon: 'bag-handle-outline',
      keywords: ['purchases', 'orders', 'buying'],
      action: nav('MyOrders'),
    },
    {
      id: 'nav-marketledger',
      label: 'Market Ledger',
      subtitle: 'Order history',
      category: 'navigation',
      icon: 'receipt-outline',
      keywords: ['orders', 'ledger', 'history'],
      action: nav('MarketLedger'),
    },
  ];

  const actionCommands: Command[] = [
    {
      id: 'action-create-listing',
      label: 'Create listing',
      subtitle: 'List a new item for sale',
      category: 'action',
      icon: 'bag-handle-outline',
      keywords: ['sell', 'list', 'new item', 'add listing', 'create listing'],
      action: nav('Sell'),
    },
    {
      id: 'action-ai-listing',
      label: 'Quick listing',
      subtitle: 'Create a listing with suggestions',
      category: 'action',
      icon: 'document-text-outline',
      keywords: ['ai', 'smart sell', 'auto listing', 'generate'],
      action: nav('AIPoweredListing'),
    },
    {
      id: 'action-bulk-listing',
      label: 'Bulk listing',
      subtitle: 'List multiple items at once',
      category: 'action',
      icon: 'copy-outline',
      keywords: ['bulk', 'batch', 'multiple listings', 'pro seller'],
      action: nav('BulkListing'),
    },
    {
      id: 'action-create-auction',
      label: 'Create auction',
      subtitle: 'Start a new auction',
      category: 'action',
      icon: 'hammer-outline',
      keywords: ['auction', 'bidding', 'sell auction', 'start auction'],
      action: nav('CreateAuction'),
    },
    {
      id: 'action-create-coown',
      label: 'Create Co-Own offering',
      subtitle: 'Fractionalise an asset',
      category: 'action',
      icon: 'people-outline',
      keywords: ['co own', 'syndicate', 'fractional', 'create co own'],
      action: nav('CreateCoOwn'),
    },
    {
      id: 'action-start-live',
      label: 'Start live stream',
      subtitle: 'Broadcast a live shopping session',
      category: 'action',
      icon: 'videocam-outline',
      keywords: ['live', 'stream', 'broadcast', 'live shopping', 'whatnot'],
      action: nav('LiveStreamSeller'),
    },
    {
      id: 'action-create-moodboard',
      label: 'Create moodboard',
      subtitle: 'Build an editorial collage',
      category: 'action',
      icon: 'images-outline',
      keywords: ['mood board', 'collage', 'inspiration', 'moodboard'],
      action: nav('MoodboardEditor'),
    },
    {
      id: 'action-create-look',
      label: 'Create a look',
      subtitle: 'Style an outfit',
      category: 'action',
      icon: 'shirt-outline',
      keywords: ['look', 'outfit', 'style', 'creator', 'poster'],
      action: nav('CreatorStudio', { type: 'look' }),
    },
    {
      id: 'action-create-collection',
      label: 'Create collection',
      subtitle: 'Curate a themed collection',
      category: 'action',
      icon: 'folder-open-outline',
      keywords: ['collection', 'curate', 'group items'],
      action: nav('CreateCollection'),
    },
    {
      id: 'action-new-message',
      label: 'New message',
      subtitle: 'Start a conversation',
      category: 'action',
      icon: 'create-outline',
      keywords: ['message', 'dm', 'chat', 'new conversation'],
      action: nav('NewMessage'),
    },
    {
      id: 'action-invite-friends',
      label: 'Invite friends',
      subtitle: 'Share ThryftVerse',
      category: 'action',
      icon: 'person-add-outline',
      keywords: ['invite', 'refer', 'share', 'friends'],
      action: nav('InviteFriends'),
    },
    {
      id: 'action-withdraw',
      label: 'Withdraw funds',
      subtitle: 'Move balance to your bank',
      category: 'action',
      icon: 'cash-outline',
      keywords: ['withdraw', 'payout', 'bank', 'cash out'],
      action: nav('Withdraw'),
    },
  ];

  const searchCommands: Command[] = [
    {
      id: 'search-global',
      label: 'Search for items',
      subtitle: 'Browse the marketplace',
      category: 'search',
      icon: 'search-outline',
      keywords: ['global search', 'find', 'items', 'products'],
      action: nav('UnifiedDiscovery'),
    },
    {
      id: 'search-category',
      label: 'Search by category',
      subtitle: 'Browse the category tree',
      category: 'search',
      icon: 'file-tray-outline',
      keywords: ['category', 'categories', 'browse', 'tree'],
      action: nav('CategoryTree', { categoryPrefix: '' }),
    },
    {
      id: 'search-conversational',
      label: 'Ask AI (conversational search)',
      subtitle: 'Search in natural language',
      category: 'search',
      icon: 'chatbubble-ellipses-outline',
      keywords: ['ai search', 'ask', 'natural language', 'conversational'],
      action: nav('ConversationalSearch'),
    },
    {
      id: 'search-visual',
      label: 'Visual search',
      subtitle: 'Search with your camera',
      category: 'search',
      icon: 'camera-outline',
      keywords: ['visual', 'camera', 'image search', 'photo search'],
      action: nav('VisualSearch'),
    },
    {
      id: 'search-saved',
      label: 'Saved searches',
      subtitle: 'Search alerts',
      category: 'search',
      icon: 'bookmark-outline',
      keywords: ['saved', 'alerts', 'search alerts'],
      action: nav('SavedSearches'),
    },
  ];

  const settingsCommands: Command[] = [
    {
      id: 'settings-toggle-dark',
      label: 'Toggle dark mode',
      subtitle: 'Switch between light and dark theme',
      category: 'settings',
      icon: 'moon-outline',
      keywords: ['dark mode', 'light mode', 'theme', 'appearance', 'night'],
      action: () => {
        // Toggle to the opposite of the currently applied scheme. We read
        // the live Appearance value rather than the persisted preference so
        // the toggle reflects what the user actually sees.
        try {
          const { Appearance } = require('react-native');
          const current = Appearance.getColorScheme() ?? 'light';
          const next = current === 'dark' ? 'light' : 'dark';
          void updateThemePreference(next);
        } catch {
          // Best-effort — never block the palette.
        }
      },
    },
    {
      id: 'settings-ai-preferences',
      label: 'Open AI preferences',
      subtitle: 'Control AI features & providers',
      category: 'settings',
      icon: 'bulb-outline',
      keywords: ['ai', 'preferences', 'provider', 'openai', 'anthropic', 'gemini'],
      action: nav('AIPreferences'),
    },
    {
      id: 'settings-ai-integration',
      label: 'AI agent integration',
      subtitle: 'Bring your own API key',
      category: 'settings',
      icon: 'key-outline',
      keywords: ['ai', 'api key', 'integration', 'agent', 'byok'],
      action: nav('AIAgentIntegration'),
    },
    {
      id: 'settings-agent-activity',
      label: 'Agent activity',
      subtitle: 'Record of agent actions and approvals',
      category: 'settings',
      icon: 'list-outline',
      keywords: ['agent', 'activity', 'ledger', 'log', 'approval', 'tool'],
      action: nav('AgentLedger'),
    },
    {
      id: 'settings-notifications',
      label: 'Notification preferences',
      subtitle: 'Push, email & in-app alerts',
      category: 'settings',
      icon: 'notifications-outline',
      keywords: ['notifications', 'push', 'email', 'alerts'],
      action: nav('NotificationPreferences'),
    },
    {
      id: 'settings-privacy',
      label: 'Privacy & data',
      subtitle: 'Privacy settings & data export',
      category: 'settings',
      icon: 'lock-closed-outline',
      keywords: ['privacy', 'data', 'gdpr', 'export'],
      action: nav('DataPrivacy'),
    },
    {
      id: 'settings-accessibility',
      label: 'Accessibility',
      subtitle: 'Reduce motion, text size & more',
      category: 'settings',
      icon: 'accessibility-outline',
      keywords: ['accessibility', 'reduce motion', 'text size', 'a11y'],
      action: nav('AccessibilitySettings'),
    },
    {
      id: 'settings-sustainability',
      label: 'Sustainability preferences',
      subtitle: 'Eco-impact & shipping defaults',
      category: 'settings',
      icon: 'leaf-outline',
      keywords: ['sustainability', 'eco', 'green', 'carbon'],
      action: nav('SustainabilityPreferences'),
    },
    {
      id: 'settings-account',
      label: 'Account settings',
      subtitle: 'Email, password & security',
      category: 'settings',
      icon: 'person-circle-outline',
      keywords: ['account', 'email', 'password', 'security', '2fa'],
      action: nav('AccountSettings'),
    },
    {
      id: 'settings-payments',
      label: 'Payments & payouts',
      subtitle: 'Bank accounts & payout methods',
      category: 'settings',
      icon: 'card-outline',
      keywords: ['payments', 'payouts', 'bank', 'card', 'stripe'],
      action: nav('Payments'),
    },
    {
      id: 'settings-personalisation',
      label: 'Personalisation',
      subtitle: 'Style quiz & feed tuning',
      category: 'settings',
      icon: 'color-palette-outline',
      keywords: ['personalisation', 'style quiz', 'feed', 'preferences'],
      action: nav('Personalisation'),
    },
  ];

  const helpCommands: Command[] = [
    {
      id: 'help-contact-support',
      label: 'Contact support',
      subtitle: 'Get help from our team',
      category: 'help',
      icon: 'headset-outline',
      keywords: ['support', 'contact', 'help', 'ticket'],
      action: nav('HelpSupport'),
    },
    {
      id: 'help-report-bug',
      label: 'Report a bug',
      subtitle: 'Tell us what went wrong',
      category: 'help',
      icon: 'bug-outline',
      keywords: ['bug', 'report', 'issue', 'problem', 'feedback'],
      action: nav('HelpSupport'),
    },
    {
      id: 'help-resolution-centre',
      label: 'Resolution centre',
      subtitle: 'Resolve order & dispute issues',
      category: 'help',
      icon: 'checkmark-circle-outline',
      keywords: ['resolution', 'dispute', 'claim', 'buyer protection'],
      action: nav('ResolutionCentre'),
    },
    {
      id: 'help-buyer-protection',
      label: 'Buyer protection',
      subtitle: 'How you are protected',
      category: 'help',
      icon: 'checkmark-circle-outline',
      keywords: ['buyer protection', 'guarantee', 'safety', 'protection'],
      action: nav('BuyerProtection', { orderId: '' }),
    },
    {
      id: 'help-about',
      label: 'About ThryftVerse',
      subtitle: 'Version & legal info',
      category: 'help',
      icon: 'information-circle-outline',
      keywords: ['about', 'version', 'legal', 'terms', 'privacy'],
      action: nav('About'),
    },
  ];

  return [
    ...navigationCommands,
    ...actionCommands,
    ...searchCommands,
    ...settingsCommands,
    ...helpCommands,
  ];
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface ScoredCommand {
  command: Command;
  tier: 0 | 1 | 2 | 3;
  score: number;
}

/**
 * Fuzzy-search the given command list against `query`. Returns commands
 * grouped by category, preserving the canonical category order
 * (navigation → action → search → settings → help) and ranking within
 * each category by match tier then score.
 *
 * When `query` is empty, returns all commands grouped by category in
 * canonical order (used for the default palette state).
 */
export function searchCommands(query: string, commands: Command[]): Command[] {
  const q = query.trim();
  if (!q) return commands;

  const scored: ScoredCommand[] = commands.map((command) => {
    const { tier, score } = scoreCommand(q, command);
    return { command, tier, score };
  });

  return scored
    .filter((s) => s.tier > 0)
    .sort((a, b) => {
      if (b.tier !== a.tier) return b.tier - a.tier;
      return b.score - a.score;
    })
    .map((s) => s.command);
}

/** Canonical display order for categories in the palette. */
export const CATEGORY_ORDER: CommandCategory[] = [
  'navigation',
  'action',
  'search',
  'settings',
  'help',
];

/** Human-readable section labels per category. */
export const CATEGORY_LABELS: Record<CommandCategory, string> = {
  navigation: 'Navigation',
  action: 'Actions',
  search: 'Search',
  settings: 'Settings',
  help: 'Help',
};

/**
 * Group a flat command list into sections following CATEGORY_ORDER.
 * Empty sections are omitted.
 */
export function groupCommandsByCategory(
  commands: Command[],
): { category: CommandCategory; label: string; commands: Command[] }[] {
  const sections: { category: CommandCategory; label: string; commands: Command[] }[] = [];
  for (const category of CATEGORY_ORDER) {
    const items = commands.filter((c) => c.category === category);
    if (items.length > 0) {
      sections.push({
        category,
        label: CATEGORY_LABELS[category],
        commands: items,
      });
    }
  }
  return sections;
}
