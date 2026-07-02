import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Typography, Space, Radius } from '../theme/designTokens';
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
      ? Colors.textMuted
      : diag.isReachable
        ? Colors.success
        : Colors.danger;
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
                <Ionicons name="close" size={22} color={Colors.textPrimary} />
              </Pressable>
            </View>

            <ScrollView style={styles.sheetBody} showsVerticalScrollIndicator={false}>
              <DiagRow label="API base URL" value={diag.apiBaseUrl || '(unresolved)'} />
              <DiagRow label="Reachability" value={statusLabel} valueColor={statusColor} />
              <DiagRow
                label="Last response count"
                value={diag.lastResponseCount == null ? '—' : String(diag.lastResponseCount)}
              />
              <DiagRow
                label="Last sync"
                value={diag.lastSyncAt ? new Date(diag.lastSyncAt).toLocaleTimeString() : '—'}
              />
              <DiagRow
                label="Last error"
                value={diag.lastError ?? '—'}
                valueColor={diag.lastError ? Colors.danger : undefined}
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
}: {
  label: string;
  value: string;
  valueColor?: string;
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

const styles = StyleSheet.create({
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
    zIndex: 999,
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipText: {
    color: '#fff',
    fontSize: 11,
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
    backgroundColor: Colors.surface,
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
    fontSize: 17,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  sheetBody: {
    gap: Space.sm,
  },
  row: {
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    gap: 2,
  },
  rowLabel: {
    fontSize: 11,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  rowValue: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
  },
  probeBtn: {
    marginTop: Space.md,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.textPrimary,
    alignItems: 'center',
  },
  probeBtnBusy: {
    opacity: 0.6,
  },
  probeBtnText: {
    color: Colors.background,
    fontSize: 14,
    fontFamily: Typography.family.bold,
  },
  footnote: {
    marginTop: Space.md,
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});

export default BackendDiagnosticsOverlay;
