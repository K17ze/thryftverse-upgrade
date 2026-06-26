import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { Colors } from '../constants/colors';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { useHaptic } from '../hooks/useHaptic';

type Props = StackScreenProps<RootStackParamList, 'ManageQuickReplies'>;

export default function ManageQuickRepliesScreen({ navigation, route }: Props) {
  const { role } = route.params;
  const { show } = useToast();
  const haptic = useHaptic();

  const replies = useStore((s) => role === 'seller' ? s.sellerQuickReplies : s.buyerQuickReplies);
  const addReply = useStore((s) => role === 'seller' ? s.addSellerQuickReply : s.addBuyerQuickReply);
  const updateReply = useStore((s) => role === 'seller' ? s.updateSellerQuickReply : s.updateBuyerQuickReply);
  const removeReply = useStore((s) => role === 'seller' ? s.removeSellerQuickReply : s.removeBuyerQuickReply);

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [newText, setNewText] = useState('');

  const handleSaveEdit = () => {
    if (editingIndex === null) return;
    const trimmed = editingText.trim();
    if (!trimmed) return;
    updateReply(editingIndex, trimmed);
    setEditingIndex(null);
    setEditingText('');
    haptic.light();
    show('Quick reply updated', 'success');
  };

  const handleAdd = () => {
    const trimmed = newText.trim();
    if (!trimmed) return;
    addReply(trimmed);
    setNewText('');
    haptic.light();
    show('Quick reply added', 'success');
  };

  const handleDelete = (index: number) => {
    Alert.alert(
      'Delete quick reply?',
      'This reply will be removed from your list.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            removeReply(index);
            haptic.medium();
            show('Quick reply deleted', 'info');
          },
        },
      ]
    );
  };

  const title = role === 'seller' ? 'Seller quick replies' : 'Buyer quick replies';
  const subtitle = role === 'seller'
    ? 'Save time with reusable replies for buyer questions'
    : 'Save time with reusable messages for sellers';

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title={title}
          subtitle={subtitle}
          onBack={() => navigation.goBack()}
        />
      }
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your replies</Text>
        {replies.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="chatbubble-ellipses-outline" size={32} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No quick replies yet</Text>
            <Text style={styles.emptySubtext}>Add one below to speed up your conversations</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {replies.map((reply, index) => (
              <View key={index}>
                <View style={styles.replyRow}>
                  {editingIndex === index ? (
                    <View style={styles.editRow}>
                      <TextInput
                        style={styles.editInput}
                        value={editingText}
                        onChangeText={setEditingText}
                        multiline
                        autoFocus
                        maxLength={200}
                        accessibilityLabel="Edit quick reply"
                      />
                      <AnimatedPressable
                        onPress={handleSaveEdit}
                        scaleValue={0.9}
                        hapticFeedback="light"
                        accessibilityLabel="Save edit"
                        accessibilityRole="button"
                      >
                        <Ionicons name="checkmark-circle" size={28} color={Colors.brand} />
                      </AnimatedPressable>
                      <AnimatedPressable
                        onPress={() => { setEditingIndex(null); setEditingText(''); }}
                        scaleValue={0.9}
                        hapticFeedback="light"
                        accessibilityLabel="Cancel edit"
                        accessibilityRole="button"
                      >
                        <Ionicons name="close-circle" size={28} color={Colors.textMuted} />
                      </AnimatedPressable>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.replyText} numberOfLines={2}>{reply}</Text>
                      <AnimatedPressable
                        onPress={() => { setEditingIndex(index); setEditingText(reply); }}
                        scaleValue={0.9}
                        hapticFeedback="light"
                        accessibilityLabel={`Edit reply ${index + 1}`}
                        accessibilityRole="button"
                      >
                        <Ionicons name="create-outline" size={20} color={Colors.textSecondary} />
                      </AnimatedPressable>
                      <AnimatedPressable
                        onPress={() => handleDelete(index)}
                        scaleValue={0.9}
                        hapticFeedback="medium"
                        accessibilityLabel={`Delete reply ${index + 1}`}
                        accessibilityRole="button"
                      >
                        <Ionicons name="trash-outline" size={20} color={Colors.danger} />
                      </AnimatedPressable>
                    </>
                  )}
                </View>
                {index < replies.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Add new reply</Text>
        <View style={styles.addRow}>
          <TextInput
            style={styles.addInput}
            value={newText}
            onChangeText={setNewText}
            placeholder="Type a quick reply..."
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={200}
            accessibilityLabel="New quick reply text"
          />
          <AnimatedPressable
            onPress={handleAdd}
            scaleValue={0.9}
            hapticFeedback="medium"
            style={styles.addBtn}
            accessibilityLabel="Add quick reply"
            accessibilityRole="button"
          >
            <Ionicons name="add" size={22} color={Colors.textInverse} />
          </AnimatedPressable>
        </View>
      </View>
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  section: {
    marginHorizontal: Space.md,
    marginBottom: Space.lg,
  },
  sectionTitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    letterSpacing: Type.caption.letterSpacing,
    textTransform: 'uppercase',
    marginBottom: Space.sm,
  },
  list: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  replyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
    minHeight: 52,
    gap: Space.sm,
  },
  replyText: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
    lineHeight: Type.body.lineHeight,
  },
  editRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  editInput: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.sm,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs + 2,
    minHeight: 40,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginLeft: Space.md,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Space.xl,
    gap: Space.xs,
  },
  emptyText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  emptySubtext: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Space.sm,
  },
  addInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: Space.sm + 4,
    paddingVertical: Space.sm,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.textPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
