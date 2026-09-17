/**
 * lookGlobalOverflow — global overflow groups + context-tool dedup for
 * the Look composer.
 *
 * Extracted from LookComposerScreen — pure relocation, no changes.
 * Canvas / Project / Accessibility / Help — grouped like the Poster
 * composer's overflow sheet. Rendered after the context tools and one
 * hairline divider.
 */

import type { NativeStackNavigationProp, RootStackParamList } from '../../../navigation/types';
import type { ToolDefinition } from '../../core/toolRegistry';
import type { GlobalOverflowGroup } from './LookOverflowMenu';
import type { LookComposerStateResult } from './useLookComposerState';

export function buildLookGlobalOverflow({
  cs,
  navigation,
  canExportDraft,
  handleExportDraftImage,
  contextOverflowTools,
}: {
  cs: LookComposerStateResult;
  navigation: NativeStackNavigationProp<RootStackParamList, 'CreatorStudio'>;
  canExportDraft: boolean;
  handleExportDraftImage: () => Promise<void>;
  contextOverflowTools: ToolDefinition[];
}): {
  globalOverflowGroups: GlobalOverflowGroup[];
  overflowContextTools: ToolDefinition[];
} {
  const {
    showSafeZone,
    setShowSafeZone,
    setShowBackground,
    setShowPreview,
    setShowSettings,
    setShowLayers,
    setShowA11yMove,
    setShowA11yZOrder,
    setShowA11yTransform,
    setShowHelp,
    setShowOverflow,
  } = cs;

  // ── Global overflow groups ───────────────────────────────────────────
  const globalOverflowGroups: GlobalOverflowGroup[] = [
    {
      id: 'canvas',
      items: [
        { id: 'look-background', icon: 'color-palette-outline', label: 'Background', onPress: () => { setShowBackground(true); setShowOverflow(false); } },
        { id: 'look-safe-area', icon: showSafeZone ? 'scan-circle-outline' : 'scan-outline', label: showSafeZone ? 'Safe Area On' : 'Safe Area', onPress: () => { setShowSafeZone(!showSafeZone); setShowOverflow(false); } },
      ],
    },
    {
      id: 'project',
      items: [
        { id: 'look-preview', icon: 'eye-outline', label: 'Preview', onPress: () => { setShowPreview(true); setShowOverflow(false); } },
        ...(canExportDraft
          ? [{ id: 'look-export', icon: 'download-outline' as const, label: 'Export image', onPress: () => { setShowOverflow(false); void handleExportDraftImage(); } }]
          : []),
        { id: 'look-drafts', icon: 'document-outline', label: 'Drafts', onPress: () => { navigation.navigate('CreatorDraftList'); setShowOverflow(false); } },
        { id: 'look-settings', icon: 'settings-outline', label: 'Settings', onPress: () => { setShowSettings(true); setShowOverflow(false); } },
      ],
    },
    {
      id: 'accessibility',
      items: [
        { id: 'look-layers', icon: 'layers-outline', label: 'Layers', onPress: () => { setShowLayers(true); setShowOverflow(false); } },
        { id: 'look-a11y-move', icon: 'accessibility-outline', label: 'Move', onPress: () => { setShowA11yMove(true); setShowOverflow(false); } },
        { id: 'look-a11y-arrange', icon: 'swap-vertical-outline', label: 'Arrange', onPress: () => { setShowA11yZOrder(true); setShowOverflow(false); } },
        { id: 'look-a11y-transform', icon: 'resize-outline', label: 'Resize & rotate', onPress: () => { setShowA11yTransform(true); setShowOverflow(false); } },
      ],
    },
    {
      id: 'help',
      items: [
        { id: 'look-help', icon: 'help-circle-outline', label: 'Help', onPress: () => { setShowHelp(true); setShowOverflow(false); } },
      ],
    },
  ];

  // Dedup safety net — a context tool never repeats a global tool (by id or label).
  const globalToolKeys = new Set<string>();
  for (const group of globalOverflowGroups) {
    for (const item of group.items) {
      globalToolKeys.add(item.id);
      globalToolKeys.add(item.label);
    }
  }
  const seenContextToolKeys = new Set<string>();
  const overflowContextTools = contextOverflowTools.filter((tool) => {
    if (globalToolKeys.has(tool.id) || globalToolKeys.has(tool.label)) return false;
    if (seenContextToolKeys.has(tool.id) || seenContextToolKeys.has(tool.label)) return false;
    seenContextToolKeys.add(tool.id);
    seenContextToolKeys.add(tool.label);
    return true;
  });

  return { globalOverflowGroups, overflowContextTools };
}
