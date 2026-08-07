import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Typography, Space, Radius, Type } from '../theme/designTokens';
import {
  getBackendDiagnostics,
  subscribeToBackendDiagnostics,
  probeBackendReachability,
  type BackendDiagnosticsState,
} from '../lib/backendDiagnostics';

/**
 * Dev-only backend connection diagnostics overlay.
 *
 * Renders a small floating chip in dev builds. Tapping expands a modal with
 * the resolved API base URL, reachability probe, last response count, and last
 * sync error. NEVER rendered in production — the exporter checks `__DEV__`.
 */
export function BackendDiagnosticsOverlay() {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const [diag, setDiag] = useState<BackendDiagnosticsState>(getBackendDiagnostics());
  const [probing, setProbing] = useState(false);

  useEffect(() => {
    return subscribeToBackendDiagnostics(setDiag);
  }, []);

  const handleProbe = async () => {
    setProbing(true);
    await probeBackendReachability();
    setProbing(false);
  };

  const statusColor =
    diag.isReachable === null
      ? colors.textMuted
      : diag.isReachable
        ? colors.success
        : colors.danger;
  const statusLabel =
    diag.isReachable === null
      ? 'unknown'
      : diag.isReachable
        ? 'reachable'
        : 'unreachable';

  return (
    <>
      <Pressable
        style={styles.chip}
        onPress={() => setOpen(true)}
        accessibilityLabel="Open backend diagnostics"
        accessibilityRole="button"
      >
        <View style={[styles.chipDot, { backgroundColor: statusColor }]} />
        <Text style={styles.chipText}>API</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Backend Diagnostics</Text>
              <Pressable onPress={() => setOpen(false)} accessibilityLabel="Close diagnostics">
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </Pressable>
            </View>

            <ScrollView style={styles.sheetBody} showsVerticalScrollIndicator={false}>
              <DiagRow label="API base URL" value={diag.apiBaseUrl || '(unresolved)'} styles={styles} />
              <DiagRow label="Reachability" value={statusLabel} valueColor={statusColor} styles={styles} />
              <DiagRow
                label="Last response count"
                value={diag.lastResponseCount == null ? '—' : String(diag.lastResponseCount)}
                styles={styles}
              />
              <DiagRow
                label="Last sync"
                value={diag.lastSyncAt ? new Date(diag.lastSyncAt).toLocaleTimeString() : '—'}
                styles={styles}
              />
              <DiagRow
                label="Last error"
                value={diag.lastError ?? '—'}
                valueColor={diag.lastError ? colors.danger : undefined}
                styles={styles}
              />

              <Pressable
                style={[styles.probeBtn, probing && styles.probeBtnBusy]}
                onPress={() => void handleProbe()}
                disabled={probing}
                accessibilityRole="button"
                accessibilityLabel="Probe backend reachability"
              >
                <Text style={styles.probeBtnText}>
                  {probing ? 'Probing…' : 'Probe /health now'}
                </Text>
              </Pressable>

              <Text style={styles.footnote}>
                Dev-only. Not shown to production users.
              </Text>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function DiagRow({
  label,
  value,
  valueColor,
  styles,
}: {
  label: string;
  value: string;
  valueColor?: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, valueColor ? { color: valueColor } : null]} numberOfLines={3}>
        {value}
      </Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    chip: {
      position: 'absolute',
      bottom: Space.lg,
      left: Space.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: Radius.full,
      backgroundColor: 'rgba(0,0,0,0.6)',
      zIndex: 40,
    },
    chipDot: {
      width: 8,
      height: 8,
      borderRadius: Radius.sm,
    },
    chipText: {
      color: '#fff',
      fontSize: Type.meta.size,
      fontFamily: Typography.family.bold,
      letterSpacing: 0.4,
    },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: Space.lg,
    },
    sheet: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: colors.surface,
      borderRadius: Radius.lg,
      padding: Space.md,
      maxHeight: '80%',
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Space.md,
    },
    sheetTitle: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
    },
    sheetBody: {
      gap: Space.sm,
    },
    row: {
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      gap: 2,
    },
    rowLabel: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.medium,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    rowValue: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      color: colors.textPrimary,
    },
    probeBtn: {
      marginTop: Space.md,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.md,
      borderRadius: Radius.md,
      backgroundColor: colors.textPrimary,
      alignItems: 'center',
    },
    probeBtnBusy: {
      opacity: 0.6,
    },
    probeBtnText: {
      color: colors.background,
      fontSize: Type.body.size,
      fontFamily: Typography.family.bold,
    },
    footnote: {
      marginTop: Space.md,
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      textAlign: 'center',
    },
  });
}

export default BackendDiagnosticsOverlay;
