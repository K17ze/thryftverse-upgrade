/**
 * MoodboardCollaboratorSheet — manage board collaborators.
 * Flat roster + pending invites within a FormSheet. Owner can change
 * roles, remove members, create invites (token shown once, copy button),
 * and revoke pending invites. Hairline separators, one radius grammar.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { FormSheet } from './sheets/FormSheet';
import { AnimatedPressable } from './AnimatedPressable';
import { CachedImage } from './CachedImage';
import { useAppTheme } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { Space, Radius, Type, FontFamily, Control, Stroke } from '../theme/designTokens';
import {
  fetchMoodboardMembers, fetchMoodboardInvites, createMoodboardInvite,
  revokeMoodboardInvite, updateMoodboardMemberRole, removeMoodboardMember,
  type MoodboardMember, type MoodboardInvite, type MoodboardInviteRole,
} from '../services/moodboardApi';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  moodboardId: string;
  isOwner: boolean;
}

const ROLE_ORDER: MoodboardInviteRole[] = ['editor', 'commenter', 'viewer'];
const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner', editor: 'Editor', commenter: 'Commenter', viewer: 'Viewer',
};

export function MoodboardCollaboratorSheet({ visible, onDismiss, moodboardId, isOwner }: Props) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { show } = useToast();
  const [members, setMembers] = useState<MoodboardMember[]>([]);
  const [invites, setInvites] = useState<MoodboardInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<MoodboardInviteRole>('editor');
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null); setCreatedToken(null);
    try {
      const [m, i] = await Promise.all([
        fetchMoodboardMembers(moodboardId),
        fetchMoodboardInvites(moodboardId),
      ]);
      setMembers(m);
      setInvites(i.filter((inv) => inv.state === 'pending'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load collaborators');
    } finally {
      setLoading(false);
    }
  }, [moodboardId]);

  useEffect(() => { if (visible) load(); }, [visible, load]);

  const handleCreateInvite = useCallback(async () => {
    setBusy(true);
    try {
      const created = await createMoodboardInvite(moodboardId, inviteRole);
      setCreatedToken(created.token);
      setInvites((prev) => [created, ...prev.filter((p) => p.id !== created.id)]);
      haptic.medium();
    } catch (e) {
      show(e instanceof Error ? e.message : 'Could not create invite', 'error');
    } finally { setBusy(false); }
  }, [moodboardId, inviteRole, haptic, show]);

  const handleCopyToken = useCallback(async () => {
    if (!createdToken) return;
    await Clipboard.setStringAsync(createdToken);
    haptic.light(); show('Token copied', 'success');
  }, [createdToken, haptic, show]);

  const handleRevoke = useCallback(async (inviteId: string) => {
    setBusy(true);
    try {
      await revokeMoodboardInvite(moodboardId, inviteId);
      setInvites((prev) => prev.filter((p) => p.id !== inviteId));
      haptic.medium();
    } catch (e) {
      show(e instanceof Error ? e.message : 'Could not revoke', 'error');
    } finally { setBusy(false); }
  }, [moodboardId, haptic, show]);

  const handleChangeRole = useCallback(async (userId: string, role: MoodboardInviteRole) => {
    setBusy(true);
    try {
      await updateMoodboardMemberRole(moodboardId, userId, role);
      setMembers((prev) => prev.map((m) => (m.userId === userId ? { ...m, role } : m)));
      haptic.selection();
    } catch (e) {
      show(e instanceof Error ? e.message : 'Could not update role', 'error');
    } finally { setBusy(false); }
  }, [moodboardId, haptic, show]);

  const handleRemove = useCallback(async (userId: string) => {
    setBusy(true);
    try {
      await removeMoodboardMember(moodboardId, userId);
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
      haptic.medium();
    } catch (e) {
      show(e instanceof Error ? e.message : 'Could not remove member', 'error');
    } finally { setBusy(false); }
  }, [moodboardId, haptic, show]);

  const styles = useMemo(() => createStyles(colors), [colors]);
  const pending = invites.filter((i) => i.state === 'pending');
  const empty = members.length === 0 && pending.length === 0 && !isOwner;

  const renderRolePicker = (selected: MoodboardInviteRole, onSelect: (r: MoodboardInviteRole) => void) => (
    <View style={styles.rolePicker}>
      {ROLE_ORDER.map((r) => {
        const sel = selected === r;
        return (
          <AnimatedPressable
            key={r}
            style={[styles.rolePill, sel && styles.rolePillSelected]}
            onPress={() => onSelect(r)}
            hapticFeedback="selection"
            disabled={busy}
          >
            <Text style={[styles.rolePillText, sel && styles.rolePillTextSelected]}>{ROLE_LABEL[r]}</Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );

  return (
    <FormSheet visible={visible} onDismiss={onDismiss} title="Collaborators"
      rightAction={{ label: 'Done', onPress: onDismiss }} snapPoint={0.7}>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>{error}</Text>
          <AnimatedPressable style={styles.retryButton} onPress={load} hapticFeedback="light">
            <Text style={styles.retryText}>Retry</Text>
          </AnimatedPressable>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {empty ? (
            <Text style={styles.emptyText}>No collaborators yet.</Text>
          ) : (
            <>
              {members.map((m, idx) => (
                <View key={m.userId} style={[styles.row, idx > 0 && styles.rowSeparator]}>
                  <CachedImage uri={m.avatar} style={styles.avatar} />
                  <View style={styles.rowBody}>
                    <Text style={styles.name} numberOfLines={1}>{m.displayName}</Text>
                    {m.role === 'owner' || !isOwner ? (
                      <Text style={styles.roleText}>{ROLE_LABEL[m.role]}</Text>
                    ) : (
                      renderRolePicker(m.role as MoodboardInviteRole, (r) => handleChangeRole(m.userId, r))
                    )}
                  </View>
                  {isOwner && m.role !== 'owner' && (
                    <AnimatedPressable style={styles.removeButton} onPress={() => handleRemove(m.userId)}
                      hapticFeedback="medium" disabled={busy} accessibilityLabel="Remove member">
                      <Text style={styles.removeText}>Remove</Text>
                    </AnimatedPressable>
                  )}
                </View>
              ))}

              {pending.length > 0 && <Text style={styles.sectionLabel}>Pending invites</Text>}
              {pending.map((inv, idx) => (
                <View key={inv.id} style={[styles.row, idx > 0 && styles.rowSeparator]}>
                  <View style={styles.inviteBody}>
                    <Text style={styles.name}>{ROLE_LABEL[inv.role]} invite</Text>
                    <Text style={styles.caption}>
                      Expires {new Date(inv.expiresAt).toLocaleDateString()}
                    </Text>
                  </View>
                  {isOwner && (
                    <AnimatedPressable style={styles.removeButton} onPress={() => handleRevoke(inv.id)}
                      hapticFeedback="medium" disabled={busy} accessibilityLabel="Revoke invite">
                      <Text style={styles.removeText}>Revoke</Text>
                    </AnimatedPressable>
                  )}
                </View>
              ))}

              {isOwner && (
                <>
                  <Text style={styles.sectionLabel}>New invite</Text>
                  {renderRolePicker(inviteRole, setInviteRole)}
                  <AnimatedPressable style={styles.inviteButton} onPress={handleCreateInvite}
                    hapticFeedback="medium" disabled={busy}>
                    <Text style={styles.inviteButtonText}>Invite</Text>
                  </AnimatedPressable>
                  {createdToken && (
                    <View style={styles.tokenBox}>
                      <Text style={styles.tokenLabel}>Share this token</Text>
                      <Text style={styles.tokenValue} selectable>{createdToken}</Text>
                      <AnimatedPressable style={styles.copyButton} onPress={handleCopyToken} hapticFeedback="light">
                        <Text style={styles.copyButtonText}>Copy</Text>
                      </AnimatedPressable>
                    </View>
                  )}
                </>
              )}
            </>
          )}
        </ScrollView>
      )}
    </FormSheet>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: Space.md, paddingBottom: Space.lg },
    center: { paddingVertical: Space.xl, alignItems: 'center', justifyContent: 'center' },
    emptyText: {
      fontFamily: FontFamily.regular, fontSize: Type.body.size, lineHeight: Type.body.lineHeight,
      color: colors.textSecondary, textAlign: 'center',
    },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: Space.smMd, gap: Space.sm },
    rowSeparator: { borderTopWidth: Stroke.hairline, borderTopColor: colors.borderSubtle },
    avatar: { width: 32, height: 32, borderRadius: Radius.full, backgroundColor: colors.surfaceAlt },
    rowBody: { flex: 1, gap: Space.xs },
    inviteBody: { flex: 1, gap: Space.xxs },
    name: {
      fontFamily: FontFamily.semibold, fontSize: Type.bodyStrong.size,
      lineHeight: Type.bodyStrong.lineHeight, color: colors.textPrimary,
    },
    roleText: {
      fontFamily: FontFamily.regular, fontSize: Type.caption.size,
      lineHeight: Type.caption.lineHeight, color: colors.textSecondary,
    },
    caption: {
      fontFamily: FontFamily.regular, fontSize: Type.caption.size,
      lineHeight: Type.caption.lineHeight, color: colors.textMuted,
    },
    rolePicker: { flexDirection: 'row', gap: Space.xs, flexWrap: 'wrap' },
    rolePill: {
      paddingVertical: Space.xs, paddingHorizontal: Space.sm, borderRadius: Radius.full,
      borderWidth: Stroke.hairline, borderColor: colors.borderSubtle,
      minHeight: Control.chromeCompact, justifyContent: 'center',
    },
    rolePillSelected: { backgroundColor: colors.brandSubtle, borderColor: colors.brandBorder },
    rolePillText: { fontFamily: FontFamily.medium, fontSize: Type.caption.size, color: colors.textSecondary },
    rolePillTextSelected: { color: colors.brand },
    removeButton: { minHeight: Control.hit, justifyContent: 'center', paddingHorizontal: Space.xs },
    removeText: { fontFamily: FontFamily.medium, fontSize: Type.caption.size, color: colors.danger },
    sectionLabel: {
      fontFamily: FontFamily.semibold, fontSize: Type.metaElevated.size,
      lineHeight: Type.metaElevated.lineHeight, letterSpacing: Type.metaElevated.letterSpacing,
      color: colors.textMuted, textTransform: 'uppercase',
      marginTop: Space.lg, marginBottom: Space.sm,
    },
    inviteButton: {
      minHeight: Control.hit, borderRadius: Radius.sm, backgroundColor: colors.brand,
      alignItems: 'center', justifyContent: 'center', marginTop: Space.sm,
    },
    inviteButtonText: { fontFamily: FontFamily.semibold, fontSize: Type.bodyEmphasis.size, color: colors.textInverse },
    tokenBox: { marginTop: Space.md, padding: Space.md, borderRadius: Radius.md, backgroundColor: colors.surfaceAlt, gap: Space.sm },
    tokenLabel: { fontFamily: FontFamily.medium, fontSize: Type.caption.size, color: colors.textSecondary },
    tokenValue: {
      fontFamily: FontFamily.regular, fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight, color: colors.textPrimary,
    },
    copyButton: {
      alignSelf: 'flex-start', minHeight: Control.chromeCompact, paddingHorizontal: Space.md,
      justifyContent: 'center', borderRadius: Radius.sm, backgroundColor: colors.brandSubtle,
    },
    copyButtonText: { fontFamily: FontFamily.semibold, fontSize: Type.caption.size, color: colors.brand },
    retryButton: {
      minHeight: Control.hit, paddingHorizontal: Space.lg, justifyContent: 'center',
      borderRadius: Radius.sm, backgroundColor: colors.brandSubtle, marginTop: Space.md,
    },
    retryText: { fontFamily: FontFamily.semibold, fontSize: Type.bodyEmphasis.size, color: colors.brand },
  });
