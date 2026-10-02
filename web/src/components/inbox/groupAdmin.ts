'use client';

/**
 * groupAdmin — the group-administration model for the info surface, ported
 * from mobile useGroupChatInfoData / useGroupMemberActions / group-settings.
 *
 * Decomposed into modular domain units:
 * - groupAdminTypes.ts: Core types, interfaces, default settings
 * - groupAdminStore.ts: Zustand store for session overrides
 * - groupAdminDerivations.ts: Authority resolution, settings and capability derivations
 * - groupAdminFixtures.ts: Fixture writes and dataset mutations
 * - groupAdminApi.ts: Live API client for group and conversation operations
 */

export * from './group/groupAdminTypes';
export * from './group/groupAdminStore';
export * from './group/groupAdminDerivations';
export * from './group/groupAdminFixtures';
export * from './group/groupAdminApi';
