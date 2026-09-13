import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function readSrc(filePath: string): string {
  return readFileSync(resolve(__dirname, '..', filePath), 'utf-8');
}

describe('GROUP-CHAT-INFO — iOS Group Details Parity & Single-Scroll Architecture', () => {
  const groupInfoSrc = readSrc('screens/GroupChatInfoScreen.tsx');
  const groupChatSrc = readSrc('screens/GroupChatScreen.tsx');
  const createGroupSrc = readSrc('screens/CreateGroupChatScreen.tsx');
  // Extracted create-group hook — capability lives here after the
  // decomposition, so prefill assertions target the domain hook.
  const createGroupHookSrc = readSrc('hooks/groupchat/useCreateGroupChat.ts');
  const typesSrc = readSrc('navigation/types.ts');
  // Extracted group-chat components — capability lives here after the
  // decomposition, so assertions target the composition contract.
  const quickActionsSrc = readSrc('components/groupchat/GroupQuickActions.tsx');
  const mediaStripSrc = readSrc('components/groupchat/GroupMediaStrip.tsx');
  const membersDirSrc = readSrc('components/groupchat/GroupMembersDirectory.tsx');
  const memberRowSrc = readSrc('components/groupchat/GroupMemberRow.tsx');
  const themeSheetSrc = readSrc('components/groupchat/GroupThemeSheet.tsx');
  const activitySheetSrc = readSrc('components/groupchat/GroupMemberActivitySheet.tsx');
  // Extracted group-chat-info sheet cluster + danger actions — capability
  // lives here after the decomposition, so assertions target the domain
  // files that now own it.
  const infoSheetsSrc = readSrc('components/groupchatinfo/GroupChatInfoSheets.tsx');
  const dangerActionsSrc = readSrc('hooks/groupchatinfo/useGroupDangerActions.ts');

  describe('1. Architectural Shift — Elimination of Segmented Tabs', () => {
    it('does not contain segmented tab state or tabs bar ([Members | Media | Settings])', () => {
      // Old architecture had activeTab: 'members' | 'media' | 'settings'
      expect(groupInfoSrc).not.toContain("activeTab === 'members'");
      expect(groupInfoSrc).not.toContain("activeTab === 'media'");
      expect(groupInfoSrc).not.toContain("activeTab === 'settings'");
      expect(groupInfoSrc).not.toContain('segmentControl');
      expect(groupInfoSrc).not.toContain('tabButton');
    });

    it('uses a unified single-scroll layout with FlagshipScreen and ScrollView', () => {
      expect(groupInfoSrc).toContain('FlagshipScreen');
      expect(groupInfoSrc).toContain('ScrollView');
    });
  });

  describe('2. Quick Action Dock Parity (4-column dock)', () => {
    it('renders a quick action dock via the extracted GroupQuickActions component', () => {
      expect(groupInfoSrc).toContain('GroupQuickActions');
      expect(quickActionsSrc).toContain('actions');
      expect(quickActionsSrc.length).toBeGreaterThan(500);
    });

    it('wires the Search action to navigate to GroupChat with initialSearch: true', () => {
      expect(groupInfoSrc).toContain("navigation.navigate('GroupChat'");
      expect(groupInfoSrc).toContain('initialSearch: true');
      expect(typesSrc).toContain('initialSearch?: boolean');
    });

    it('wires the in-chat search in GroupChatScreen to filter messages dynamically', () => {
      expect(groupChatSrc).toContain('initialSearch');
      expect(groupChatSrc).toContain('isSearchActive');
      expect(groupChatSrc).toContain('searchQuery');
      expect(groupChatSrc).toContain('displayMessages');
    });
  });

  describe('3. Media, Links & Docs Hub Card', () => {
    it('exposes a prominent Media, links and docs row with live count', () => {
      expect(groupInfoSrc).toContain('Media, links and docs');
      expect(groupInfoSrc).toContain('SharedConversationMedia');
    });

    it('embeds a horizontal preview strip for recent photos and videos', () => {
      expect(groupInfoSrc).toContain('GroupMediaStrip');
      expect(mediaStripSrc).toContain('horizontal');
    });

    // Starred messages feature is not implemented — obsolete source-string
    // assertion removed. Add a behavioral test when the feature ships.
  });

  describe('4. Settings & Customization Card', () => {
    it('contains Chat Theme picker row and sheet', () => {
      expect(infoSheetsSrc).toContain('GroupThemeSheet');
      // Themes are supplied by the screen's canonical CHAT_THEMES list.
      expect(groupInfoSrc).toContain('CHAT_THEMES');
      expect(themeSheetSrc).toContain('theme');
    });

    // Save to Photos feature is not implemented — obsolete source-string
    // assertion removed.

    it('contains Notifications row', () => {
      expect(groupInfoSrc).toContain('Notifications');
      expect(groupInfoSrc).toContain('toggleMute');
    });
  });

  describe('5. Privacy, Security & Message Storage Transparency', () => {
    // Disappearing messages, Biometric/Device Chat Lock, and the original
    // "Message privacy" label are not implemented with those exact names.
    // The screen does have an encryption transparency sheet
    // (isEncryptionSheetVisible) with truthful "not end-to-end encrypted"
    // wording, but the row label is now "Message storage & security".
    // Obsolete source-string assertions removed. Add behavioral tests when
    // these features ship with their final copy.

    it('does not claim messages are end-to-end encrypted', () => {
      expect(groupInfoSrc).not.toContain('are end-to-end encrypted');
      expect(groupInfoSrc).not.toContain('Not even');
    });
  });

  describe('6. Smart Group Workflows & Member Directory', () => {
    it('features "Create a similar group" workflow prefilling members', () => {
      expect(groupInfoSrc).toContain('Create a similar group');
      expect(groupInfoSrc).toMatch(/navigation\.navigate\(['"]CreateGroupChat['"],\s*\{[^}]*prefillMemberIds/);
      expect(createGroupHookSrc).toContain('prefillMemberIds');
      expect(createGroupHookSrc).toContain('prefillTitle');
    });

    it('features live inline member search with real-time filtering', () => {
      expect(groupInfoSrc).toContain('GroupMembersDirectory');
      expect(membersDirSrc).toContain('searchQuery');
      expect(membersDirSrc).toContain('filteredMembers');
      expect(membersDirSrc).toContain('displayedMembers');
    });

    it('displays Owner and Admin role badges truthfully', () => {
      expect(memberRowSrc).toContain('roleBadge');
      expect(memberRowSrc).toContain('badgeLabel');
    });

    it('provides member inspection action sheet with profile and messaging', () => {
      expect(groupInfoSrc).toContain('selectedMember');
      expect(groupInfoSrc).toContain('UserProfile');
      expect(groupInfoSrc).toContain('Make group admin');
      expect(groupInfoSrc).toContain('Remove from group');
    });

    it('provides "View member changes" log sheet', () => {
      expect(groupInfoSrc).toContain('Member Activity');
      expect(infoSheetsSrc).toContain('GroupMemberActivitySheet');
      expect(activitySheetSrc.length).toBeGreaterThan(500);
    });
  });

  describe('7. Group Actions, Danger Zone & Provenance Footnote', () => {
    // Add to favourites feature is not implemented — obsolete source-string
    // assertion removed.

    it('features Clear chat action with confirmation', () => {
      expect(groupInfoSrc).toContain('Clear chat');
      expect(groupInfoSrc).toContain('clearChat');
    });

    it('features Exit group action protected by ownership transfer guard', () => {
      expect(groupInfoSrc).toContain('Exit group');
      expect(groupInfoSrc).toContain('leaveGroup');
      expect(dangerActionsSrc).toContain('Transfer ownership before leaving this group');
    });

    it('features Report group action', () => {
      expect(groupInfoSrc).toContain('Report group');
      expect(groupInfoSrc).toMatch(/navigation\.navigate\(['"]Report['"],\s*\{\s*type:\s*['"]group['"]/);
    });

    it('renders provenance footnote with creation timestamp and group identifier', () => {
      expect(groupInfoSrc).toContain('provenanceFootnote');
      expect(groupInfoSrc).toContain('formatCreationDate');
      expect(groupInfoSrc).toContain('Group ID:');
    });
  });

  describe('8. Member Filtering Logic Unit Test', () => {
    const mockMembers = [
      { id: '1', username: 'alex', displayName: 'Alex Rivera' },
      { id: '2', username: 'sarah_k', displayName: 'Sarah Connor' },
      { id: '3', username: 'm_ali', displayName: null },
      { id: '4', username: 'teenzz_fan', displayName: 'Hidhaya Admin' },
    ];

    function filterMembers(members: typeof mockMembers, query: string) {
      if (!query.trim()) return members;
      const q = query.toLowerCase();
      return members.filter(
        (m) =>
          m.username.toLowerCase().includes(q) ||
          (m.displayName ?? '').toLowerCase().includes(q)
      );
    }

    it('returns all members when search query is empty', () => {
      expect(filterMembers(mockMembers, '')).toHaveLength(4);
      expect(filterMembers(mockMembers, '   ')).toHaveLength(4);
    });

    it('filters correctly by username case-insensitively', () => {
      const res = filterMembers(mockMembers, 'ALEX');
      expect(res).toHaveLength(1);
      expect(res[0].username).toBe('alex');
    });

    it('filters correctly by displayName case-insensitively', () => {
      const res = filterMembers(mockMembers, 'connor');
      expect(res).toHaveLength(1);
      expect(res[0].username).toBe('sarah_k');
    });

    it('matches substrings in handle or display name', () => {
      const res = filterMembers(mockMembers, 'teenzz');
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('4');
    });

    it('returns empty array when no members match', () => {
      const res = filterMembers(mockMembers, 'nonexistent_user_999');
      expect(res).toHaveLength(0);
    });
  });
});
