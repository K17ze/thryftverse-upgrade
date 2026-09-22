import React from 'react';
import { View } from 'react-native';

import { FlagshipNavigationRow } from '../flagship';
import { useGalleriaStyles } from '../../hooks/galleria';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import type { GalleriaEditorial } from '../../services/galleriaApi';
import { GalleriaEditorialListItem } from './GalleriaEditorialListItem';
import { GalleriaSectionHeader } from './GalleriaSectionHeader';
import { GalleriaEditorialSkeleton } from './GalleriaSkeletons';
import { MASONRY_GAP, MASONRY_PADDING } from './galleriaLayout';

// ---------------------------------------------------------------------------
// List footer — editorial list + Creative Tools (Poster Studio CTA)
// ---------------------------------------------------------------------------
export function GalleriaListFooter({
  loading,
  remainingEditorials,
  onPosterStudioPress,
  onEditorialPress }: {
  loading: boolean;
  remainingEditorials: GalleriaEditorial[];
  onPosterStudioPress: () => void;
  /** Opens the piece's article screen (S21-02). Optional — rows stay
   *  non-interactive when no reader destination is wired. */
  onEditorialPress?: (editorial: GalleriaEditorial) => void;
}) {
  const styles = useGalleriaStyles();
  const { t } = useAppTranslation('galleria');

  return (
    <View style={{ marginHorizontal: -(MASONRY_PADDING - MASONRY_GAP / 2) }}>
      {/* ── Section 4: Editorial list ── */}
      {loading ? (
        <>
          <GalleriaSectionHeader eyebrow={t('editorialList.eyebrow')} title={t('editorialList.title')} />
          <GalleriaEditorialSkeleton />
          <GalleriaEditorialSkeleton />
        </>
      ) : remainingEditorials.length > 0 ? (
        <>
          <GalleriaSectionHeader eyebrow={t('editorialList.eyebrow')} title={t('editorialList.title')} />
          {remainingEditorials.map((ed, idx) => (
            <GalleriaEditorialListItem
              key={ed.id}
              editorial={ed}
              isLast={idx === remainingEditorials.length - 1}
              size={idx === 0 ? 'large' : 'standard'}
              onPress={onEditorialPress ? () => onEditorialPress(ed) : undefined}
            />
          ))}
        </>
      ) : null}

      {/* ── Section 5: Creative Tools — Poster Studio CTA ── */}
      <View style={styles.stylingToolsWrap}>
        <GalleriaSectionHeader eyebrow={t('creativeTools.eyebrow')} title={t('creativeTools.title')} />
        <FlagshipNavigationRow
          icon="edit"
          title={t('creativeTools.posterStudio')}
          subtitle={t('creativeTools.posterStudioSub')}
          onPress={onPosterStudioPress}
          separator={false}
          accessibilityLabel={t('accessibility.openPosterStudio')}
          accessibilityHint={t('accessibility.posterStudioHint')}
        />
      </View>
    </View>
  );
}
