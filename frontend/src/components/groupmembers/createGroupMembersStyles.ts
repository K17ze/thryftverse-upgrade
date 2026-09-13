/**
 * createGroupMembersStyles — themed styles factory for the group members
 * screen (member list, role badges, inline add-members flow, action sheet).
 * Extracted verbatim from GroupMembersScreen so the screen stays a thin
 * orchestrator.
 */

import { StyleSheet } from 'react-native';
import type { ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export function createGroupMembersStyles(colors: ThemeColors) {
  return StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center' },
  content: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xxl,
    gap: Space.md },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.smMd,
    paddingVertical: Space.sm,
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: Space.sm },
  roleBadge: {
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs - 2,
    borderRadius: Radius.sm },
  roleBadgeText: {
    fontSize: TypographyV2.meta.size - 1,
    fontFamily: TypographyV2.meta.fontFamily },
  memberList: {
    gap: 0 },
  memberRowV2: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    gap: Space.smMd },
  memberRowContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.smMd },
  memberAvatarV2: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden' },
  memberAvatarImg: {
    width: '100%',
    height: '100%' },
  memberAvatarTextV2: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },
  memberTextV2: {
    flex: 1,
    justifyContent: 'center' },
  nameRowV2: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm },
  memberDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: Space.md + 44 + Space.smMd,
    marginRight: Space.md },
  emptyWrapV2: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xl,
    gap: Space.sm },
  emptyTextV2: {
    textAlign: 'center' },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.smMd,
    paddingHorizontal: Space.md,
    minHeight: Control.hit },
  addAvatar: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center' },
  addMembersSection: {
    gap: Space.sm },
  addMembersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm },
  addSearchRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.smMd,
    paddingVertical: Space.sm,
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border },
  cancelText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.brand },
  searchingRow: {
    paddingVertical: Space.sm,
    alignItems: 'center' },
  searchStatusText: {
    paddingVertical: Space.sm,
    textAlign: 'center' },
  searchResultList: {
    gap: 0 },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    gap: Space.smMd,
    minHeight: Control.hit },
  rowPressed: {
    opacity: 0.6 },
  selectCircle: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center' },
  addConfirmBtn: {
    backgroundColor: colors.brand,
    borderRadius: Radius.lg,
    paddingVertical: Space.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: Control.hit,
    marginTop: Space.xs },
  addConfirmText: {
    color: colors.surface,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  actionBtn: {
    minWidth: Control.hit,
    minHeight: Control.hit,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.sm },
  actionPressed: {
    opacity: 0.5 },
  removeText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.danger },
  leaveText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.danger },
  memberActionSheet: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm },
  memberActionTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    color: colors.textPrimary,
    paddingVertical: Space.smMd },
  memberActionRow: {
    minHeight: Control.hit,
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border },
  memberActionRowPressed: {
    opacity: 0.58 },
  memberActionLabel: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },
  memberActionLabelDanger: {
    color: colors.danger } });
}

export type GroupMembersStyles = ReturnType<typeof createGroupMembersStyles>;
