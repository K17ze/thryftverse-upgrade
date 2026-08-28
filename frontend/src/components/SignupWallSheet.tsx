import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from './BottomSheet';
import { AnimatedPressable } from './AnimatedPressable';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, FontFamily } from '../theme/designTokens';
import type { SignupAction } from '../hooks/useSignupWall';

/**
 * Action-specific copy for the soft signup wall. Each entry pairs a short
 * title (the action the user attempted) with a single-sentence value
 * proposition — never a hard sell. The icon is a quiet visual anchor, not
 * decoration.
 */
const ACTION_COPY: Record<
  SignupAction,
  { title: string; body: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  save_item: {
    title: 'Save items',
    body: 'Create a free account to save items to your closet and revisit them anytime.',
    icon: 'bookmark-outline',
  },
  follow_seller: {
    title: 'Follow sellers',
    body: 'Sign up to follow your favourite sellers and see their new listings first.',
    icon: 'person-add-outline',
  },
  message_seller: {
    title: 'Message sellers',
    body: 'Sign up to ask sellers questions and negotiate offers.',
    icon: 'chatbubble-outline',
  },
  place_bid: {
    title: 'Place bids',
    body: 'Sign up to bid on auctions and win the items you love.',
    icon: 'trending-up-outline',
  },
  purchase: {
    title: 'Buy items',
    body: 'Sign up to purchase items securely with buyer protection on every order.',
    icon: 'cart-outline',
  },
  create_listing: {
    title: 'List items',
    body: 'Sign up to sell your own items and reach thousands of buyers.',
    icon: 'pricetag-outline',
  },
};

interface SignupWallSheetProps {
  visible: boolean;
  action: SignupAction | null;
  onDismiss: () => void;
  onSignUp: () => void;
}

/**
 * Soft signup wall — a bottom sheet that slides up when a guest user
 * attempts an account-bound action (save, follow, message, bid, buy,
 * create listing).
 *
 * Design principles (AGENTS.md §4):
 * - "Maybe later" is equally prominent to "Sign up" — never a tiny link.
 * - One sentence of value proposition, not a marketing paragraph.
 * - Uses the existing BottomSheet engine (spring entrance, reduced-motion
 *   aware, swipe-to-dismiss).
 * - No new colors or typography — existing design tokens only.
 */
export function SignupWallSheet({
  visible,
  action,
  onDismiss,
  onSignUp,
}: SignupWallSheetProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const copy = action ? ACTION_COPY[action] : null;

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      snapPoint={0.44}
      variant="system"
    >
      {copy ? (
        <View style={styles.content}>
          <Ionicons
            name={copy.icon}
            size={28}
            color={colors.brand}
            style={styles.icon}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />

          <Text style={styles.title} maxFontSizeMultiplier={1.2}>
            {copy.title}
          </Text>

          <Text style={styles.body} maxFontSizeMultiplier={1.3}>
            {copy.body}
          </Text>

          <AnimatedPressable
            style={styles.signUpBtn}
            activeOpacity={0.9}
            onPress={onSignUp}
            accessibilityRole="button"
            accessibilityLabel="Sign up"
            accessibilityHint="Opens the sign-up screen"
          >
            <Text style={styles.signUpText} maxFontSizeMultiplier={1.2}>
              Sign up
            </Text>
          </AnimatedPressable>

          <AnimatedPressable
            style={styles.laterBtn}
            activeOpacity={0.8}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Maybe later"
            accessibilityHint="Dismisses this prompt and continues browsing"
          >
            <Text style={styles.laterText} maxFontSizeMultiplier={1.3}>
              Maybe later
            </Text>
          </AnimatedPressable>
        </View>
      ) : null}
    </BottomSheet>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    content: {
      alignItems: 'center',
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.lg,
    },
    icon: {
      marginBottom: Space.md,
    },
    title: {
      fontSize: Type.title.size,
      lineHeight: Type.title.lineHeight,
      fontFamily: FontFamily.bold,
      letterSpacing: Type.title.letterSpacing,
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: Space.sm,
    },
    body: {
      fontSize: Type.body.size,
      lineHeight: Type.body.size + 6,
      fontFamily: FontFamily.regular,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: Space.lg,
    },
    signUpBtn: {
      backgroundColor: colors.brand,
      height: 52,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      marginBottom: Space.sm,
    },
    signUpText: {
      color: colors.textInverse,
      fontSize: Type.body.size,
      fontFamily: FontFamily.bold,
      letterSpacing: 0.2,
    },
    laterBtn: {
      height: 48,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
    },
    laterText: {
      color: colors.textSecondary,
      fontSize: Type.body.size,
      fontFamily: FontFamily.medium,
      letterSpacing: 0.1,
    },
  });
