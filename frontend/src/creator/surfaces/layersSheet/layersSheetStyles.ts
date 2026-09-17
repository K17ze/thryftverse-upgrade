/**
 * layersSheetStyles — StyleSheet for the CreatorLayersSheet surface.
 * Extracted verbatim from CreatorLayersSheet.tsx; consumed by the sheet
 * orchestrator and the extracted components under layersSheet/.
 */
import { StyleSheet } from 'react-native';
import { Space, Radius, Typography, Control, Stroke, Elevation } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { THUMB, ROW_HEIGHT } from './layersSheetShared';

export const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.sectionTitle.size },
  closeBtn: {
    width: Control.hit,
    height: Control.hit,
    justifyContent: 'center',
    alignItems: 'center' },
  doneBtn: {
    width: Control.hit,
    height: Control.hit,
    justifyContent: 'center',
    alignItems: 'center' },
  doneBtnText: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.bodyStrong.size },
  reorderHint: {
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    textAlign: 'center',
    paddingVertical: Space.xs,
    marginBottom: Space.sm },
  scrollBody: {
    paddingHorizontal: Space.md },
  scrollContent: {
    paddingBottom: Space.lg },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Space.xl },
  emptyText: {
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.bodyStrong.size },
  layerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.smMd,
    borderBottomWidth: Stroke.hairline,
    minHeight: ROW_HEIGHT },
  layerRowDragging: {
    opacity: 0.7,
    ...Elevation.modal },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: Control.hit },
  thumbnail: {
    width: THUMB,
    height: THUMB,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden' },
  thumbnailHidden: {
    opacity: 0.5 },
  thumbnailImage: {
    width: '100%',
    height: '100%' },
  videoBadge: {
    position: 'absolute',
    bottom: Space.xxs,
    right: Space.xxs,
    width: 14,
    height: 14,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center' },
  lockBadge: {
    position: 'absolute',
    top: Space.xxs,
    right: Space.xxs,
    width: 14,
    height: 14,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center' },
  layerName: {
    flex: 1,
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.body.size },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xxs },
  actionBtn: {
    width: Control.hit,
    height: Control.hit,
    justifyContent: 'center',
    alignItems: 'center' },
  actionBtnLarge: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.md } });
