import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { FlagshipState } from '../flagship';
import { useHaptic } from '../../hooks/useHaptic';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import type { ProviderConnectionInfo } from '../../services/botsApi';
import type { useServerConnections } from '../../hooks/agents/useServerConnections';
import { PrimaryButton, SecondaryButton } from './AgentStudioButtons';
import type { AgentStudioStyles } from './agentStudioStyles';

type ServerConnectionsController = ReturnType<typeof useServerConnections>;

/**
 * "Connections" tab — verified server-side keys that power agent execution.
 * Includes the inline connect form (OpenAI / custom OpenAI-compatible
 * endpoints; Anthropic and Gemini remain planned), the connection list,
 * the remove confirmation, and the outcome toast.
 */
export function AgentStudioConnectionsSection({
  loading,
  connections,
  controller,
  styles }: {
  loading: boolean;
  connections: ProviderConnectionInfo[];
  controller: ServerConnectionsController;
  styles: AgentStudioStyles;
}) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { t } = useAppTranslation('aiAgent');
  const {
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
    cancelConfirmRemove } = controller;

  return (
    <>
      <View style={styles.sectionLabelWrap}>
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{t('sections.serverConnections')}</Text>
      </View>
      <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
        {t('serverConnections.hint')}
      </Text>

      {/* Connect server-side action row */}
      {!showConnectForm ? (
        <Pressable
          style={({ pressed }) => [styles.flatRow, { opacity: pressed ? 0.6 : 1 }]}
          onPress={openConnectForm}
          accessibilityRole="button"
          accessibilityLabel="Connect a provider server-side"
        >
          <AppIcon name="desktop" size={IconSize.md} color="brand" opticalCenter accessible={false} />
          <View style={styles.flatRowText}>
            <Text style={[styles.flatRowTitle, { color: colors.textPrimary }]}>
              {t('serverConnections.connectServerSide')}
            </Text>
            <Text style={[styles.flatRowSubtitle, { color: colors.textSecondary }]} numberOfLines={2}>
              {t('serverConnections.connectServerSideSub')}
            </Text>
          </View>
          <AppIcon name="forward" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
        </Pressable>
      ) : null}

      {/* Inline connect form */}
      {showConnectForm ? (
        <View style={styles.connectFormBody}>
          {/* Provider selector — OpenAI and custom OpenAI-compatible
              endpoints are verified server-side. Anthropic and Gemini are
              shown as planned: the server verification contract only
              supports Bearer-keyed /models probes today. */}
          <View style={styles.providerSelectorWrap}>
            {(['openai', 'custom'] as const).map((p) => {
              const isAvailable = p === 'openai' || p === 'custom';
              const isSelected = connectProvider === p && isAvailable;
              const label = p === 'openai' ? 'OpenAI' : 'Custom';
              return (
                <Pressable
                  key={p}
                  style={({ pressed }) => [
                    styles.providerChip,
                    {
                      borderColor: isSelected ? colors.brand : colors.border,
                      backgroundColor: isSelected ? colors.brandSubtle : colors.surface,
                      opacity: isAvailable ? (pressed ? 0.7 : 1) : 0.5 },
                  ]}
                  onPress={() => isAvailable && (haptic.light(), setConnectProvider(p))}
                  disabled={!isAvailable}
                  accessibilityRole="button"
                  accessibilityLabel={`${label}${isAvailable ? '' : ' — coming soon'}`}
                >
                  <Text
                    style={[
                      styles.providerChipText,
                      { color: isSelected ? colors.brand : isAvailable ? colors.textPrimary : colors.textMuted },
                    ]}
                  >
                    {label}
                  </Text>
                  {!isAvailable ? (
                    <Text style={[styles.providerChipSoon, { color: colors.textMuted }]}>{t('provider.soon')}</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.inputWrap, { borderColor: colors.border }]}>
            <AppIcon name="key" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
            <TextInput
              style={[styles.input, { color: colors.inputText }]}
              placeholder={t('connect.apiKey')}
              placeholderTextColor={colors.textMuted}
              value={connectKey}
              onChangeText={setConnectKey}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              accessibilityLabel="Server connection API key"
            />
          </View>

          <View style={[styles.inputWrap, { borderColor: colors.border }]}>
            <AppIcon name="bookmark" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
            <TextInput
              style={[styles.input, { color: colors.inputText }]}
              placeholder={t('connect.labelOptional')}
              placeholderTextColor={colors.textMuted}
              value={connectLabel}
              onChangeText={setConnectLabel}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Server connection label"
            />
          </View>

          <View style={[styles.inputWrap, { borderColor: colors.border }]}>
            <AppIcon name="link" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
            <TextInput
              style={[styles.input, { color: colors.inputText }]}
              placeholder={t('connect.baseUrl')}
              placeholderTextColor={colors.textMuted}
              value={connectBaseUrl}
              onChangeText={setConnectBaseUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              accessibilityLabel="Server connection base URL"
            />
          </View>

          <View style={styles.actionRow}>
            <SecondaryButton
              label={t('connect.cancel')}
              onPress={cancelConnectForm}
              disabled={creatingConnection}
              colors={colors}
              styles={styles}
            />
            <PrimaryButton
              label={creatingConnection ? t('connect.verifying') : t('connect.verifySave')}
              onPress={handleCreateConnection}
              loading={creatingConnection}
              disabled={creatingConnection || connectKey.trim().length === 0}
              colors={colors}
              styles={styles}
            />
          </View>
        </View>
      ) : null}

      {/* Server connection list — flat rows, hairline separators */}
      {loading ? (
        <FlagshipState variant="loading" style={styles.loadingWrap} />
      ) : connections.length === 0 && !showConnectForm ? (
        <View style={styles.emptyServerConnections}>
          <Text style={[styles.connectHint, { color: colors.textMuted }]}>
            {t('serverConnections.empty')}
          </Text>
        </View>
      ) : (
        <View>
          {connections.map((conn, index) => {
            const isLast = index === connections.length - 1;
            const healthColor =
              conn.healthStatus === 'healthy' ? colors.success
                : conn.healthStatus === 'failed' || conn.healthStatus === 'revoked' || conn.healthStatus === 'expired' ? colors.danger
                  : conn.healthStatus === 'degraded' ? colors.warning
                    : colors.textMuted;
            const healthLabel =
              conn.healthStatus === 'healthy' ? t('health.healthy')
                : conn.healthStatus === 'failed' ? t('health.failed')
                  : conn.healthStatus === 'revoked' ? t('health.revoked')
                    : conn.healthStatus === 'expired' ? t('health.expired')
                      : conn.healthStatus === 'degraded' ? t('health.degraded')
                        : t('health.unverified');
            const providerLabel = conn.provider.charAt(0).toUpperCase() + conn.provider.slice(1);
            const titleText = conn.label ? `${providerLabel} — ${conn.label}` : providerLabel;
            const isReverifying = reverifyingId === conn.id;
            const isRemoving = removingId === conn.id;
            const verifiedText = conn.lastVerifiedAt
              ? t('connection.verified', { time: formatRelativeTime(conn.lastVerifiedAt) })
              : t('connection.notVerified');

            return (
              <View
                key={conn.id}
                style={[
                  styles.serverConnectionRow,
                  !isLast && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
                ]}
              >
                <View style={styles.serverConnectionHeader}>
                  <View style={styles.providerIdentity}>
                    <AppIcon name="desktop" size={IconSize.md} color="textPrimary" opticalCenter accessible={false} />
                    <View style={styles.providerNameWrap}>
                      <Text style={[styles.providerName, { color: colors.textPrimary }]} numberOfLines={1}>
                        {titleText}
                      </Text>
                      <Text style={[styles.providerDesc, { color: colors.textSecondary }]} numberOfLines={1}>
                        {conn.maskedKey}
                      </Text>
                      <Text style={[styles.flatRowCaveat, { color: colors.textMuted }]} numberOfLines={1}>
                        {verifiedText}
                        {conn.lastError ? ` · ${conn.lastError}` : ''}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={[styles.providerStatus, { color: healthColor }]}
                    numberOfLines={1}
                  >
                    {healthLabel}
                  </Text>
                </View>

                {conn.discoveredModels && conn.discoveredModels.length > 0 ? (
                  <Text style={[styles.modelsList, { color: colors.textSecondary }]} numberOfLines={2}>
                    {t('connection.modelsCount', { count: conn.discoveredModels.length })} · {conn.discoveredModels.slice(0, 6).map((m) => m.displayName).join(', ')}
                    {conn.discoveredModels.length > 6 ? `, +${conn.discoveredModels.length - 6} ${t('connection.more')}` : ''}
                  </Text>
                ) : null}

                <View style={styles.actionRow}>
                  <SecondaryButton
                    label={isReverifying ? t('connection.verifying') : t('connection.reverify')}
                    onPress={() => handleReverify(conn.id)}
                    disabled={isReverifying || isRemoving}
                    colors={colors}
                    styles={styles}
                  />
                  <SecondaryButton
                    label={isRemoving ? t('connection.removing') : t('connection.remove')}
                    danger
                    onPress={() => handleRequestRemove(conn)}
                    disabled={isReverifying || isRemoving}
                    colors={colors}
                    styles={styles}
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Remove confirmation */}
      {confirmRemove ? (
        <View style={[styles.confirmWrap, { backgroundColor: colors.dangerSubtle }]}>
          <Text style={[styles.confirmTitle, { color: colors.textPrimary }]}>
            {t('confirm.title')}
          </Text>
          <Text style={[styles.confirmBody, { color: colors.textSecondary }]}>
            {t('confirm.body')}
          </Text>
          <View style={styles.actionRow}>
            <SecondaryButton
              label={t('confirm.cancel')}
              onPress={cancelConfirmRemove}
              disabled={removingId !== null}
              colors={colors}
              styles={styles}
            />
            <PrimaryButton
              label={removingId ? t('confirm.removing') : t('confirm.remove')}
              onPress={handleConfirmRemove}
              loading={removingId !== null}
              colors={colors}
              styles={styles}
            />
          </View>
        </View>
      ) : null}

      {/* Toast */}
      {toast ? (
        <View
          style={[
            styles.toast,
            {
              backgroundColor: toast.kind === 'success' ? colors.successSubtle : colors.dangerSubtle,
              borderColor: toast.kind === 'success' ? colors.successBorder : colors.dangerBorder },
          ]}
        >
          <AppIcon
            name={toast.kind === 'success' ? 'verified' : 'warning'}
            size={IconSize.sm}
            color={toast.kind === 'success' ? 'success' : 'danger'}
            opticalCenter
            accessible={false}
          />
          <Text
            style={[
              styles.toastText,
              { color: toast.kind === 'success' ? colors.success : colors.danger },
            ]}
            numberOfLines={3}
          >
            {toast.message}
          </Text>
        </View>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'recently';
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}
