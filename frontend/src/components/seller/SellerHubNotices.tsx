/**
 * SellerHubNotices — the ambient status rows pinned above the work zone:
 *   1. Import banner — partial-state notice when the catalog-import batch
 *      fetch failed inside an otherwise healthy overview load.
 *   2. Away row — quiet hairline row rendered only while the holiday-mode
 *      pause is effective; the dispatch chip in the trust strip is
 *      suppressed while this shows.
 *
 * Both render nothing when their condition is false — the host composes
 * them unconditionally.
 */

import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { formatShortDate } from '../../utils/dateFormat';
import { createSellerHubScreenStyles } from './sellerHubScreenStyles';
import type { SellerHubAway } from '../../services/sellerHubApi';

export interface SellerHubNoticesProps {
  /** True when fetchImportBatches failed during the last load. */
  importError: boolean;
  /** Server-evaluated away state; null/absent renders no row. */
  away: SellerHubAway | null | undefined;
  /** Orders still due while away — appended to the away row when > 0. */
  pendingOrdersCount: number;
}

export const SellerHubNotices: React.FC<SellerHubNoticesProps> = ({
  importError,
  away,
  pendingOrdersCount,
}) => {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createSellerHubScreenStyles(colors), [colors]);

  if (!importError && !away?.active) return null;

  return (
    <>
      {importError && (
        <View style={styles.importErrorBanner}>
          <AppIcon concept="warning" size={IconSize.xs} color="warningText" opticalCenter accessible={false} />
          <Text style={[styles.importErrorText, { color: colors.textSecondary }]}>
            Couldn't load import status. Pull to retry.
          </Text>
        </View>
      )}

      {away?.active ? (
        <View style={styles.awayRow}>
          <AppIcon concept="moon" size={IconSize.xs} color="textSecondary" opticalCenter accessible={false} />
          <Text style={styles.awayText}>
            {away.until ? `Away until ${formatShortDate(away.until)}` : 'Away'}
            {' · new orders paused'}
            {pendingOrdersCount > 0
              ? ` · ${pendingOrdersCount} order${pendingOrdersCount === 1 ? '' : 's'} still due`
              : ''}
          </Text>
        </View>
      ) : null}
    </>
  );
};
