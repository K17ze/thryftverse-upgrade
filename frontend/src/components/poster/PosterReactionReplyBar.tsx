import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { Colors } from '../../constants/colors';
import type { PosterReactionType } from '../../services/postersApi';

const REACTIONS: Array<{ type: PosterReactionType; icon: string; label: string }> = [
  { type: 'love', icon: 'heart', label: 'Love' },
  { type: 'fire', icon: 'flame', label: 'Fire' },
  { type: 'style', icon: 'shirt', label: 'Style' },
  { type: 'want', icon: 'bag-add', label: 'Want' },
  { type: 'wow', icon: 'sparkles', label: 'Wow' },
  { type: 'laugh', icon: 'happy', label: 'Laugh' },
];

interface PosterReactionReplyBarProps {
  allowReactions: boolean;
  allowReplies: boolean;
  viewerReaction: string | null;
  onReaction: (reaction: PosterReactionType) => void;
  onRemoveReaction: () => void;
  onReply: (text: string) => void;
  isOwner: boolean;
  onShowActivity?: () => void;
}

export function PosterReactionReplyBar({
  allowReactions,
  allowReplies,
  viewerReaction,
  onReaction,
  onRemoveReaction,
  onReply,
  isOwner,
  onShowActivity,
}: PosterReactionReplyBarProps) {
  const [replyText, setReplyText] = useState('');
  const [showReactions, setShowReactions] = useState(false);

  const handleSendReply = () => {
    const trimmed = replyText.trim();
    if (!trimmed) return;
    onReply(trimmed);
    setReplyText('');
  };

  if (isOwner) {
    return (
      <View style={styles.container}>
        {onShowActivity && (
          <Pressable style={styles.activityBtn} onPress={onShowActivity}>
            <Ionicons name="people-outline" size={18} color="#fff" />
            <Text style={styles.activityBtnText}>Activity</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      {showReactions && allowReactions && (
        <View style={styles.reactionTray}>
          {REACTIONS.map((r) => (
            <Pressable
              key={r.type}
              onPress={() => {
                if (viewerReaction === r.type) {
                  onRemoveReaction();
                } else {
                  onReaction(r.type);
                }
                setShowReactions(false);
              }}
              style={[
                styles.reactionBtn,
                viewerReaction === r.type && styles.reactionBtnActive,
              ]}
              accessibilityLabel={`${r.label} reaction`}
              accessibilityRole="button"
            >
              <Ionicons name={r.icon as any} size={22} color={viewerReaction === r.type ? Colors.brand : '#fff'} />
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.inputRow}>
        {allowReactions && (
          <Pressable
            onPress={() => setShowReactions(!showReactions)}
            style={styles.emojiBtn}
            accessibilityLabel="Show reactions"
            accessibilityRole="button"
          >
            <Ionicons name={viewerReaction ? 'heart' : 'happy-outline'} size={22} color={viewerReaction ? Colors.brand : '#fff'} />
          </Pressable>
        )}

        {allowReplies && (
          <TextInput
            style={styles.replyInput}
            placeholder="Send a private reply..."
            placeholderTextColor="rgba(255,255,255,0.5)"
            value={replyText}
            onChangeText={setReplyText}
            maxLength={1000}
            returnKeyType="send"
            onSubmitEditing={handleSendReply}
          />
        )}

        {allowReplies && replyText.trim().length > 0 && (
          <Pressable onPress={handleSendReply} style={styles.sendBtn} accessibilityLabel="Send reply">
            <Ionicons name="send" size={20} color="#fff" />
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
    gap: Space.sm,
  },
  reactionTray: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: Radius.lg,
  },
  reactionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  reactionBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: Colors.brand,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  emojiBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  replyInput: {
    flex: 1,
    minHeight: 40,
    borderRadius: Radius.full,
    paddingHorizontal: Space.md,
    backgroundColor: 'rgba(0,0,0,0.35)',
    color: '#fff',
    fontFamily: Typography.family.regular,
    fontSize: Type.body.size,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.brand,
  },
  activityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: Radius.full,
    paddingHorizontal: Space.md + 4,
    paddingVertical: Space.sm,
    alignSelf: 'flex-start',
  },
  activityBtnText: {
    color: '#fff',
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
  },
});
