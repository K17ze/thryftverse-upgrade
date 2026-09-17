import React from 'react';
import { View, Text } from 'react-native';
import { useAppTheme } from '../../../theme/ThemeContext';
import { PressScale } from '../../shared/CreatorAnimations';
import { lookComposerStyles as styles } from '../LookComposerStyles';

// ── LayoutPanel — bottom surface for layout selection ─────────────────
// A panel with a header (title + Done button) that wraps the
// LookAutoLayoutBar and LayoutPreviewRail. Replaces the ContextToolRail
// temporarily when the user taps "Layout".
export const LookLayoutPanel = React.memo(function LookLayoutPanel({
  title,
  onClose,
  colors,
  children }: {
  title?: string;
  onClose: () => void;
  colors: ReturnType<typeof useAppTheme>['colors'];
  children: React.ReactNode;
}) {
  return (
    <View style={styles.layoutPanel}>
      <View style={[styles.effectsSheetHeader, { borderBottomColor: colors.border }]}>
        <Text style={[styles.effectsSheetTitle, { color: colors.textPrimary }]}>
          {title}
        </Text>
        <PressScale
          onPress={onClose}
          style={styles.effectsSheetDone}
          accessibilityLabel="Done"
          accessibilityHint="Close layout panel"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={[styles.effectsSheetDoneText, { color: colors.brand }]}>
            Done
          </Text>
        </PressScale>
      </View>
      <View style={styles.layoutPanelContent}>
        {children}
      </View>
    </View>
  );
});
