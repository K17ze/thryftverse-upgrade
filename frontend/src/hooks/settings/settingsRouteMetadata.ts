import type { RootStackParamList } from '../../navigation/types';

export interface DestinationMeta {
  key: keyof RootStackParamList;
  label: string;
  searchTerms: string;
  section: string;
  showSection?: boolean;
}

// Route metadata for search — searchTerms hold only additional synonyms not already
// covered by the label or section title (the filter checks all three fields).
// Section names mirror the visible settings grouping so search results stay
// consistent with the browsable hierarchy.
export const ROUTE_METADATA: DestinationMeta[] = [
  // ── Your account (profile, security, privacy) ──
  // Verification has a single entry point — the Verification row inside
  // Edit Profile — so its search synonyms live on the EditProfile result.
  { key: 'EditProfile', label: 'Edit profile & account', searchTerms: 'avatar name bio username email phone password 2fa two factor verification verify identity dac7 tax badge seller trust kyc', section: 'Your account', showSection: true },
  { key: 'ChangePassword', label: 'Change password', searchTerms: '2fa two factor security', section: 'Your account' },
  { key: 'ConnectedAccounts', label: 'Connected accounts', searchTerms: 'google apple oauth social login', section: 'Your account' },
  { key: 'AccountSecurity', label: 'Devices & sessions', searchTerms: 'login device security passkey sign out revoke', section: 'Your account' },
  { key: 'AccountControl', label: 'Account control', searchTerms: 'delete deactivate download export security', section: 'Your account' },
  { key: 'DataExport', label: 'Download my data', searchTerms: 'export gdpr', section: 'Your account' },
  { key: 'DeleteAccount', label: 'Delete account', searchTerms: 'permanently erase gdpr remove', section: 'Your account' },
  { key: 'PrivacySettings', label: 'Privacy & safety', searchTerms: 'controls visibility blocked', section: 'Your account' },
  { key: 'ChatSettings', label: 'Chat privacy', searchTerms: 'who can message messaging', section: 'Your account' },
  { key: 'DataPrivacy', label: 'Data & privacy', searchTerms: 'gdpr retention third party cookies', section: 'Your account' },
  { key: 'BlockedUsers', label: 'Blocked users', searchTerms: 'block unblock', section: 'Your account' },
  // ── Buying & selling (payments, payouts, orders, co-own, disputes) ──
  { key: 'SavedAddresses', label: 'Saved addresses', searchTerms: 'delivery shipping', section: 'Buying & selling', showSection: true },
  { key: 'Payments', label: 'Payment methods', searchTerms: 'card bank', section: 'Buying & selling' },
  { key: 'Closet', label: 'Saved & collections', searchTerms: 'closet wishlist', section: 'Buying & selling' },
  { key: 'Wallet', label: 'Payout account', searchTerms: 'wallet balance', section: 'Buying & selling' },
  { key: 'BalanceHistory', label: 'Payout history', searchTerms: 'balance', section: 'Buying & selling' },
  { key: 'Postage', label: 'Shipping preferences', searchTerms: 'postage carrier', section: 'Buying & selling' },
  { key: 'CoOwnPriceAlerts', label: 'Price alerts', searchTerms: 'notifications co-own', section: 'Buying & selling' },
  { key: 'ResolutionCentre', label: 'Resolution Centre', searchTerms: 'dispute resolution', section: 'Buying & selling' },
  // ── Notifications ──
  { key: 'NotificationPreferences', label: 'Notification preferences', searchTerms: 'push categories offers price drop marketing quiet hours alerts', section: 'Notifications', showSection: true },
  { key: 'PushNotifications', label: 'Push on this device', searchTerms: 'push delivery registration device', section: 'Notifications' },
  { key: 'EmailNotifications', label: 'Email preferences', searchTerms: '', section: 'Notifications' },
  // ── Experience (appearance, language, currency, accessibility, recommendations) ──
  { key: 'Personalisation', label: 'Content preferences', searchTerms: 'feed personalisation appearance content preferences', section: 'Experience', showSection: true },
  { key: 'AIPreferences', label: 'Recommendations', searchTerms: 'listing suggestions photo enhancement title price autocomplete sell recommendations', section: 'Experience' },
  { key: 'YourAlgorithm', label: 'Your feed', searchTerms: 'feed recommendations topics signals transparency algorithm', section: 'Experience' },
  { key: 'AccessibilitySettings', label: 'Accessibility', searchTerms: 'text size reduced motion high contrast screen reader', section: 'Experience' },
  // ── Connected services (normal product destination) ──
  { key: 'BotDirectory', label: 'Agents', searchTerms: 'agent assistant browse catalogue deploy permissions', section: 'Connected services', showSection: true },
  { key: 'AIAgentIntegration', label: 'Connections', searchTerms: 'openai anthropic claude gemini endpoint byok provider credentials api connections', section: 'Connected services' },
  { key: 'CustomBots', label: 'Your agents', searchTerms: 'custom agents created deployed manage draft published', section: 'Connected services' },
  // ── Help & legal (support, safety, terms, about) ──
  { key: 'HelpSupport', label: 'Help Centre', searchTerms: 'support faq contact', section: 'Help & legal', showSection: true },
  { key: 'About', label: 'About Thryftverse', searchTerms: 'version', section: 'Help & legal' },
  // ── Advanced (developer-only tools, not consumer features) ──
  { key: 'RuntimeSmokeTest', label: 'Runtime smoke test', searchTerms: 'diagnostic developer debug', section: 'Advanced', showSection: true },
  { key: 'ModelRegistry', label: 'Model registry', searchTerms: 'model artifact registry ml lineage promotion rollback', section: 'Advanced' },
];
