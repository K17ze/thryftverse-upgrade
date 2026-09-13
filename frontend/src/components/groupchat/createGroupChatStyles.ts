/**
 * createGroupChatStyles — styles factory for the Create Group Chat flow
 * (member-select stage + group-details stage). Extracted verbatim from
 * CreateGroupChatScreen so the screen stays a thin orchestrator.
 */

import { StyleSheet } from 'react-native';
import type { ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export function createGroupChatStyles(colors: ThemeColors) {
  return StyleSheet.create({
  /* ── Stage 1: Select ── */
  selectRoot: {
    flex: 1 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm },
  searchInputWrap: {
    flex: 1,
    borderWidth: 0,
    backgroundColor: 'transparent',
    minHeight: Control.hit,
    paddingHorizontal: 0 },
  searchInput: {
    fontSize: TypographyV2.body.size,
    color: colors.textPrimary,
    paddingVertical: 0 },
  selectedRail: {
    marginBottom: Space.sm },
  selectedRailContent: {
    gap: Space.sm,
    paddingHorizontal: Space.md },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.full,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs / 2 + 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border },
  selectedChipAvatar: {
    width: Space.smMd,
    height: Space.smMd,
    borderRadius: Radius.full },
  selectedChipAvatarPlaceholder: {
    width: Space.smMd,
    height: Space.smMd,
    borderRadius: Radius.full,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center' },
  selectedChipAvatarText: {
    fontSize: TypographyV2.meta.size - 1,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.textPrimary },
  selectedChipText: {
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.textPrimary },
  searchErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: colors.dangerSubtle,
    borderRadius: Radius.md,
    marginHorizontal: Space.md,
    marginBottom: Space.sm },
  searchErrorText: {
    flex: 1,
    color: colors.danger,
    fontSize: TypographyV2.meta.size },
  memberList: {
    paddingBottom: Space.xxl + 24 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    minHeight: Space.xl + Space.xl + 8 },
  memberRowPressed: {
    backgroundColor: colors.surfaceAlt },
  memberAvatar: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.full },
  memberAvatarPlaceholder: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center' },
  memberAvatarText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.screenTitle.fontFamily,
    color: colors.textPrimary },
  memberTextWrap: {
    flex: 1 },
  memberDisplayName: {
    fontSize: TypographyV2.body.size,
    color: colors.textPrimary },
  memberUsername: {
    fontSize: TypographyV2.meta.size,
    color: colors.textMuted },
  checkCircle: {
    width: Space.lg + 4,
    height: Space.lg + 4,
    justifyContent: 'center',
    alignItems: 'center' },
  checkCircleActive: {
    backgroundColor: colors.brand,
    borderRadius: Radius.full },
  listWrap: {
    flex: 1,
    paddingHorizontal: Space.md },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
    paddingVertical: Space.sm + 2 },
  skeletonAvatar: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt },
  skeletonTextWrap: {
    flex: 1,
    gap: Space.xs + 2 },
  skeletonLine: {
    height: Space.xs + 4,
    borderRadius: Radius.sm,
    backgroundColor: colors.surfaceAlt },
  skeletonLineShort: {
    width: '40%' },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.xl },
  emptyText: {
    textAlign: 'center',
    paddingHorizontal: Space.lg },
  recentsScroll: {
    flex: 1 },
  recentsContent: {
    paddingBottom: Space.xxl + 24 },
  sectionBlock: {
    marginBottom: Space.lg },
  sectionHeaderText: {
    fontSize: TypographyV2.meta.size,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.textMuted,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xs,
    textTransform: 'uppercase' },

  /* ── Stage 2: Details ── */
  detailsRoot: {
    flex: 1 },
  detailsScroll: {
    flex: 1 },
  detailsContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg },
  avatarSelectorWrap: {
    alignItems: 'center',
    gap: Space.xs,
    marginBottom: Space.lg },
  // Cover photo
  coverSelector: {
    width: '100%',
    height: 140,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginBottom: Space.md,
    position: 'relative' },
  coverImage: {
    width: '100%',
    height: '100%' },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs },
  coverPlaceholderText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  coverUploadingOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center' },
  avatarSelectorPressable: {
    position: 'relative',
    borderRadius: Radius.full },
  avatarSelectorPressed: {
    opacity: 0.7 },
  cameraBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: Space.lg + 4,
    height: Space.lg + 4,
    borderRadius: Radius.full,
    backgroundColor: colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.surface },
  avatarUploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: Radius.full,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center' },
  avatarHint: {
    fontSize: TypographyV2.meta.size },
  removeText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    marginTop: Space.xs / 2 },
  mediaErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.xs,
    paddingHorizontal: Space.sm },
  mediaErrorText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight },
  coverRemoveBtn: {
    position: 'absolute',
    top: Space.xs,
    right: Space.xs,
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  fieldGroup: {
    marginBottom: Space.lg },
  fieldLabel: {
    fontSize: TypographyV2.bodyStrong.size,
    color: colors.textPrimary,
    marginBottom: Space.xs + 2 },
  fieldInputWrap: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: Radius.md,
    minHeight: Space.xxl,
    paddingHorizontal: Space.sm + 2 },
  fieldInput: {
    fontSize: TypographyV2.body.size,
    color: colors.textPrimary },
  fieldInputWrapMultiline: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: Radius.md,
    minHeight: Space.xxl + Space.xl,
    paddingHorizontal: Space.sm + 2 },
  fieldInputMultiline: {
    fontSize: TypographyV2.body.size,
    color: colors.textPrimary },
  charCount: {
    textAlign: 'right',
    marginTop: Space.xs / 2,
    fontSize: TypographyV2.meta.size,
    color: colors.textMuted },
  participantSection: {
    marginTop: Space.sm },
  participantHeader: {
    marginBottom: Space.sm },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
    paddingVertical: Space.sm },
  participantAvatar: {
    width: Space.xl + Space.xs,
    height: Space.xl + Space.xs,
    borderRadius: Radius.full },
  participantAvatarPlaceholder: {
    width: Space.xl + Space.xs,
    height: Space.xl + Space.xs,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center' },
  participantAvatarText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.screenTitle.fontFamily,
    color: colors.textPrimary },
  participantTextWrap: {
    flex: 1 },
  participantName: {
    fontSize: TypographyV2.body.size,
    color: colors.textPrimary },
  participantHandle: {
    fontSize: TypographyV2.meta.size,
    color: colors.textMuted },

  /* ── Shared ── */
  createErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: colors.dangerSubtle,
    borderRadius: Radius.md,
    marginHorizontal: Space.md,
    marginBottom: Space.sm },
  createErrorText: {
    flex: 1,
    color: colors.danger,
    fontSize: TypographyV2.meta.size },
  retryText: {
    color: colors.brand,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  stickyAction: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm },
  createBtn: {
    height: Space.xxl + 2,
    borderRadius: Radius.lg },
  createBtnDisabled: {
    opacity: 0.5 } });
}

export type GroupChatStyles = ReturnType<typeof createGroupChatStyles>;
