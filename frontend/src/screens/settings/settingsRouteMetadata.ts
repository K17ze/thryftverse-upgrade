import type { RootStackParamList } from '../../navigation/types';

export interface DestinationMeta {
  key: keyof RootStackParamList;
  label: string;
  searchTerms: string;
  section: string;
  showSection?: boolean;
  /** i18n key (within the `settings` namespace, `rows.*` group) used to render
   *  the row title so display stays in sync with translations. Falls back to
   *  `label` when omitted. */
  rowKey?: string;
  /** Optional i18n key (within the `settings` namespace, `rows.*` group) for a
   *  static subtitle. Dynamic summaries are composed by the hub. */
  subtitleKey?: string;
}

// Route metadata for search — searchTerms hold only additional synonyms not
// already covered by the label or section title (the filter checks all three
// fields). Section names mirror the visible settings grouping so search
// results stay consistent with the browsable hierarchy. `rowKey`/`subtitleKey`
// keep display labels in sync with the `settings` i18n namespace.
export const ROUTE_METADATA: DestinationMeta[] = [
  // ── Profile ──
  { key: 'EditProfile', label: 'Edit profile & account', searchTerms: 'avatar name bio username email phone', section: 'Profile', showSection: true, rowKey: 'rows.editProfileAccount' },
  { key: 'Verification', label: 'Verify your identity', searchTerms: 'identity dac7 tax badge seller trust kyc', section: 'Profile', rowKey: 'rows.verification' },
  // ── Account & security ──
  { key: 'ChangePassword', label: 'Change password', searchTerms: '2fa two factor security password', section: 'Account & security', showSection: true, rowKey: 'rows.changePassword' },
  { key: 'ConnectedAccounts', label: 'Connected accounts', searchTerms: 'google apple oauth social login', section: 'Account & security', rowKey: 'rows.connectedAccounts', subtitleKey: 'rows.connectedAccountsSubtitle' },
  { key: 'ActiveSessions', label: 'Devices & sessions', searchTerms: 'login device security', section: 'Account & security', rowKey: 'rows.devicesSessions' },
  { key: 'AccountControl', label: 'Account control', searchTerms: 'delete deactivate download export security', section: 'Account & security', rowKey: 'rows.accountControl', subtitleKey: 'rows.accountControlSubtitle' },
  { key: 'SavedAddresses', label: 'Saved addresses', searchTerms: 'delivery shipping address', section: 'Account & security', rowKey: 'rows.savedAddresses' },
  { key: 'Payments', label: 'Payment methods', searchTerms: 'card bank payment', section: 'Account & security', rowKey: 'rows.paymentMethods' },
  // ── Privacy ──
  { key: 'PrivacySettings', label: 'Privacy & safety', searchTerms: 'controls visibility blocked', section: 'Privacy', showSection: true, rowKey: 'rows.privacySafety', subtitleKey: 'rows.privacySafetySubtitle' },
  { key: 'ChatSettings', label: 'Chat privacy', searchTerms: 'who can message messaging', section: 'Privacy', rowKey: 'rows.chatPrivacy', subtitleKey: 'rows.chatPrivacySubtitle' },
  { key: 'DataPrivacy', label: 'Data & privacy', searchTerms: 'gdpr retention third party cookies', section: 'Privacy', rowKey: 'rows.dataPrivacy', subtitleKey: 'rows.dataPrivacySubtitle' },
  { key: 'BlockedUsers', label: 'Blocked users', searchTerms: 'block unblock', section: 'Privacy', rowKey: 'rows.blockedUsers' },
  // ── Selling ──
  { key: 'Closet', label: 'Saved & collections', searchTerms: 'closet wishlist', section: 'Selling', showSection: true, rowKey: 'rows.savedCollections' },
  { key: 'Wallet', label: 'Payout account', searchTerms: 'wallet balance payout seller', section: 'Selling', rowKey: 'rows.payoutAccount', subtitleKey: 'rows.payoutAccountSubtitle' },
  { key: 'BalanceHistory', label: 'Payout history', searchTerms: 'balance payout', section: 'Selling', rowKey: 'rows.payoutHistory' },
  { key: 'Postage', label: 'Shipping preferences', searchTerms: 'postage carrier shipping', section: 'Selling', rowKey: 'rows.shippingPreferences' },
  { key: 'CoOwnPriceAlerts', label: 'Price alerts', searchTerms: 'notifications co-own price', section: 'Selling', rowKey: 'rows.priceAlerts', subtitleKey: 'rows.priceAlertsSubtitle' },
  { key: 'CoOwnRecurringOrders', label: 'Auto-invest plans', searchTerms: 'recurring orders co-own', section: 'Selling', rowKey: 'rows.autoInvestPlans', subtitleKey: 'rows.autoInvestPlansSubtitle' },
  { key: 'CoOwnTaxDocuments', label: 'Tax documents', searchTerms: 'statements cgt co-own tax', section: 'Selling', rowKey: 'rows.taxDocuments', subtitleKey: 'rows.taxDocumentsSubtitle' },
  { key: 'ResolutionCentre', label: 'Resolution Centre', searchTerms: 'dispute resolution', section: 'Selling', rowKey: 'rows.resolutionCentre', subtitleKey: 'rows.resolutionCentreSubtitle' },
  // ── Notifications ──
  { key: 'PushNotifications', label: 'Notification categories', searchTerms: 'push alerts', section: 'Notifications', showSection: true, rowKey: 'rows.notificationCategories' },
  { key: 'EmailNotifications', label: 'Email preferences', searchTerms: 'email', section: 'Notifications', rowKey: 'rows.emailPreferences' },
  { key: 'NotificationPreferences', label: 'Notification preferences', searchTerms: 'push offers price drop marketing quiet hours', section: 'Notifications', rowKey: 'rows.notificationPreferences', subtitleKey: 'rows.notificationPreferencesSubtitle' },
  // ── Appearance ──
  { key: 'Personalisation', label: 'Content preferences', searchTerms: 'feed personalisation appearance content preferences', section: 'Appearance', showSection: true, rowKey: 'rows.contentPreferences', subtitleKey: 'rows.contentPreferencesSubtitle' },
  { key: 'YourAlgorithm', label: 'Your feed', searchTerms: 'feed recommendations topics signals transparency algorithm', section: 'Appearance', rowKey: 'rows.yourFeed', subtitleKey: 'rows.yourFeedSubtitle' },
  { key: 'AIPreferences', label: 'Recommendations', searchTerms: 'listing suggestions photo enhancement title price autocomplete sell recommendations ai', section: 'Appearance', rowKey: 'rows.recommendations', subtitleKey: 'rows.recommendationsSubtitle' },
  { key: 'AccessibilitySettings', label: 'Accessibility', searchTerms: 'text size reduced motion high contrast screen reader', section: 'Appearance', rowKey: 'rows.accessibility', subtitleKey: 'rows.accessibilitySubtitle' },
  // ── Data & storage ──
  { key: 'DataExport', label: 'Download my data', searchTerms: 'export gdpr download', section: 'Data & storage', showSection: true, rowKey: 'rows.downloadData', subtitleKey: 'rows.downloadDataSubtitle' },
  { key: 'DeleteAccount', label: 'Delete account', searchTerms: 'permanently erase gdpr remove delete', section: 'Data & storage', rowKey: 'rows.deleteAccount', subtitleKey: 'rows.deleteAccountSubtitle' },
  // ── Support ──
  { key: 'HelpSupport', label: 'Help Centre', searchTerms: 'support faq contact help', section: 'Support', showSection: true, rowKey: 'rows.helpCentre' },
  // ── About ──
  { key: 'About', label: 'About Thryftverse', searchTerms: 'version build licenses', section: 'About', showSection: true, rowKey: 'rows.aboutThryftverse' },
  // ── Connected services ──
  { key: 'BotDirectory', label: 'Agents', searchTerms: 'agent assistant browse catalogue deploy permissions', section: 'Connected services', showSection: true, rowKey: 'rows.agents', subtitleKey: 'rows.agentsSubtitle' },
  { key: 'AIAgentIntegration', label: 'Connections', searchTerms: 'openai anthropic claude gemini endpoint byok provider credentials api connections', section: 'Connected services', rowKey: 'rows.connections', subtitleKey: 'rows.connectionsSubtitle' },
  { key: 'CustomBots', label: 'Your agents', searchTerms: 'custom agents created deployed manage draft published', section: 'Connected services', rowKey: 'rows.yourAgents', subtitleKey: 'rows.yourAgentsSubtitle' },
  // ── Developer (gated) ──
  { key: 'RuntimeSmokeTest', label: 'Runtime smoke test', searchTerms: 'diagnostic developer debug', section: 'Developer', showSection: true, rowKey: 'rows.runtimeSmokeTest', subtitleKey: 'rows.runtimeSmokeTestSubtitle' },
];

/** Ordered section names — controls the browse hierarchy top to bottom. */
export const SETTINGS_SECTION_ORDER: string[] = [
  'Profile',
  'Account & security',
  'Privacy',
  'Selling',
  'Notifications',
  'Appearance',
  'Data & storage',
  'Support',
  'About',
  'Connected services',
  'Developer',
];
