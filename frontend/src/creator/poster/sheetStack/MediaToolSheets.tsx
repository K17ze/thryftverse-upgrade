/**
 * MediaToolSheets — the media-tool sheet branches of PosterSheetStack:
 * transitions, keyframes, speed curve, reverse, freeze frame, audio
 * fade and the text color picker. Extracted verbatim from
 * PosterSheetStack.tsx.
 */
import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Space } from '../../../theme/designTokens';
import type { ThemeColors } from '../../../theme/ThemeContext';
import type { useHaptic } from '../../../hooks/useHaptic';
import { GlassSheet } from '../../surfaces/GlassSheet';
import { TransitionPreviewRail } from '../transitions/TransitionPreviewRail';
import { TRANSITION_PRESETS } from '../transitions/TransitionPresets';
import { KeyframeEditor } from '../keyframes/KeyframeEditor';
import type { Keyframe } from '../keyframes/KeyframeTypes';
import { SpeedCurveEditor } from '../speedcurves/SpeedCurveEditor';
import type { SpeedCurve } from '../speedcurves/SpeedCurveTypes';
import { DEFAULT_SPEED_CURVE } from '../speedcurves/SpeedCurveTypes';
import { ReverseToggle, FreezeFramePicker, AudioFadeControls } from '../tools';
import {
  CreatorColorPicker,
  toHexString,
  fromHexString,
  type CreatorColor,
  type RecentColor,
} from '../../color';
import type { CreatorLayer, CreatorPage } from '../../core/projectStore/composition';
import type { PosterSheetStackStyles } from '../PosterSheetStack';

type Haptic = ReturnType<typeof useHaptic>;

interface MediaToolSheetsProps {
  styles: PosterSheetStackStyles;
  colors: ThemeColors;
  sheetPaddingBottom: number;
  haptic: Haptic;
  closeSheet: () => void;
  selectedLayer: CreatorLayer | null;
  page: CreatorPage | undefined;
  updateLayer: (id: string, updates: Partial<CreatorLayer>, label?: string) => void;
  // Transitions
  showTransitions: boolean;
  currentTransitionId: string | null;
  handleTransitionSelect: (presetId: string) => void;
  // Keyframes
  showKeyframes: boolean;
  selectedLayerKeyframes: Keyframe[];
  handleAddKeyframe: (kf: Omit<Keyframe, 'id'>) => void;
  handleUpdateKeyframe: (id: string, updates: Partial<Keyframe>) => void;
  handleRemoveKeyframe: (id: string) => void;
  // Speed curve
  showSpeedCurve: boolean;
  selectedMediaSpeedCurve: SpeedCurve | null;
  handleSpeedCurveChange: (nextCurve: SpeedCurve) => void;
  // Reverse / freeze frame / audio fade
  showReverse: boolean;
  showFreezeFrame: boolean;
  showAudioFade: boolean;
  // Text color picker
  showTextColorPicker: boolean;
  setShowTextColorPicker: (v: boolean) => void;
  colorRecents: RecentColor[];
  commitRecentColor: (color: CreatorColor) => void;
}

export function MediaToolSheets({
  styles,
  colors,
  sheetPaddingBottom,
  haptic,
  closeSheet,
  selectedLayer,
  page,
  updateLayer,
  showTransitions,
  currentTransitionId,
  handleTransitionSelect,
  showKeyframes,
  selectedLayerKeyframes,
  handleAddKeyframe,
  handleUpdateKeyframe,
  handleRemoveKeyframe,
  showSpeedCurve,
  selectedMediaSpeedCurve,
  handleSpeedCurveChange,
  showReverse,
  showFreezeFrame,
  showAudioFade,
  showTextColorPicker,
  setShowTextColorPicker,
  colorRecents,
  commitRecentColor }: MediaToolSheetsProps) {
  return (
    <>
      {/* ── Transitions sheet (Phase 9) ─────────────────────────────── */}
      {/* Shows the TransitionPreviewRail for the current page. Selecting
          a preset stores the transitionId on the page, which the renderer
          uses to animate the transition to the next page. */}
      {showTransitions && (
        <GlassSheet
          title="Transitions"
          onClose={closeSheet}
          doneHint="Closes the transitions panel"
          paddingBottom={sheetPaddingBottom}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            style={styles.effectsSheetScroll}
          >
            <TransitionPreviewRail
              presets={TRANSITION_PRESETS}
              selectedId={currentTransitionId}
              onSelect={handleTransitionSelect}
            />
            <View style={{ height: Space.md }} />
          </ScrollView>
        </GlassSheet>
      )}

      {/* ── Keyframe editor sheet (Phase 9) ─────────────────────────── */}
      {/* Shows the KeyframeEditor for the selected layer. Keyframes are
          stored on the layer's `keyframes` array and interpolated by the
          renderer over the layer's timeline. */}
      {showKeyframes && selectedLayer && (
        <GlassSheet
          title="Animation"
          onClose={closeSheet}
          doneHint="Closes the keyframe editor"
          paddingBottom={sheetPaddingBottom}
        >
          <KeyframeEditor
            layerId={selectedLayer.id}
            // Video pages leave durationMs unset — the wall-clock clip
            // length comes from the projection ((trimEnd-trimStart)/speed).
            // Without it keyframes couldn't be placed past the 5s default.
            totalDurationMs={
              selectedLayer.type === 'media'
                ? Math.max(100,
                    ((selectedLayer.payload.trimEndMs ?? selectedLayer.payload.videoDurationMs ?? 5000)
                      - (selectedLayer.payload.trimStartMs ?? 0))
                    / ((selectedLayer.payload.speed ?? 1) > 0 ? (selectedLayer.payload.speed ?? 1) : 1))
                : (page?.durationMs ?? 5000)
            }
            keyframes={selectedLayerKeyframes}
            layerDefaults={{ x: selectedLayer.x, rotation: selectedLayer.rotation }}
            onAddKeyframe={handleAddKeyframe}
            onUpdateKeyframe={handleUpdateKeyframe}
            onRemoveKeyframe={handleRemoveKeyframe}
          />
        </GlassSheet>
      )}

      {/* ── Speed curve editor sheet ─────────────────────────────────── */}
      {/* Shows the SpeedCurveEditor for the selected media layer. The
          curve maps timeline position (0-1) to speed multiplier (0.25x-4x),
          enabling precise, dynamic speed ramping along a customizable curve
          (Instagram Edits parity, August 2026). */}
      {showSpeedCurve && selectedLayer && selectedLayer.type === 'media' && (
        <GlassSheet
          title="Speed Curve"
          onClose={closeSheet}
          doneHint="Closes the speed curve editor"
          paddingBottom={sheetPaddingBottom}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            style={styles.effectsSheetScroll}
          >
            <SpeedCurveEditor
              curve={selectedMediaSpeedCurve ?? DEFAULT_SPEED_CURVE}
              onChange={handleSpeedCurveChange}
            />
            <View style={{ height: Space.md }} />
          </ScrollView>
        </GlassSheet>
      )}
      {/* ── Reverse toggle sheet ────────────────────────────────────── */}
      {showReverse && selectedLayer && selectedLayer.type === 'media' && (
        <GlassSheet
          title="Reverse Clip"
          onClose={closeSheet}
          doneHint="Closes the reverse panel"
          paddingBottom={sheetPaddingBottom}
        >
          <View style={{ padding: Space.md, alignItems: 'center' }}>
            <ReverseToggle
              reversed={selectedLayer.payload.reversed ?? false}
              onToggle={(reversed) => {
                updateLayer(selectedLayer.id, {
                  type: 'media',
                  payload: { ...selectedLayer.payload, reversed },
                }, reversed ? 'Reverse clip' : 'Unreverse clip');
                haptic.medium();
              }}
            />
            <Text
              style={[
                styles.previewNotReflectedNote,
                { color: colors.textSecondary },
              ]}
            >
              Preview plays forward. Reverse is applied when the video is exported.
            </Text>
          </View>
        </GlassSheet>
      )}
      {/* ── Freeze frame picker sheet ───────────────────────────────── */}
      {showFreezeFrame && selectedLayer && selectedLayer.type === 'media' && (
        <GlassSheet
          title="Freeze Frame"
          onClose={closeSheet}
          doneHint="Closes the freeze frame panel"
          paddingBottom={sheetPaddingBottom}
        >
          <FreezeFramePicker
            // Bound by the TRIM window in source ms — freezeFrameMs is a
            // source offset from the trim start (computeSourceTime maps
            // it as sourceStartMs + freezeFrameMs), so picking past the
            // window would author a freeze that can never trigger.
            clipDurationMs={Math.max(100,
              (selectedLayer.payload.trimEndMs ?? selectedLayer.payload.videoDurationMs ?? 5000)
              - (selectedLayer.payload.trimStartMs ?? 0))}
            freezeFrameMs={selectedLayer.payload.freezeFrameMs}
            freezeDurationMs={selectedLayer.payload.freezeDurationMs}
            onSetFreezeFrame={(freezeMs, freezeDurMs) => {
              updateLayer(selectedLayer.id, {
                type: 'media',
                payload: {
                  ...selectedLayer.payload,
                  freezeFrameMs: freezeMs,
                  freezeDurationMs: freezeDurMs,
                },
              }, freezeMs ? 'Set freeze frame' : 'Clear freeze frame');
              haptic.medium();
            }}
          />
          <Text
            style={[
              styles.previewNotReflectedNote,
              { color: colors.textSecondary },
            ]}
          >
            Preview does not hold the frame. The freeze is applied when the video is exported.
          </Text>
        </GlassSheet>
      )}
      {/* ── Audio fade controls sheet ───────────────────────────────── */}
      {showAudioFade && selectedLayer && selectedLayer.type === 'media' && (
        <GlassSheet
          title="Audio Fade"
          onClose={closeSheet}
          doneHint="Closes the audio fade panel"
          paddingBottom={sheetPaddingBottom}
        >
          <AudioFadeControls
            fadeInMs={selectedLayer.payload.fadeInMs ?? 0}
            fadeOutMs={selectedLayer.payload.fadeOutMs ?? 0}
            onChange={(fadeInMs, fadeOutMs) => {
              updateLayer(selectedLayer.id, {
                type: 'media',
                payload: {
                  ...selectedLayer.payload,
                  volume: selectedLayer.payload.volume ?? 1,
                  fadeInMs,
                  fadeOutMs,
                },
              }, 'Set audio fade');
              haptic.medium();
            }}
          />
        </GlassSheet>
      )}
      {/* ── Text color picker sheet ──────────────────────────────────── */}
      {showTextColorPicker && selectedLayer && selectedLayer.type === 'text' && (
        <GlassSheet
          title="Text Color"
          onClose={() => setShowTextColorPicker(false)}
          doneHint="Closes the color picker"
          paddingBottom={sheetPaddingBottom}
        >
          <CreatorColorPicker
            color={selectedLayer.payload.fill ?? fromHexString(selectedLayer.payload.textColor ?? '#ffffff') ?? { space: 'srgb', r: 1, g: 1, b: 1, a: 1 }}
            onChange={(c: CreatorColor) => {
              updateLayer(selectedLayer.id, {
                type: 'text',
                payload: {
                  ...selectedLayer.payload,
                  fill: c,
                  textColor: toHexString(c),
                },
              }, 'Change text color');
            }}
            onCommit={(c: CreatorColor) => {
              updateLayer(selectedLayer.id, {
                type: 'text',
                payload: {
                  ...selectedLayer.payload,
                  fill: c,
                  textColor: toHexString(c),
                },
              }, 'Change text color');
              commitRecentColor(c);
              haptic.light();
            }}
            mode="expanded"
            recents={colorRecents}
            onCommitRecent={commitRecentColor}
            accessibilityLabel="Text color picker"
            accessibilityHint="Choose the text color"
          />
        </GlassSheet>
      )}
    </>
  );
}
