/**
 * ManagePanel — create / rename / delete folder panel for the generic
 * FolderOrganizeSheet surface. Extracted verbatim from
 * FolderOrganizeSheet.tsx.
 */
import React from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import type { ThemeColors } from '../../../theme/ThemeContext';
import type { ManageMode } from '../FolderOrganizeSheet';
import type { createStyles } from './folderOrganizeStyles';

interface ManagePanelProps {
  manageMode: ManageMode;
  nameInput: string;
  setNameInput: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  itemNoun: { singular: string; plural: string };
  busy: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}

export function ManagePanel({
  manageMode,
  nameInput,
  setNameInput,
  onConfirm,
  onCancel,
  itemNoun,
  busy,
  colors,
  styles,
}: ManagePanelProps) {
  if (manageMode.kind === 'delete') {
    return (
      <View style={styles.managePanel}>
        <Text style={styles.manageTitle}>Delete folder?</Text>
        <Text style={styles.manageBody}>
          &ldquo;{manageMode.folder.name}&rdquo; will be removed. Its {itemNoun.plural.toLowerCase()} will move back to unfiled.
        </Text>
        <Pressable
          onPress={onConfirm}
          disabled={busy}
          style={({ pressed }) => [
            styles.manageDangerBtn,
            pressed && { opacity: 0.85 },
            busy && { opacity: 0.5 },
          ]}
          accessibilityLabel="Confirm delete folder"
          accessibilityHint="Deletes the folder and unfiles its items"
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.textInverse} />
          ) : (
            <Text style={styles.manageDangerText}>Delete Folder</Text>
          )}
        </Pressable>
        <Pressable
          onPress={onCancel}
          style={({ pressed }) => [styles.manageCancelBtn, pressed && { opacity: 0.7 }]}
          accessibilityLabel="Cancel"
          accessibilityHint="Closes without deleting"
          accessibilityRole="button"
        >
          <Text style={styles.manageCancelText}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.managePanel}>
      <Text style={styles.manageTitle}>
        {manageMode.kind === 'create' ? 'New Folder' : 'Rename Folder'}
      </Text>
      <TextInput
        style={styles.nameInput}
        value={nameInput}
        onChangeText={setNameInput}
        placeholder="Folder name"
        placeholderTextColor={colors.textMuted}
        autoFocus
        maxLength={40}
        returnKeyType="done"
        onSubmitEditing={onConfirm}
        accessibilityLabel="Folder name"
        accessibilityHint="Type the folder name"
      />
      <Pressable
        onPress={onConfirm}
        disabled={!nameInput.trim() || busy}
        style={({ pressed }) => [
          styles.manageConfirmBtn,
          !nameInput.trim() && styles.manageConfirmDisabled,
          pressed && { opacity: 0.85 },
        ]}
        accessibilityLabel={manageMode.kind === 'create' ? 'Create folder' : 'Save folder name'}
        accessibilityHint={manageMode.kind === 'create' ? 'Creates the folder' : 'Renames the folder'}
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.textInverse} />
        ) : (
          <Text style={styles.manageConfirmText}>
            {manageMode.kind === 'create' ? 'Create' : 'Save'}
          </Text>
        )}
      </Pressable>
      <Pressable
        onPress={onCancel}
        style={({ pressed }) => [styles.manageCancelBtn, pressed && { opacity: 0.7 }]}
        accessibilityLabel="Cancel"
        accessibilityHint="Closes without saving"
        accessibilityRole="button"
      >
        <Text style={styles.manageCancelText}>Cancel</Text>
      </Pressable>
    </View>
  );
}
