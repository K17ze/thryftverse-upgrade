/**
 * GroupMemberSelectStage — stage 1 of the create-group flow: member
 * search, selected-member chip rail, recents/suggested sections, search
 * results list and the sticky "Next step" action. Extracted verbatim
 * from CreateGroupChatScreen.
 */

import React, { useMemo } from 'react';
import { ScrollView, Text, View, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { AppIcon } from '../common/AppIcon';
import { AppInput } from '../ui/AppInput';
import { AppButton } from '../ui/AppButton';
import { Caption } from '../ui/Text';
import { FlagshipScreen, FlagshipHeader } from '../flagship';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { MIN_MEMBERS } from '../../utils/chatGroupHelpers';
import type { SelectableUser } from '../../utils/chatGroupHelpers';
import { createGroupChatStyles } from './createGroupChatStyles';
import { GroupMemberSelectRow } from './GroupMemberSelectRow';

export interface GroupMemberSelectStageProps {
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  selectedIds: string[];
  selectedUsers: Map<string, SelectableUser>;
  onToggleMember: (user: SelectableUser) => void;
  searchError: string;
  isOffline: boolean;
  onRetrySearch: () => void;
  showRecents: boolean;
  recentUsers: SelectableUser[];
  suggestedUsers: SelectableUser[];
  isSearching: boolean;
  hasSearched: boolean;
  results: SelectableUser[];
  onContinue: () => void;
  onBack: () => void;
}

export function GroupMemberSelectStage({
  searchQuery,
  onSearchQueryChange,
  selectedIds,
  selectedUsers,
  onToggleMember,
  searchError,
  isOffline,
  onRetrySearch,
  showRecents,
  recentUsers,
  suggestedUsers,
  isSearching,
  hasSearched,
  results,
  onContinue,
  onBack,
}: GroupMemberSelectStageProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createGroupChatStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  return (
    <FlagshipScreen header={<FlagshipHeader title="New group" onBack={onBack} />} scrollEnabled={false}>
      <View style={styles.selectRoot}>
        <View style={styles.searchRow}>
          <AppIcon name="search" size="sm" color="textMuted" accessible={false} />
          <AppInput
            value={searchQuery}
            onChangeText={onSearchQueryChange}
            placeholder="Search by username..."
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            inputContainerStyle={styles.searchInputWrap}
            inputStyle={styles.searchInput}
            accessibilityLabel="Search members"
            accessibilityHint="Search for users to add to the group"
          />
          {searchQuery.length > 0 && (
            <AnimatedPressable
              onPress={() => onSearchQueryChange('')}
              activeOpacity={0.7}
              scaleValue={0.9}
              hapticFeedback="light"
              accessibilityLabel="Clear search"
              accessibilityRole="button"
            >
              <AppIcon name="close" variant="filled" size="sm" color="textMuted" accessible={false} />
            </AnimatedPressable>
          )}
        </View>

      {selectedIds.length > 0 && (
        <View style={styles.selectedRail}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectedRailContent}>
            {selectedIds.map((id) => {
              const user = selectedUsers.get(id);
              const displayName = user?.displayName ?? user?.username ?? 'User';
              return (
                <Pressable
                  key={id}
                  onPress={() => user && onToggleMember(user)}
                  style={styles.selectedChip}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${displayName} from selection`}
                >
                  {user?.avatar ? (
                    <CachedImage uri={user.avatar} style={styles.selectedChipAvatar} contentFit="cover" />
                  ) : (
                    <View style={styles.selectedChipAvatarPlaceholder}>
                      <Text style={styles.selectedChipAvatarText}>{displayName[0]?.toUpperCase() ?? '?'}</Text>
                    </View>
                  )}
                  <Text style={styles.selectedChipText} numberOfLines={1}>{displayName}</Text>
                  <AppIcon name="close" variant="filled" size="xs" color="textMuted" accessible={false} />
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {searchError ? (
        <View style={styles.searchErrorBanner}>
          <AppIcon name="alert" size="sm" color="danger" accessible={false} />
          <Text style={styles.searchErrorText}>
            {isOffline ? 'You are offline. ' : ''}{searchError}
          </Text>
          <Pressable
            onPress={onRetrySearch}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Retry search"
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {!searchQuery.trim() ? (
        showRecents ? (
          <ScrollView
            style={styles.recentsScroll}
            contentContainerStyle={styles.recentsContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {recentUsers.length > 0 && (
              <View style={styles.sectionBlock}>
                <Text style={styles.sectionHeaderText}>Recent</Text>
                {recentUsers.map((user) => (
                  <GroupMemberSelectRow
                    key={user.id}
                    user={user}
                    selected={selectedIds.includes(user.id)}
                    onToggle={onToggleMember}
                  />
                ))}
              </View>
            )}
            {suggestedUsers.length > 0 && (
              <View style={styles.sectionBlock}>
                <Text style={styles.sectionHeaderText}>Suggested</Text>
                {suggestedUsers.map((user) => (
                  <GroupMemberSelectRow
                    key={user.id}
                    user={user}
                    selected={selectedIds.includes(user.id)}
                    onToggle={onToggleMember}
                  />
                ))}
              </View>
            )}
          </ScrollView>
        ) : (
          <View style={styles.emptyWrap}>
            <AppIcon name="search" size="hero" color="textMuted" accessible={false} />
            <Caption color={colors.textMuted} style={styles.emptyText}>
              Search by username to add members to your group.
            </Caption>
          </View>
        )
      ) : isSearching ? (
        <View style={styles.listWrap}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.skeletonRow}>
              <View style={styles.skeletonAvatar} />
              <View style={styles.skeletonTextWrap}>
                <View style={styles.skeletonLine} />
                <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
              </View>
            </View>
          ))}
        </View>
      ) : results.length === 0 ? (
        <View style={styles.emptyWrap}>
          <AppIcon name="people" size="hero" color="textMuted" accessible={false} />
          <Caption color={colors.textMuted} style={styles.emptyText}>
            {hasSearched && !searchError ? 'No users match your search.' : 'Type at least 2 characters to search.'}
          </Caption>
        </View>
      ) : (
        <FlashList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <GroupMemberSelectRow
              user={item}
              selected={selectedIds.includes(item.id)}
              onToggle={onToggleMember}
            />
          )}
          contentContainerStyle={styles.memberList}
          showsVerticalScrollIndicator={false}
        />
      )}

      <View style={[styles.stickyAction, { paddingBottom: Math.max(insets.bottom, Space.sm) + 8 }]}>
        <AppButton
          style={[styles.createBtn, selectedIds.length < MIN_MEMBERS && styles.createBtnDisabled]}
          variant="primary"
          size="md"
          align="center"
          title={`Next step${selectedIds.length > 0 ? ` · ${selectedIds.length}` : ''}`}
          onPress={onContinue}
          disabled={selectedIds.length < MIN_MEMBERS}
          accessibilityLabel={`Continue to group details with ${selectedIds.length} member${selectedIds.length === 1 ? '' : 's'}`}
          accessibilityRole="button"
        />
      </View>
      </View>
    </FlagshipScreen>
  );
}
