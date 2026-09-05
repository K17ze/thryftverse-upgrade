import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { useStore } from '../../store/useStore';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { useHaptic } from '../../hooks/useHaptic';
import { Space, Radius, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { appStorage } from '../../storage/mmkv';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';

export interface SocialNote {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUri?: string;
  text: string;
  musicTrack?: string;
  isCurrentUser?: boolean;
}

const STORAGE_KEY_USER_NOTE = 'inbox.social_note.v1';

// Seed notes from community creators and active peers (Instagram / Snapchat standard)
const DEFAULT_COMMUNITY_NOTES: SocialNote[] = [
  {
    id: 'note-curator-1',
    userId: 'u-vintage-vault',
    username: 'archive_vault',
    displayName: 'Archive Vault',
    avatarUri: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
    text: 'Sourcing 90s Carhartt in Tokyo today 🇯🇵',
    musicTrack: 'Reflection',
  },
  {
    id: 'note-curator-2',
    userId: 'u-denim-doc',
    username: 'selvedge_lab',
    displayName: 'Selvedge Lab',
    avatarUri: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80',
    text: 'Drop tomorrow 6PM BST ⏱️',
  },
  {
    id: 'note-curator-3',
    userId: 'u-y2k-studio',
    username: 'y2k_collective',
    displayName: 'Y2K Studio',
    avatarUri: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=150&q=80',
    text: 'Matrix is sending bots to my account 💀',
  },
  {
    id: 'note-curator-4',
    userId: 'u-minimal-mono',
    username: 'mono_atelier',
    displayName: 'Mono Atelier',
    avatarUri: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=150&q=80',
    text: 'Clean silhouettes only',
    musicTrack: 'La petite fille de la mer',
  },
];

interface InboxNotesTrayProps {
  onNotePress?: (note: SocialNote) => void;
}

export function InboxNotesTray({ onNotePress }: InboxNotesTrayProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const currentUser = useStore((state) => state.currentUser);
  const userAvatar = useStore((state) => state.userAvatar);

  const [composerVisible, setComposerVisible] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [musicText, setMusicText] = useState('');
  const [userNote, setUserNote] = useState<SocialNote | null>(null);

  // Load persisted user note from MMKV
  useEffect(() => {
    try {
      const raw = appStorage.getString(STORAGE_KEY_USER_NOTE);
      if (raw) {
        const parsed = JSON.parse(raw);
        setUserNote(parsed);
      }
    } catch {
      // Best-effort storage hydration
    }
  }, []);

  const handleSaveNote = useCallback(() => {
    if (!noteText.trim()) return;
    haptic.success();
    const newNote: SocialNote = {
      id: 'my-note',
      userId: currentUser?.id ?? 'me',
      username: currentUser?.username ?? 'you',
      displayName: currentUser?.displayName ?? currentUser?.username ?? 'You',
      avatarUri: userAvatar ?? currentUser?.avatar ?? undefined,
      text: noteText.trim(),
      musicTrack: musicText.trim() ? musicText.trim() : undefined,
      isCurrentUser: true,
    };
    setUserNote(newNote);
    try {
      appStorage.set(STORAGE_KEY_USER_NOTE, JSON.stringify(newNote));
    } catch {
      // Best-effort MMKV write
    }
    setComposerVisible(false);
  }, [currentUser, haptic, musicText, noteText, userAvatar]);

  const handleDeleteNote = useCallback(() => {
    haptic.light();
    setUserNote(null);
    try {
      appStorage.remove(STORAGE_KEY_USER_NOTE);
    } catch {
      // Best-effort MMKV deletion
    }
    setNoteText('');
    setMusicText('');
    setComposerVisible(false);
  }, [haptic]);

  const handleOpenMyNoteComposer = useCallback(() => {
    haptic.selection();
    if (userNote) {
      setNoteText(userNote.text);
      setMusicText(userNote.musicTrack ?? '');
    } else {
      setNoteText('');
      setMusicText('');
    }
    setComposerVisible(true);
  }, [haptic, userNote]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.trayContainer}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        accessibilityRole="scrollbar"
        accessibilityLabel="Stories and notes tray"
      >
        {/* Current user's note bubble */}
        <AnimatedPressable
          style={styles.noteItem}
          onPress={handleOpenMyNoteComposer}
          hapticFeedback="light"
          scaleValue={0.96}
          accessibilityRole="button"
          accessibilityLabel={
            userNote ? `Your note: ${userNote.text}` : 'Share a thought, leave a note'
          }
        >
          {/* Floating thought bubble */}
          <View style={[styles.bubbleWrap, userNote && styles.bubbleWrapActive]}>
            <View style={[styles.bubbleContent, userNote && styles.bubbleContentActive]}>
              {userNote?.musicTrack ? (
                <View style={styles.musicRow}>
                  <Ionicons name="musical-notes" size={10} color={colors.brand} />
                  <Text style={styles.musicText} numberOfLines={1}>
                    {userNote.musicTrack}
                  </Text>
                </View>
              ) : null}
              <Text style={styles.bubbleText} numberOfLines={2}>
                {userNote ? userNote.text : 'Share a thought…'}
              </Text>
            </View>
            <View style={[styles.bubbleTail, userNote && styles.bubbleTailActive]} />
          </View>

          {/* Avatar with add badge */}
          <View style={styles.avatarWrap}>
            {userAvatar || currentUser?.avatar ? (
              <CachedImage
                uri={userAvatar || currentUser?.avatar!}
                style={styles.avatar}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.avatar, styles.fallbackAvatar]}>
                <Text style={styles.fallbackInitial}>
                  {(currentUser?.username ?? 'Y').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.badgeAdd}>
              <Ionicons name="add" size={12} color={colors.textInverse} />
            </View>
          </View>

          <Text style={styles.authorLabel} numberOfLines={1}>
            Your note
          </Text>
        </AnimatedPressable>

        {/* Community / Friends' notes */}
        {DEFAULT_COMMUNITY_NOTES.map((note) => (
          <AnimatedPressable
            key={note.id}
            style={styles.noteItem}
            onPress={() => {
              haptic.light();
              if (onNotePress) {
                onNotePress(note);
              } else {
                // Navigate to conversation or new message with this user
                navigation.navigate('NewMessage');
              }
            }}
            hapticFeedback="light"
            scaleValue={0.96}
            accessibilityRole="button"
            accessibilityLabel={`${note.displayName}'s note: ${note.text}`}
          >
            {/* Floating thought bubble */}
            <View style={styles.bubbleWrap}>
              <View style={styles.bubbleContent}>
                {note.musicTrack ? (
                  <View style={styles.musicRow}>
                    <Ionicons name="musical-notes" size={10} color={colors.brand} />
                    <Text style={styles.musicText} numberOfLines={1}>
                      {note.musicTrack}
                    </Text>
                  </View>
                ) : null}
                <Text style={styles.bubbleText} numberOfLines={2}>
                  {note.text}
                </Text>
              </View>
              <View style={styles.bubbleTail} />
            </View>

            {/* Avatar */}
            <View style={styles.avatarWrap}>
              <CachedImage uri={note.avatarUri!} style={styles.avatar} contentFit="cover" />
            </View>

            <Text style={styles.authorLabel} numberOfLines={1}>
              {note.username}
            </Text>
          </AnimatedPressable>
        ))}
      </ScrollView>

      {/* Note Composer Modal */}
      <Modal
        visible={composerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setComposerVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <Pressable style={styles.modalDismissArea} onPress={() => setComposerVisible(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {userNote ? 'Update note' : 'Leave a note'}
              </Text>
              <AnimatedPressable
                onPress={() => setComposerVisible(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Close note composer"
              >
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </AnimatedPressable>
            </View>

            <Text style={styles.modalSubtitle}>
              Notes disappear after 24 hours. Followers you follow back will see your note here.
            </Text>

            <View style={styles.inputBox}>
              <TextInput
                style={styles.textInput}
                placeholder="Share what's on your mind…"
                placeholderTextColor={colors.textMuted}
                value={noteText}
                onChangeText={setNoteText}
                maxLength={60}
                autoFocus
                returnKeyType="done"
              />
              <Text style={styles.charCount}>{60 - noteText.length}</Text>
            </View>

            <View style={styles.musicInputRow}>
              <Ionicons name="musical-notes-outline" size={18} color={colors.brand} />
              <TextInput
                style={styles.musicInput}
                placeholder="Add a track title (optional)"
                placeholderTextColor={colors.textMuted}
                value={musicText}
                onChangeText={setMusicText}
                maxLength={40}
              />
            </View>

            <View style={styles.modalActions}>
              {userNote ? (
                <AnimatedPressable
                  style={styles.deleteBtn}
                  onPress={handleDeleteNote}
                  hapticFeedback="light"
                  accessibilityRole="button"
                  accessibilityLabel="Delete note"
                >
                  <Text style={styles.deleteBtnText}>Delete note</Text>
                </AnimatedPressable>
              ) : null}

              <AnimatedPressable
                style={[styles.shareBtn, !noteText.trim() && styles.shareBtnDisabled]}
                disabled={!noteText.trim()}
                onPress={handleSaveNote}
                hapticFeedback="light"
                accessibilityRole="button"
                accessibilityLabel="Share note"
              >
                <Text style={styles.shareBtnText}>Share</Text>
              </AnimatedPressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    trayContainer: {
      paddingVertical: Space.sm,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingHorizontal: Space.md,
      gap: Space.md,
      alignItems: 'flex-start',
    },
    noteItem: {
      width: 78,
      alignItems: 'center',
    },
    bubbleWrap: {
      alignItems: 'center',
      marginBottom: 6,
      minHeight: 40,
      justifyContent: 'flex-end',
    },
    bubbleWrapActive: {},
    bubbleContent: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.lg,
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderWidth: Stroke.hairline,
      borderColor: colors.border,
      maxWidth: 78,
      alignItems: 'center',
    },
    bubbleContentActive: {
      borderColor: colors.brand,
    },
    bubbleTail: {
      width: 6,
      height: 4,
      borderTopWidth: 4,
      borderTopColor: colors.surfaceAlt,
      borderLeftWidth: 4,
      borderLeftColor: 'transparent',
      borderRightWidth: 4,
      borderRightColor: 'transparent',
      marginTop: -0.5,
    },
    bubbleTailActive: {
      borderTopColor: colors.surfaceAlt,
    },
    bubbleText: {
      fontSize: 10,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textPrimary,
      textAlign: 'center',
      lineHeight: 12,
    },
    musicRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginBottom: 2,
    },
    musicText: {
      fontSize: 8,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.brand,
      maxWidth: 60,
    },
    avatarWrap: {
      width: 58,
      height: 58,
      borderRadius: 29,
      position: 'relative',
    },
    avatar: {
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    fallbackAvatar: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    fallbackInitial: {
      fontSize: 20,
      fontFamily: TypographyV2.itemTitle.fontFamily,
      color: colors.textSecondary,
    },
    badgeAdd: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.brand,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.background,
    },
    authorLabel: {
      marginTop: 6,
      fontSize: 11,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
      textAlign: 'center',
      width: '100%',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      padding: Space.lg,
    },
    modalDismissArea: {
      ...StyleSheet.absoluteFill,
    },
    modalCard: {
      backgroundColor: colors.surface,
      borderRadius: Radius.xl,
      padding: Space.lg,
      borderWidth: Stroke.hairline,
      borderColor: colors.border,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: Space.xs,
    },
    modalTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      color: colors.textPrimary,
    },
    modalSubtitle: {
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.caption.fontFamily,
      color: colors.textMuted,
      marginBottom: Space.md,
      lineHeight: 16,
    },
    inputBox: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.md,
      padding: Space.md,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      marginBottom: Space.sm,
      flexDirection: 'row',
      alignItems: 'center',
    },
    textInput: {
      flex: 1,
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textPrimary,
      padding: 0,
    },
    charCount: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      marginLeft: Space.xs,
    },
    musicInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.md,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderWidth: Stroke.hairline,
      borderColor: colors.border,
      marginBottom: Space.lg,
    },
    musicInput: {
      flex: 1,
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.caption.fontFamily,
      color: colors.textPrimary,
      padding: 0,
    },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: Space.md,
    },
    deleteBtn: {
      paddingVertical: Space.sm,
      paddingHorizontal: Space.md,
    },
    deleteBtnText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.danger,
    },
    shareBtn: {
      backgroundColor: colors.brand,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.xl,
      borderRadius: Radius.full,
    },
    shareBtnDisabled: {
      opacity: 0.5,
    },
    shareBtnText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textInverse,
    },
  });
