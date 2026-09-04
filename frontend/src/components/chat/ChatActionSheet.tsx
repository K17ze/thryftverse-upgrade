import React, { useMemo } from "react";

import { TypographyV2 } from '../../theme/typography.v2';import { View, Text, StyleSheet, Modal, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Space, Radius, Elevation } from "../../theme/designTokens";
import { useAppTheme } from "../../theme/ThemeContext";
import { AnimatedPressable } from "../AnimatedPressable";
import { useAppTranslation } from '../../i18n/useAppTranslation';

export type ChatAction = "gallery" | "camera" | "document" | "location" | "agent" | "offer" | "share_listing";

interface ChatActionSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (action: ChatAction) => void;
  hasLinkedListing?: boolean;
  isSeller?: boolean;
  hideDocument?: boolean;
}

interface ActionDef {
  id: ChatAction;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  description: string;
  disabled?: boolean;
  disabledReason?: string;
}

export function ChatActionSheet({
  visible,
  onClose,
  onSelect,
  hasLinkedListing = false,
  isSeller = false,
  hideDocument = false,
}: ChatActionSheetProps) {
  const { colors } = useAppTheme();
  const { t } = useAppTranslation('messaging');
  const actions = useMemo<ActionDef[]>(
    () => [
      {
        id: "gallery",
        icon: "images-outline",
        label: t('attachments.photoAndVideo'),
        description: t('attachments.chooseFromLibrary') },
      {
        id: "camera",
        icon: "camera-outline",
        label: t('attachments.camera'),
        description: t('attachments.takePhotoOrVideo') },
      ...(hideDocument
        ? []
        : [
            {
              id: "document" as ChatAction,
              icon: "document-attach-outline" as const,
              label: "File",
              description: "Send PDF, ZIP, or other file" },
          ]),
      ...(hasLinkedListing && !isSeller
        ? [
            {
              id: "offer" as ChatAction,
              icon: "pricetag-outline" as const,
              label: "Make an offer",
              description: "Propose a price to the seller",
            },
          ]
        : []),
      ...(hasLinkedListing
        ? [
            {
              id: "share_listing" as ChatAction,
              icon: "bag-handle-outline" as const,
              label: "Share listing",
              description: "Send product card into conversation",
            },
          ]
        : []),
      {
        id: "agent",
        icon: 'bulb-outline',
        label: t('agentPicker.addAssistant'),
        description: t('agentPicker.addAssistantDescription') },
    ],
    [t, hasLinkedListing, isSeller, hideDocument],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[styles.sheet, { backgroundColor: colors.surface, shadowColor: colors.shadow }]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{t('attachments.actionSheetTitle')}</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              {t('attachments.actionSheetSubtitle')}
            </Text>
          </View>

          <View style={styles.list}>
            {actions.map((action) => (
              <AnimatedPressable
                key={action.id}
                style={[styles.row, { backgroundColor: colors.surfaceAlt }, action.disabled && styles.rowDisabled]}
                onPress={() => {
                  if (action.disabled) return;
                  onSelect(action.id);
                  onClose();
                }}
                activeOpacity={0.7}
                scaleValue={action.disabled ? 1 : 0.98}
                hapticFeedback={action.disabled ? undefined : "light"}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                accessibilityHint={action.description}
                accessibilityState={action.disabled ? { disabled: true } : undefined}
                disabled={action.disabled}
              >
                <Ionicons
                  name={action.icon}
                  size={22}
                  color={action.disabled ? colors.textMuted : colors.brand}
                />
                <View style={styles.rowText}>
                  <Text
                    style={[
                      styles.rowLabel,
                      { color: colors.textPrimary },
                      action.disabled && { color: colors.textMuted },
                    ]}
                  >
                    {action.label}
                  </Text>
                  <Text style={[styles.rowDescription, { color: colors.textMuted }]}>
                    {action.description}
                  </Text>
                </View>
                {action.disabled ? (
                  <View style={[styles.disabledBadge, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                    <Text style={[styles.disabledBadgeText, { color: colors.textMuted }]}>
                      {action.disabledReason}
                    </Text>
                  </View>
                ) : (
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.textMuted}
                  />
                )}
              </AnimatedPressable>
            ))}
          </View>

          <Pressable
            style={[styles.cancelBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
          >
            <Text style={[styles.cancelText, { color: colors.textPrimary }]}>
              {t('common.cancel')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xxl,
    gap: Space.md,
    ...Elevation.floating },
  handle: {
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    alignSelf: "center",
    marginBottom: Space.sm },
  header: {
    marginBottom: Space.xs },
  title: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing },
  subtitle: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    marginTop: 2 },
  list: {
    gap: Space.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.smMd,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.sm + 2,
    borderRadius: Radius.lg },
  rowDisabled: {
    opacity: 0.6 },
  rowText: {
    flex: 1,
    gap: 2 },
  rowLabel: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily },
  rowDescription: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily },
  disabledBadge: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth },
  disabledBadgeText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  cancelBtn: {
    borderRadius: Radius.lg,
    paddingVertical: Space.md + 2,
    alignItems: "center",
    marginTop: Space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
    justifyContent: "center" },
  cancelText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily } });
