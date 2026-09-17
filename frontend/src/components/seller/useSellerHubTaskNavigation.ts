/**
 * useSellerHubTaskNavigation — dispatches Seller Hub task taps to typed
 * root-stack routes.
 *
 * Guards unknown actionRoutes (warn + no-op rather than a navigation
 * crash), and resolves the CatalogImportProgress batchId — a required
 * param — preferring the backend-emitted id, then the freshest
 * non-terminal batch the client already loaded. With no known active
 * batch there is nothing truthful to open; pull-to-refresh recovers
 * the batch list.
 */

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ROOT_STACK_ROUTES, type RootStackParamList, type RootStackRouteName } from '../../navigation/types';
import type { SellerHubTask } from '../../services/sellerHubApi';
import type { BatchSummaryDTO } from '../../services/catalogImportApi';

type NavT = NativeStackNavigationProp<RootStackParamList>;

export function useSellerHubTaskNavigation(importBatches: BatchSummaryDTO[]) {
  const navigation = useNavigation<NavT>();

  const handleNavigateToTask = (task: SellerHubTask) => {
    const route = task.actionRoute as string;
    if (!ROOT_STACK_ROUTES.includes(route as RootStackRouteName)) {
      console.warn(`[SellerHub] Unknown task route: ${route}`);
      return;
    }
    const typedRoute = route as RootStackRouteName;
    if (typedRoute === 'CatalogImportProgress') {
      // Prefer the backend-emitted batchId (the oldest open batch); fall
      // back to the freshest non-terminal batch the client already loaded.
      const paramBatchId =
        typeof task.actionParams?.batchId === 'string' ? task.actionParams.batchId : null;
      const batchId =
        paramBatchId ??
        importBatches.find((b) => b.status !== 'completed' && b.status !== 'cancelled')?.id ??
        null;
      if (!batchId) {
        // batchId is a required param; without a known active batch there is
        // nothing truthful to open. Pull-to-refresh recovers the batch list.
        return;
      }
      navigation.navigate(typedRoute, { batchId });
      return;
    }
    (navigation.navigate as (screen: RootStackRouteName, params?: Record<string, unknown>) => void)(
      typedRoute,
      task.actionParams,
    );
  };

  return handleNavigateToTask;
}
