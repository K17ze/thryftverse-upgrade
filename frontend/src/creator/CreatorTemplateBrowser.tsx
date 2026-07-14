import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  FlatList,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { Colors } from '../constants/colors';
import {
  getTemplatesByType,
  type CreatorTemplate,
} from './templates';
import { CreatorCanvas } from './CreatorCanvas';
import { SheetContainer, PressScale } from './CreatorAnimations';

export interface CreatorTemplateBrowserProps {
  visible: boolean;
  documentType: 'look' | 'poster';
  onClose: () => void;
  onApply: (template: CreatorTemplate) => void;
  hasExistingWork: boolean;
}

export function CreatorTemplateBrowser({
  visible,
  documentType,
  onClose,
  onApply,
  hasExistingWork,
}: CreatorTemplateBrowserProps) {
  const { colors } = useAppTheme();
  const templates = getTemplatesByType(documentType);

  const handleApply = useCallback(
    (template: CreatorTemplate) => {
      if (hasExistingWork) {
        Alert.alert(
          'Replace current work?',
          `Applying "${template.name}" will replace your current canvas. This cannot be undone.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Replace',
              style: 'destructive',
              onPress: () => {
                onApply(template);
                onClose();
              },
            },
          ],
        );
      } else {
        onApply(template);
        onClose();
      }
    },
    [hasExistingWork, onApply, onClose],
  );

  const renderItem = useCallback(
    ({ item }: { item: CreatorTemplate }) => {
      const previewDoc = item.build();
      const previewWidth = 120;
      const previewHeight = Math.floor(previewWidth / previewDoc.canvas.aspectRatio);

      return (
        <Pressable
          onPress={() => handleApply(item)}
          style={styles.templateCard}
          accessibilityLabel={`Apply template ${item.name}`}
          accessibilityRole="button"
        >
          <View style={styles.previewContainer}>
            <CreatorCanvas
              document={previewDoc}
              page={previewDoc.pages[0]}
              canvasWidth={previewWidth}
              canvasHeight={previewHeight}
              mode="preview"
            />
          </View>
          <Text style={styles.templateName}>{item.name}</Text>
          <Text style={styles.templateDesc} numberOfLines={2}>{item.description}</Text>
        </Pressable>
      );
    },
    [handleApply],
  );

  return (
    <SheetContainer visible={visible} onClose={onClose} maxHeight={0.85}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Templates</Text>
            <PressScale
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityLabel="Close templates"
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </PressScale>
          </View>

          <FlatList
            data={templates}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            numColumns={2}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={{ height: Space.md }} />}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="grid-outline" size={40} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No templates available</Text>
              </View>
            }
          />
    </SheetContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  title: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.subtitle.size,
  },
  closeBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  listContent: {
    paddingHorizontal: Space.md,
    gap: Space.sm,
  },
  templateCard: {
    flex: 1,
    marginHorizontal: Space.xs,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    padding: Space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  previewContainer: {
    alignItems: 'center',
    marginBottom: Space.sm,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  templateName: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  templateDesc: {
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    color: Colors.textMuted,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Space.xl * 2,
    gap: Space.sm,
  },
  emptyText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size,
    color: Colors.textSecondary,
  },
});
