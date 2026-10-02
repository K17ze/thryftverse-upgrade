/**
 * Notifications view-model — pure derivations for the /notifications feed.
 * Normalises the legacy AppNotification rows and the richer
 * NotificationEntry feed into one row model, resolves deep links, and
 * buckets entries into the mobile section grammar: day sections
 * (Today / Yesterday / Earlier) for small sets, Instagram-style type
 * sections (Follows / Orders / Offers / Activity) past six rows.
 * No React, no theme — safe to unit-test.
 *
 * Decomposed into modular domain units:
 * - model/notificationTypes.ts: Row model, filters, accents, event types
 * - model/notificationAdapters.ts: Legacy and entry adapters, deep links
 * - model/notificationAggregation.ts: 24h social and item group cards
 * - model/notificationSections.ts: Day bucketing and attention ordering
 * - model/notificationFiltering.ts: Filter predicates, count mapping, empty states
 */

export * from './model/notificationTypes';
export * from './model/notificationAdapters';
export * from './model/notificationAggregation';
export * from './model/notificationSections';
export * from './model/notificationFiltering';
