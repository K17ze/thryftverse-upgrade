import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
  SafeAreaView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { Colors } from '../constants/colors';
import { CreatorProvider, useCreator } from './CreatorContext';
import { CreatorCanvas } from './CreatorCanvas';
import { CreatorLayersSheet } from './CreatorLayersSheet';
import { CreatorToolDock } from './CreatorToolDock';
import { CreatorPublishSheet } from './CreatorPublishSheet';

const { width: SCREEN_W } = Dimensions.get('window');

function CreatorStudioInner() {
  const navigation = useNavigation<any>();
  const { document, activePageIndex, setActivePageIndex, selectedLayerId, selectLayer, canUndo, canRedo, undo, redo, isDirty, removeLayer, duplicateLayer, reorderLayer } = useCreator();

  const [showLayers, setShowLayers] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const page = document.pages[activePageIndex];

  const canvasWidth = useMemo(() => {
    const maxW = SCREEN_W - 32;
    const maxH = 420;
    const ratio = document.canvas.aspectRatio;
    if (maxW / ratio <= maxH) {
      return Math.floor(maxW);
    }
    return Math.floor(maxH * ratio);
  }, [document.canvas.aspectRatio]);

  const canvasHeight = useMemo(() => {
    return Math.floor(canvasWidth / document.canvas.aspectRatio);
  }, [canvasWidth, document.canvas.aspectRatio]);

  const handleBack = useCallback(() => {
    if (isDirty) {
      Alert.alert(
        'Unsaved changes',
        'You have unsaved changes. Save as draft before leaving?',
        [
          { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
          { text: 'Keep editing', style: 'cancel' },
        ],
      );
    } else {
      navigation.goBack();
    }
  }, [isDirty, navigation]);

  const handleCanvasPress = useCallback(() => {
    selectLayer(null);
  }, [selectLayer]);

  const handleLayerPress = useCallback((layerId: string) => {
    selectLayer(layerId);
  }, [selectLayer]);

  const selectedLayer = page?.layers.find((l) => l.id === selectedLayerId);

  return (
    <SafeAreaView style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={handleBack} style={styles.topBtn} accessibilityLabel="Back" accessibilityRole="button">
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </Pressable>

        <View style={styles.topCenter}>
          <Text style={styles.titleText}>
            {document.type === 'look' ? 'Look Studio' : 'Poster Studio'}
          </Text>
          {isDirty && <View style={styles.dirtyDot} />}
        </View>

        <View style={styles.topRight}>
          <Pressable
            onPress={undo}
            disabled={!canUndo}
            style={[styles.topBtn, !canUndo && styles.topBtnDisabled]}
            accessibilityLabel="Undo"
            accessibilityRole="button"
          >
            <Ionicons name="arrow-undo" size={20} color={canUndo ? Colors.textPrimary : Colors.textMuted} />
          </Pressable>
          <Pressable
            onPress={redo}
            disabled={!canRedo}
            style={[styles.topBtn, !canRedo && styles.topBtnDisabled]}
            accessibilityLabel="Redo"
            accessibilityRole="button"
          >
            <Ionicons name="arrow-redo" size={20} color={canRedo ? Colors.textPrimary : Colors.textMuted} />
          </Pressable>
          <Pressable
            onPress={() => setShowLayers(true)}
            style={styles.topBtn}
            accessibilityLabel="Layers"
            accessibilityRole="button"
          >
            <Ionicons name="layers-outline" size={22} color={Colors.textPrimary} />
          </Pressable>
        </View>
      </View>

      {/* Page strip (for poster) */}
      {document.type === 'poster' && document.pages.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pageStrip} contentContainerStyle={styles.pageStripContent}>
          {document.pages.map((p, i) => (
            <Pressable
              key={p.id}
              onPress={() => {
                selectLayer(null);
                setActivePageIndex(i);
              }}
              style={[styles.pageThumb, i === activePageIndex && styles.pageThumbActive]}
              accessibilityLabel={`Page ${i + 1}`}
              accessibilityRole="button"
            >
              <Text style={styles.pageThumbText}>{i + 1}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Canvas area */}
      <View style={styles.canvasArea}>
        <CreatorCanvas
          document={document}
          page={page}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          mode="edit"
          selectedLayerId={selectedLayerId}
          onLayerPress={handleLayerPress}
          onCanvasPress={handleCanvasPress}
        />
      </View>

      {/* Selection toolbar */}
      {selectedLayer && (
        <View style={styles.selectionToolbar}>
          <Pressable
            onPress={() => reorderLayer(selectedLayer.id, 'forward')}
            style={styles.selBtn}
            accessibilityLabel="Bring forward"
            accessibilityRole="button"
          >
            <Ionicons name="arrow-up" size={18} color={Colors.textPrimary} />
          </Pressable>
          <Pressable
            onPress={() => reorderLayer(selectedLayer.id, 'backward')}
            style={styles.selBtn}
            accessibilityLabel="Send backward"
            accessibilityRole="button"
          >
            <Ionicons name="arrow-down" size={18} color={Colors.textPrimary} />
          </Pressable>
          <Pressable
            onPress={() => duplicateLayer(selectedLayer.id)}
            style={styles.selBtn}
            accessibilityLabel="Duplicate layer"
            accessibilityRole="button"
          >
            <Ionicons name="copy-outline" size={18} color={Colors.textPrimary} />
          </Pressable>
          <Pressable
            onPress={() => removeLayer(selectedLayer.id)}
            style={styles.selBtn}
            accessibilityLabel="Delete layer"
            accessibilityRole="button"
          >
            <Ionicons name="trash-outline" size={18} color="#ff6b6b" />
          </Pressable>
        </View>
      )}

      {/* Bottom dock */}
      <CreatorToolDock onPublish={() => setShowPublish(true)} onSettings={() => setShowSettings(true)} />

      {/* Sheets */}
      <CreatorLayersSheet visible={showLayers} onClose={() => setShowLayers(false)} />
      <CreatorPublishSheet visible={showPublish} onClose={() => setShowPublish(false)} />
    </SafeAreaView>
  );
}

export function CreatorStudioScreen() {
  const route = useRoute<any>();
  const initialType = route.params?.type === 'poster' ? 'poster' : 'look';

  return (
    <CreatorProvider initialType={initialType}>
      <CreatorStudioInner />
    </CreatorProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  topBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  topBtnDisabled: {
    opacity: 0.4,
  },
  topCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  titleText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    color: Colors.textPrimary,
  },
  dirtyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.brand,
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  pageStrip: {
    maxHeight: 52,
  },
  pageStripContent: {
    paddingHorizontal: Space.md,
    gap: Space.sm,
    alignItems: 'center',
    paddingVertical: Space.xs,
  },
  pageThumb: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  pageThumbActive: {
    borderColor: Colors.brand,
  },
  pageThumbText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.caption.size,
    color: Colors.textPrimary,
  },
  canvasArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Space.md,
  },
  selectionToolbar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Space.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: Colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  selBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceAlt,
  },
});
