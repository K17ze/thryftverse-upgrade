import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  FlatList,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { Colors } from '../constants/colors';
import {
  getTemplatesByType,
  type CreatorTemplate,
} from './templates';
import { CreatorCanvas } from './CreatorCanvas';

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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Templates</Text>
            <Pressable
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityLabel="Close templates"
              accessibilityRole="button"
            >
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </Pressable>
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
                <Ionicons name="grid-outline" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyText}>No templates available</Text>
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    maxHeight: '85%',
    paddingBottom: Space.xl,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: Space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  title: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.title.size,
    color: Colors.textPrimary,
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
