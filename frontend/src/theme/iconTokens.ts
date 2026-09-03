/**
 * Iconography Design Tokens — Thryftverse Flagship Visual System
 *
 * Authored in accordance with 2026 mobile design system benchmarks
 * (Apple SF Symbols 6, Google Material Symbols 2026, Linear, Cash App, SSENSE)
 * and the Anti-AI design charter (AGENTS.md §4 & Design.md).
 *
 * Core Principles:
 * 1. Optical Size Bands: Strictly normalized optical scales (micro to display).
 * 2. State Grammar: Outline by default; filled strictly for active/selected state.
 * 3. Hit Target Decoupling: 44pt minimum touch targets without artificial grey boxes.
 * 4. Optical Center Compensation: Centroid offset correction for asymmetrical glyphs.
 */

export type IoniconsGlyphName = string;

// ============================================================================
// OPTICAL SIZE SCALE
// ============================================================================
export const IconSize = {
  /** 12pt - Micro inline tags, subtle timestamps, tiny indicators */
  micro: 12,
  /** 14pt - Compact chip icons, table metadata, item counters */
  xs: 14,
  /** 16pt - Form helper icons, compact list badges, input prefixes */
  sm: 16,
  /** 20pt - Standard list row icons, secondary buttons, form inputs */
  md: 20,
  /** 24pt - Navigation bars, primary action buttons, tab bar items */
  lg: 24,
  /** 28pt - Bottom sheets, prominent tool controls */
  xl: 28,
  /** 32pt - Empty states, verification prompts, modal headers */
  hero: 32,
  /** 48pt - Feature banners, success celebration states */
  display: 48,
} as const;

export type IconSizeKey =
  | 'micro'
  | 'xs'
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | 'hero'
  | 'display';

// ============================================================================
// TOUCH TARGETS (Decoupled from visible glyph geometry)
// ============================================================================
export const IconHitTarget = {
  /** 44pt - Minimum accessible hit target (AGENTS.md §4, Design.md §162) */
  min: 44,
  /** 48pt - Preferred touch target for prominent floating and toolbar actions */
  preferred: 48,
} as const;

// ============================================================================
// STROKE WEIGHT NORMS
// ============================================================================
export const IconStroke = {
  /** 1.0pt - Hairline precision accents */
  hairline: 1.0,
  /** 1.75pt - Standard flagship outline stroke (balanced across DPR) */
  standard: 1.75,
  /** 2.25pt - Bold emphasis / active state indicator */
  bold: 2.25,
} as const;

// ============================================================================
// OPTICAL CENTROID OFFSETS
// Non-symmetrical geometric glyphs require fractional pixel shifts so their
// visual center of mass aligns with symmetrical bounding boxes.
// ============================================================================
export interface OpticalOffset {
  x: number;
  y: number;
}

export const IconOpticalOffset: Record<string, OpticalOffset> = {
  // Play triangle centroid is at 1/3 of its width from base -> shift right
  'play': { x: 1.5, y: 0 },
  'play-outline': { x: 1.5, y: 0 },
  'play-sharp': { x: 1.5, y: 0 },
  // Chevrons optical balance
  'chevron-forward': { x: 0.5, y: 0 },
  'chevron-back': { x: -0.5, y: 0 },
  'arrow-forward': { x: 0.5, y: 0 },
  'arrow-back': { x: -0.5, y: 0 },
  // Send / paper plane angle balance
  'paper-plane': { x: -0.5, y: -0.5 },
  'paper-plane-outline': { x: -0.5, y: -0.5 },
  'send': { x: 1.0, y: 0 },
  'send-outline': { x: 1.0, y: 0 },
};

// ============================================================================
// SEMANTIC ICON REGISTRY (Outline vs Filled State Pairs)
// ============================================================================
export interface SemanticIconDef {
  outline: IoniconsGlyphName;
  filled: IoniconsGlyphName;
  description: string;
}

export const SemanticIconMap = {
  // Navigation & Core App
  home: { outline: 'home-outline', filled: 'home', description: 'Home tab' },
  explore: { outline: 'search-outline', filled: 'search', description: 'Explore & discover' },
  search: { outline: 'search-outline', filled: 'search', description: 'Search' },
  create: { outline: 'add', filled: 'add-circle', description: 'Create action' },
  inbox: { outline: 'chatbubble-ellipses-outline', filled: 'chatbubble-ellipses', description: 'Inbox & messaging' },
  chat: { outline: 'chatbubble-outline', filled: 'chatbubble', description: 'Conversation' },
  profile: { outline: 'person-outline', filled: 'person', description: 'User profile' },
  settings: { outline: 'settings-outline', filled: 'settings', description: 'Settings' },

  // Social Engagement
  heart: { outline: 'heart-outline', filled: 'heart', description: 'Like / Favorite' },
  bookmark: { outline: 'bookmark-outline', filled: 'bookmark', description: 'Save / Bookmark' },
  share: { outline: 'share-outline', filled: 'share', description: 'Share content' },
  comment: { outline: 'chatbubble-outline', filled: 'chatbubble', description: 'Comment thread' },
  sparkles: { outline: 'bulb-outline', filled: 'bulb', description: 'Smart & AI features' },
  star: { outline: 'star-outline', filled: 'star', description: 'Rating / Featured' },
  eye: { outline: 'eye-outline', filled: 'eye', description: 'Views / Visibility' },
  eyeOff: { outline: 'eye-off-outline', filled: 'eye-off', description: 'Hidden visibility' },

  // Commerce, Cart & Wallet
  cart: { outline: 'bag-handle-outline', filled: 'bag-handle', description: 'Shopping bag / Cart' },
  pricetag: { outline: 'bag-handle-outline', filled: 'bag-handle', description: 'Listings & products' },
  wallet: { outline: 'wallet-outline', filled: 'wallet', description: 'Wallet & balance' },
  card: { outline: 'card-outline', filled: 'card', description: 'Payment card' },
  receipt: { outline: 'receipt-outline', filled: 'receipt', description: 'Order receipt' },
  box: { outline: 'car-outline', filled: 'car', description: 'Package & delivery' },
  auction: { outline: 'hammer-outline', filled: 'hammer', description: 'Auction' },
  trending: { outline: 'trending-up-outline', filled: 'trending-up', description: 'Market trend' },

  // Media & Camera
  camera: { outline: 'camera-outline', filled: 'camera', description: 'Camera capture' },
  image: { outline: 'image-outline', filled: 'image', description: 'Single image' },
  images: { outline: 'images-outline', filled: 'images', description: 'Image gallery / Carousel' },
  play: { outline: 'play-outline', filled: 'play', description: 'Play video' },
  pause: { outline: 'pause-outline', filled: 'pause', description: 'Pause video' },
  videocam: { outline: 'videocam-outline', filled: 'videocam', description: 'Video recording' },
  layers: { outline: 'layers-outline', filled: 'layers', description: 'Collage & multi-layer' },
  scan: { outline: 'scan-outline', filled: 'scan', description: 'QR / Barcode scanner' },

  // Trust, Security & Verification
  shieldCheck: { outline: 'checkmark-circle-outline', filled: 'checkmark-circle', description: 'Verified & protected' },
  lock: { outline: 'lock-closed-outline', filled: 'lock-closed', description: 'Encrypted / Secure' },
  lockOpen: { outline: 'lock-open-outline', filled: 'lock-open', description: 'Unlocked' },
  verified: { outline: 'checkmark-circle-outline', filled: 'checkmark-circle', description: 'Verified badge' },
  warning: { outline: 'warning-outline', filled: 'warning', description: 'Warning alert' },
  alert: { outline: 'alert-circle-outline', filled: 'alert-circle', description: 'Alert error' },
  info: { outline: 'information-circle-outline', filled: 'information-circle', description: 'Informational note' },
  help: { outline: 'help-circle-outline', filled: 'help-circle', description: 'Help & FAQ' },

  // Settings, Security & System
  leaf: { outline: 'leaf-outline', filled: 'leaf', description: 'Sustainability & eco-friendly' },
  accessibility: { outline: 'accessibility-outline', filled: 'accessibility', description: 'Accessibility' },
  analytics: { outline: 'stats-chart-outline', filled: 'stats-chart', description: 'Analytics & performance' },
  feed: { outline: 'newspaper-outline', filled: 'newspaper', description: 'Curated feed & algorithm' },
  compass: { outline: 'search-outline', filled: 'search', description: 'Exploration compass' },
  shield: { outline: 'lock-closed-outline', filled: 'lock-closed', description: 'Security & privacy' },
  key: { outline: 'key-outline', filled: 'key', description: 'Password & credentials' },
  link: { outline: 'link-outline', filled: 'link', description: 'Connected accounts' },
  fingerprint: { outline: 'finger-print-outline', filled: 'finger-print', description: 'Biometric authentication' },
  download: { outline: 'download-outline', filled: 'download', description: 'Data export / download' },
  mail: { outline: 'mail-outline', filled: 'mail', description: 'Email preferences' },
  globe: { outline: 'globe-outline', filled: 'globe', description: 'Language & global settings' },
  palette: { outline: 'color-palette-outline', filled: 'color-palette', description: 'Theme & appearance' },
  people: { outline: 'people-outline', filled: 'people', description: 'Agents & community' },
  repeat: { outline: 'repeat-outline', filled: 'repeat', description: 'Recurring auto-invest' },
  document: { outline: 'document-text-outline', filled: 'document-text', description: 'Tax & legal documents' },
  folder: { outline: 'folder-open-outline', filled: 'folder-open', description: 'Resolution centre & folders' },
  ban: { outline: 'ban-outline', filled: 'ban', description: 'Blocked accounts' },
  phone: { outline: 'phone-portrait-outline', filled: 'phone-portrait', description: 'Device & session' },
  desktop: { outline: 'desktop-outline', filled: 'desktop', description: 'Desktop & session' },
  chip: { outline: 'bulb-outline', filled: 'bulb', description: 'AI agents & assistants' },
  tag: { outline: 'pricetag-outline', filled: 'pricetag', description: 'Listing tag & category' },
  mailUnread: { outline: 'mail-unread-outline', filled: 'mail-unread', description: 'Unread messages' },
  flag: { outline: 'flag-outline', filled: 'flag', description: 'Report / Flag content' },
  pin: { outline: 'pin-outline', filled: 'pin', description: 'Pin conversation' },
  notificationsOff: { outline: 'notifications-off-outline', filled: 'notifications-off', description: 'Muted notifications' },
  arrowUp: { outline: 'arrow-up-circle-outline', filled: 'arrow-up-circle', description: 'Scroll up / Up action' },

  // Common Controls & Utilities
  close: { outline: 'close', filled: 'close-circle', description: 'Dismiss / Close' },
  closeCircle: { outline: 'close-circle-outline', filled: 'close-circle', description: 'Clear input' },
  check: { outline: 'checkmark', filled: 'checkmark-circle', description: 'Confirm' },
  plus: { outline: 'add', filled: 'add-circle', description: 'Add item' },
  trash: { outline: 'trash-outline', filled: 'trash', description: 'Delete item' },
  edit: { outline: 'create-outline', filled: 'create', description: 'Edit item' },
  filter: { outline: 'filter-outline', filled: 'filter', description: 'Filter & sort' },
  options: { outline: 'options-outline', filled: 'options', description: 'Adjust parameters' },
  refresh: { outline: 'refresh-outline', filled: 'refresh', description: 'Refresh data' },
  more: { outline: 'ellipsis-horizontal', filled: 'ellipsis-horizontal-circle', description: 'More actions' },
  back: { outline: 'chevron-back', filled: 'arrow-back', description: 'Back navigation' },
  forward: { outline: 'chevron-forward', filled: 'arrow-forward', description: 'Forward navigation' },
  chevronDown: { outline: 'chevron-down', filled: 'chevron-down-circle', description: 'Dropdown / Expand' },
  chevronUp: { outline: 'chevron-up', filled: 'chevron-up-circle', description: 'Collapse' },
  clock: { outline: 'time-outline', filled: 'time', description: 'Timestamp / Schedule' },
  location: { outline: 'location-outline', filled: 'location', description: 'Geographic location' },
  notifications: { outline: 'notifications-outline', filled: 'notifications', description: 'Push notifications' },
} as const;

export type SemanticIconName =
  | 'home'
  | 'explore'
  | 'search'
  | 'create'
  | 'inbox'
  | 'chat'
  | 'profile'
  | 'settings'
  | 'heart'
  | 'bookmark'
  | 'share'
  | 'comment'
  | 'sparkles'
  | 'star'
  | 'eye'
  | 'eyeOff'
  | 'cart'
  | 'pricetag'
  | 'wallet'
  | 'card'
  | 'receipt'
  | 'box'
  | 'auction'
  | 'trending'
  | 'camera'
  | 'image'
  | 'images'
  | 'play'
  | 'pause'
  | 'videocam'
  | 'layers'
  | 'scan'
  | 'shieldCheck'
  | 'lock'
  | 'lockOpen'
  | 'verified'
  | 'warning'
  | 'alert'
  | 'info'
  | 'help'
  | 'leaf'
  | 'accessibility'
  | 'analytics'
  | 'feed'
  | 'compass'
  | 'shield'
  | 'key'
  | 'link'
  | 'fingerprint'
  | 'download'
  | 'mail'
  | 'globe'
  | 'palette'
  | 'people'
  | 'repeat'
  | 'document'
  | 'folder'
  | 'ban'
  | 'phone'
  | 'desktop'
  | 'chip'
  | 'tag'
  | 'mailUnread'
  | 'flag'
  | 'pin'
  | 'notificationsOff'
  | 'arrowUp'
  | 'close'
  | 'closeCircle'
  | 'check'
  | 'plus'
  | 'trash'
  | 'edit'
  | 'filter'
  | 'options'
  | 'refresh'
  | 'more'
  | 'back'
  | 'forward'
  | 'chevronDown'
  | 'chevronUp'
  | 'clock'
  | 'location'
  | 'notifications'
  | 'offline';

