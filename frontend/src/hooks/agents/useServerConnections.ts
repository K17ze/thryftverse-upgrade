import React from 'react';
import { useStore } from '../../store/useStore';
import type { ProviderConnectionInfo } from '../../services/botsApi';
import { useHaptic } from '../useHaptic';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import type { StudioToast } from './types';

/**
 * Server-side provider connections ("Connections" tab): the inline connect
 * form, reverify / remove flows, and the screen toast that reports their
 * outcomes. State lives here (not in the section component) so it survives
 * tab switches exactly as it did when hoisted in the screen.
 */
export function useServerConnections({
  openConnectionsTab }: {
  openConnectionsTab: () => void;
}) {
  const haptic = useHaptic();
  const { t } = useAppTranslation('aiAgent');

  const createProviderConnection = useStore((s) => s.createProviderConnection);
  const deleteProviderConnection = useStore((s) => s.deleteProviderConnection);
  const reverifyProviderConnection = useStore((s) => s.reverifyProviderConnection);

  const [showConnectForm, setShowConnectForm] = React.useState(false);
  const [connectProvider, setConnectProvider] = React.useState<'openai' | 'anthropic' | 'gemini' | 'custom'>('openai');
  const [connectKey, setConnectKey] = React.useState('');
  const [connectLabel, setConnectLabel] = React.useState('');
  const [connectBaseUrl, setConnectBaseUrl] = React.useState('');
  const [creatingConnection, setCreatingConnection] = React.useState(false);
  const [reverifyingId, setReverifyingId] = React.useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = React.useState<{ connection: ProviderConnectionInfo; affectedAgents: string[] } | null>(null);
  const [removingId, setRemovingId] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<StudioToast>(null);

  const showToast = React.useCallback((kind: 'success' | 'error', message: string) => {
    setToast({ kind, message });
  }, []);

  // Auto-dismiss toast after a few seconds.
  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const openConnectForm = () => {
    openConnectionsTab();
    haptic.light();
    setShowConnectForm(true);
    setConnectProvider('openai');
    setConnectKey('');
    setConnectLabel('');
    setConnectBaseUrl('');
  };

  const cancelConnectForm = () => {
    haptic.light();
    setShowConnectForm(false);
    setConnectKey('');
    setConnectLabel('');
    setConnectBaseUrl('');
  };

  const handleCreateConnection = async () => {
    if (connectKey.trim().length === 0) return;
    // Custom connections target an OpenAI-compatible endpoint — the backend
    // verifies the key against `${baseUrl}/models`, so a base URL is required.
    if (connectProvider === 'custom' && connectBaseUrl.trim().length === 0) {
      showToast('error', 'A base URL is required for custom endpoints.');
      return;
    }
    haptic.light();
    setCreatingConnection(true);
    try {
      await createProviderConnection({
        provider: connectProvider,
        apiKey: connectKey.trim(),
        label: connectLabel.trim() || undefined,
        baseUrl: connectBaseUrl.trim() || undefined });
      setShowConnectForm(false);
      setConnectKey('');
      setConnectLabel('');
      setConnectBaseUrl('');
      showToast('success', t('toast.connectionSaved'));
      haptic.selection();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('toast.verifyFailed');
      showToast('error', message);
      haptic.medium();
    } finally {
      setCreatingConnection(false);
    }
  };

  const handleReverify = async (connectionId: string) => {
    haptic.light();
    setReverifyingId(connectionId);
    try {
      await reverifyProviderConnection(connectionId);
      showToast('success', t('toast.reverified'));
      haptic.selection();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('toast.reverifyFailed');
      showToast('error', message);
      haptic.medium();
    } finally {
      setReverifyingId(null);
    }
  };

  const handleRequestRemove = async (connection: ProviderConnectionInfo) => {
    haptic.light();
    // Optimistically fetch affected agents via the delete call, but we want to
    // confirm first. The backend returns affectedAgents on delete, so we
    // perform a two-step: show a confirmation, then delete on confirm.
    // Since we can't know affected agents without deleting, we show a generic
    // confirmation and surface the affected agents count after deletion.
    setConfirmRemove({ connection, affectedAgents: [] });
  };

  const handleConfirmRemove = async () => {
    if (!confirmRemove) return;
    const { connection } = confirmRemove;
    haptic.medium();
    setRemovingId(connection.id);
    try {
      const affectedAgents = await deleteProviderConnection(connection.id);
      setConfirmRemove(null);
      if (affectedAgents.length > 0) {
        showToast('success', t('toast.removedWithAgents', { count: affectedAgents.length }));
      } else {
        showToast('success', t('toast.connectionRemoved'));
      }
      haptic.selection();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('toast.removeFailed');
      showToast('error', message);
      haptic.medium();
    } finally {
      setRemovingId(null);
    }
  };

  const cancelConfirmRemove = () => {
    haptic.light();
    setConfirmRemove(null);
  };

  return {
    showConnectForm,
    connectProvider,
    setConnectProvider,
    connectKey,
    setConnectKey,
    connectLabel,
    setConnectLabel,
    connectBaseUrl,
    setConnectBaseUrl,
    creatingConnection,
    reverifyingId,
    confirmRemove,
    removingId,
    toast,
    openConnectForm,
    cancelConnectForm,
    handleCreateConnection,
    handleReverify,
    handleRequestRemove,
    handleConfirmRemove,
    cancelConfirmRemove };
}
