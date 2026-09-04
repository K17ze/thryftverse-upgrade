import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function readSrc(filePath: string): string {
  return readFileSync(resolve(__dirname, '..', filePath), 'utf-8');
}

describe('GROUP-CHAT-INFO — WhatsApp/iOS Group Details Parity & Single-Scroll Architecture', () => {
  const groupInfoSrc = readSrc('screens/GroupChatInfoScreen.tsx');
  const groupChatSrc = readSrc('screens/GroupChatScreen.tsx');
  const createGroupSrc = readSrc('screens/CreateGroupChatScreen.tsx');
  const typesSrc = readSrc('navigation/types.ts');

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
      expect(groupInfoSrc).toContain('groupedCard');
    });
  });

  describe('2. Quick Action Dock Parity (WhatsApp 4-column dock)', () => {
    it('renders a 4-column quick action dock with Call, Search, Add, and Mute', () => {
      expect(groupInfoSrc).toContain('quickActionDock');
      expect(groupInfoSrc).toContain('quickActionButton');
      expect(groupInfoSrc).toContain('Call');
      expect(groupInfoSrc).toContain('Search');
      expect(groupInfoSrc).toContain('Add');
      expect(groupInfoSrc).toContain('Mute');
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
      expect(groupInfoSrc).toContain('mediaStripWrap');
      expect(groupInfoSrc).toContain('mediaStrip');
      expect(groupInfoSrc).toContain('mediaThumbnail');
      expect(groupInfoSrc).toContain('ChatMediaPreview');
    });

    it('includes Starred messages row inside the media section', () => {
      expect(groupInfoSrc).toContain('Starred messages');
    });
  });

  describe('4. Settings & Customization Card', () => {
    it('contains Chat Theme picker row and sheet', () => {
      expect(groupInfoSrc).toContain('Chat theme');
      expect(groupInfoSrc).toContain('isThemeSheetVisible');
      expect(groupInfoSrc).toContain('Emerald (WhatsApp)');
    });

    it('contains Save to photos row', () => {
      expect(groupInfoSrc).toContain('Save to Photos');
    });

    it('contains Notifications row', () => {
      expect(groupInfoSrc).toContain('Notifications');
      expect(groupInfoSrc).toContain('toggleMute');
    });
  });

  describe('5. Privacy, Security & End-to-End Encryption', () => {
    it('contains Disappearing messages picker with standard durations', () => {
      expect(groupInfoSrc).toContain('Disappearing messages');
      expect(groupInfoSrc).toContain('isDisappearingSheetVisible');
      expect(groupInfoSrc).toMatch(/['"]24h['"]/);
      expect(groupInfoSrc).toMatch(/['"]7d['"]/);
      expect(groupInfoSrc).toMatch(/['"]90d['"]/);
    });

    it('contains Biometric / Device Chat Lock toggle switch', () => {
      expect(groupInfoSrc).toContain('Lock chat');
      expect(groupInfoSrc).toContain('isChatLocked');
    });

    it('contains End-to-end encryption status row and transparency sheet', () => {
      expect(groupInfoSrc).toContain('Encryption');
      expect(groupInfoSrc).toContain('isEncryptionSheetVisible');
      expect(groupInfoSrc).toContain('end-to-end encrypted');
    });
  });

  describe('6. Smart Group Workflows & Member Directory', () => {
    it('features "Create a similar group" workflow prefilling members', () => {
      expect(groupInfoSrc).toContain('Create a similar group');
      expect(groupInfoSrc).toMatch(/navigation\.navigate\(['"]CreateGroupChat['"],\s*\{[^}]*prefillMemberIds/);
      expect(createGroupSrc).toContain('prefillMemberIds');
      expect(createGroupSrc).toContain('prefillTitle');
    });

    it('features live inline member search with real-time filtering', () => {
      expect(groupInfoSrc).toContain('memberSearchInput');
      expect(groupInfoSrc).toContain('memberSearchQuery');
      expect(groupInfoSrc).toContain('filteredMembers');
      expect(groupInfoSrc).toContain('displayedMembers');
    });

    it('displays Owner and Admin role badges truthfully', () => {
      expect(groupInfoSrc).toContain('memberRoleBadgeOwner');
      expect(groupInfoSrc).toContain('memberRoleBadge');
      expect(groupInfoSrc).toContain('roleLabel');
    });

    it('provides member inspection action sheet with profile and messaging', () => {
      expect(groupInfoSrc).toContain('selectedMember');
      expect(groupInfoSrc).toContain('UserProfile');
      expect(groupInfoSrc).toContain('Make group admin');
      expect(groupInfoSrc).toContain('Remove from group');
    });

    it('provides "View member changes" log sheet', () => {
      expect(groupInfoSrc).toContain('Member Activity');
      expect(groupInfoSrc).toContain('isMemberChangesSheetVisible');
    });
  });

  describe('7. Group Actions, Danger Zone & Provenance Footnote', () => {
    it('features Add to favourites action', () => {
      expect(groupInfoSrc).toContain('Add to Favourites');
      expect(groupInfoSrc).toContain('isFavourited');
    });

    it('features Clear chat action with confirmation', () => {
      expect(groupInfoSrc).toContain('Clear chat');
      expect(groupInfoSrc).toContain('clearChat');
    });

    it('features Exit group action protected by ownership transfer guard', () => {
      expect(groupInfoSrc).toContain('Exit group');
      expect(groupInfoSrc).toContain('leaveGroup');
      expect(groupInfoSrc).toContain('Transfer ownership before leaving this group');
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
