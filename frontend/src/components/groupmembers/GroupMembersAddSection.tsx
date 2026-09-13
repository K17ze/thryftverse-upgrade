/**
 * GroupMembersAddSection — the inline add-members flow: username search,
 * result rows with select circles, and the "Add N members" confirm button.
 * Pure presentation; all state lives in useGroupMembersAddFlow. Extracted
 * verbatim from GroupMembersScreen.
 */

import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { AppSearchBar } from '../ui/AppSearchBar';
import { BodyEmphasis, Caption } from '../ui/Text';
import { useAppTheme } from '../../theme/ThemeContext';
import { createGroupMembersStyles } from './createGroupMembersStyles';
import type { UserSearchResult } from '../../services/profileApi';

export interface GroupMembersAddSectionProps {
  addQuery: string;
  onAddQueryChange: (query: string) => void;
  onCancel: () => void;
  isSearching: boolean;
  searchError: string;
  isOffline: boolean;
  hasSearched: boolean;
  searchResults: UserSearchResult[];
  selectedToAdd: ReadonlySet<string>;
  onToggleSelect: (userId: string) => void;
  isAdding: boolean;
  onConfirm: () => void;
}

export function GroupMembersAddSection({
  addQuery,
  onAddQueryChange,
  onCancel,
  isSearching,
  searchError,
  isOffline,
  hasSearched,
  searchResults,
  selectedToAdd,
  onToggleSelect,
  isAdding,
  onConfirm,
}: GroupMembersAddSectionProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createGroupMembersStyles(colors), [colors]);

  return (
    <View style={styles.addMembersSection}>
      <View style={styles.addMembersHeader}>
        <AppSearchBar
          placeholder="Search by username..."
          value={addQuery}
          onChangeText={onAddQueryChange}
          onClear={() => onAddQueryChange('')}
          containerStyle={styles.addSearchRow}
        />
        <Pressable
          onPress={onCancel}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Cancel add members"
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>

      {isSearching && (
        <View style={styles.searchingRow}>
          <ActivityIndicator size="small" color={colors.brand} />
        </View>
      )}

      {!isSearching && searchError ? (
        <Caption color={colors.danger} style={styles.searchStatusText}>
          {isOffline ? 'You are offline. ' : ''}{searchError}
        </Caption>
      ) : null}

      {!isSearching && hasSearched && searchResults.length === 0 && !searchError ? (
        <Caption color={colors.textMuted} style={styles.searchStatusText}>No users found.</Caption>
      ) : null}

      {!isSearching && searchResults.length > 0 && (
        <View style={styles.searchResultList}>
          {searchResults.map((user, idx) => {
            const isSelected = selectedToAdd.has(user.id);
            return (
              <View key={user.id}>
                <AnimatedPressable
                  onPress={() => onToggleSelect(user.id)}
                  style={styles.searchResultRow}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${user.displayName ?? user.username}`}
                >
                  <View style={[styles.memberAvatarV2, { backgroundColor: colors.surfaceAlt }]}>
                    <Text style={styles.memberAvatarTextV2}>
                      {(user.displayName ?? user.username).slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.memberTextV2}>
                    <BodyEmphasis numberOfLines={1}>{user.displayName ?? user.username}</BodyEmphasis>
                    <Caption color={colors.textMuted} numberOfLines={1}>@{user.username}</Caption>
                  </View>
                  <View style={[styles.selectCircle, isSelected && { backgroundColor: colors.brand, borderColor: colors.brand }]}>
                    {isSelected ? (
                      <AppIcon name="check" size="sm" color="surface" accessible={false} />
                    ) : null}
                  </View>
                </AnimatedPressable>
                {idx < searchResults.length - 1 && <View style={styles.memberDivider} />}
              </View>
            );
          })}
        </View>
      )}

      {selectedToAdd.size > 0 && (
        <AnimatedPressable
          onPress={onConfirm}
          activeOpacity={0.7}
          scaleValue={0.97}
          hapticFeedback="medium"
          accessibilityRole="button"
          accessibilityLabel="Add selected members"
          style={styles.addConfirmBtn}
        >
          {isAdding ? (
            <ActivityIndicator size="small" color={colors.surface} />
          ) : (
            <Text style={styles.addConfirmText}>
              Add {selectedToAdd.size} member{selectedToAdd.size === 1 ? '' : 's'}
            </Text>
          )}
        </AnimatedPressable>
      )}
    </View>
  );
}
