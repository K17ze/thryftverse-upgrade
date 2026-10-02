'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { type ConfirmSheetState } from '@/components/orders/ConfirmSheet';
import { parseApiError } from '@/lib/api/http';
import type { AgentStudioConnection } from '@/lib/api/services/agentStudio';
import { useStudioConnectionActions } from '../studio-queries';

export const PROVIDER_LABEL: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  google: 'Google',
  custom: 'Custom endpoint',
};

export function providerLabel(provider: string): string {
  return (
    PROVIDER_LABEL[provider] ??
    PROVIDER_LABEL[provider.toLowerCase()] ??
    provider.charAt(0).toUpperCase() + provider.slice(1)
  );
}

export function useStudioConnectionsWorkflow() {
  const { show } = useToast();
  const { connect, reverify, remove } = useStudioConnectionActions();

  const [showForm, setShowForm] = useState(false);
  const [provider, setProvider] = useState<'openai' | 'custom'>('openai');
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [reverifyingId, setReverifyingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSheetState | null>(null);

  const openForm = () => {
    setShowForm(true);
    setProvider('openai');
    setKey('');
    setLabel('');
    setBaseUrl('');
  };

  const closeForm = () => {
    setShowForm(false);
  };

  const handleConnect = async () => {
    const trimmedKey = key.trim();
    if (!trimmedKey) return;
    if (provider === 'custom' && !baseUrl.trim()) {
      show('A base URL is required for custom endpoints.', 'error');
      return;
    }
    setCreating(true);
    try {
      await connect({
        provider,
        apiKey: trimmedKey,
        ...(label.trim() ? { label: label.trim() } : {}),
        ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
      });
      setShowForm(false);
      show('Connection verified and saved.', 'success');
    } catch (err) {
      show(
        parseApiError(
          err,
          'Could not verify the key. Check the key and try again.',
        ).message,
        'error',
      );
    } finally {
      setCreating(false);
    }
  };

  const handleReverify = async (connectionId: string) => {
    setReverifyingId(connectionId);
    try {
      await reverify(connectionId);
      show('Connection re-verified.', 'success');
    } catch (err) {
      show(parseApiError(err, 'Re-verification failed.').message, 'error');
    } finally {
      setReverifyingId(null);
    }
  };

  const handleConfirmRemove = async (connectionId: string) => {
    setRemovingId(connectionId);
    try {
      const affected = await remove(connectionId);
      setConfirm(null);
      show(
        affected.length > 0
          ? `Removed. ${affected.length} ${
              affected.length === 1 ? 'agent' : 'agents'
            } updated.`
          : 'Connection removed.',
        'success',
      );
    } catch (err) {
      show(parseApiError(err, 'Could not remove connection.').message, 'error');
    } finally {
      setRemovingId(null);
    }
  };

  const requestRemove = (conn: AgentStudioConnection) => {
    const name = providerLabel(conn.provider);
    setConfirm({
      title: `Remove ${conn.label ? `${name} — ${conn.label}` : name}?`,
      message:
        'Agents using this connection will no longer be able to run until you connect a replacement.',
      confirmLabel: 'Remove',
      variant: 'destructive',
      onConfirm: () => void handleConfirmRemove(conn.id),
    });
  };

  return {
    showForm,
    openForm,
    closeForm,
    provider,
    setProvider,
    key,
    setKey,
    label,
    setLabel,
    baseUrl,
    setBaseUrl,
    creating,
    reverifyingId,
    removingId,
    confirm,
    setConfirm,
    handleConnect,
    handleReverify,
    requestRemove,
  };
}
