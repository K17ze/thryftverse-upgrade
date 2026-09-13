import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { FlagshipState } from '../flagship';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import {
  AIProvider,
  PROVIDER_CONFIGS,
  PROVIDER_ORDER,
  maskApiKey } from '../../services/aiProviderApi';
import type { ConnectionStatus, ProviderState } from '../../hooks/agents/types';
import { PrimaryButton, SecondaryButton } from './AgentStudioButtons';
import type { AgentStudioStyles } from './agentStudioStyles';

/**
 * "Device tools" tab — device-local keys are discovery-only and collapsed
 * by default. Expanded, each provider row shows the truthful status
 * (connected / not connected / invalid), the masked key, discovered
 * models, and the edit / test / disconnect flows.
 */
export function AgentStudioDeviceKeysSection({
  loading,
  providers,
  onPatchProvider,
  showDeviceKeys,
  onToggleDeviceKeys,
  onStartEdit,
  onCancelEdit,
  onTest,
  onDisconnect,
  styles }: {
  loading: boolean;
  providers: Record<AIProvider, ProviderState>;
  onPatchProvider: (provider: AIProvider, patch: Partial<ProviderState>) => void;
  showDeviceKeys: boolean;
  onToggleDeviceKeys: () => void;
  onStartEdit: (provider: AIProvider) => void;
  onCancelEdit: (provider: AIProvider) => void;
  onTest: (provider: AIProvider) => void;
  onDisconnect: (provider: AIProvider) => void;
  styles: AgentStudioStyles;
}) {
  const { colors } = useAppTheme();
  const { t } = useAppTranslation('aiAgent');

  if (loading) {
    return <FlagshipState variant="loading" style={styles.loadingWrap} />;
  }

  return (
    <View>
      <Pressable
        style={({ pressed }) => [styles.collapseHeader, { opacity: pressed ? 0.6 : 1 }]}
        onPress={onToggleDeviceKeys}
        accessibilityRole="button"
        accessibilityLabel={showDeviceKeys ? 'Hide device-local keys' : 'Show device-local keys'}
      >
        <View style={styles.collapseHeaderLeft}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
            {t('sections.deviceLocalKeys')}
          </Text>
          <Text style={[styles.deviceLocalNote, { color: colors.textMuted }]} numberOfLines={1}>
            {t('deviceLocal.note')}
          </Text>
        </View>
        <AppIcon
          name={showDeviceKeys ? 'chevronUp' : 'chevronDown'}
          size={IconSize.sm}
          color="textMuted"
          opticalCenter
          accessible={false}
        />
      </Pressable>

      {showDeviceKeys ? (
        <>
          <Text style={[styles.deviceLocalNote, { color: colors.textMuted }]}>
            {t('deviceLocal.expandedNote')}
          </Text>

      {PROVIDER_ORDER.map((providerId, index) => {
        const config = PROVIDER_CONFIGS[providerId];
        const state = providers[providerId];
        const status: ConnectionStatus = state.testResult?.status === 'invalid'
          ? 'invalid'
          : state.stored
            ? 'connected'
            : 'not_connected';
        const isLast = index === PROVIDER_ORDER.length - 1;

        return (
          <View
            key={providerId}
            style={[
              styles.providerRow,
              !isLast && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
            ]}
          >
            {/* Provider header row */}
            <View style={styles.providerHeader}>
              <View style={styles.providerIdentity}>
                <AppIcon name="bulb-outline" size={IconSize.md} color="textPrimary" opticalCenter accessible={false} />
                <View style={styles.providerNameWrap}>
                  <Text style={[styles.providerName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {config.name}
                  </Text>
                  <Text
                    style={[styles.providerDesc, { color: colors.textSecondary }]}
                    numberOfLines={2}
                  >
                    {config.description}
                  </Text>
                </View>
              </View>
              <Text
                style={[
                  styles.providerStatus,
                  {
                    color: status === 'connected'
                      ? colors.success
                      : status === 'invalid'
                        ? colors.danger
                        : colors.textMuted },
                ]}
                numberOfLines={1}
              >
                {status === 'connected'
                  ? t('providerStatus.connected')
                  : status === 'invalid'
                    ? t('providerStatus.invalid')
                    : t('providerStatus.notConnected')}
              </Text>
            </View>

            {/* Connected state — masked key + actions */}
            {state.stored && !state.editing ? (
              <View style={styles.connectedBody}>
                <View style={[styles.keyDisplay, { backgroundColor: colors.surfaceAlt }]}>
                  <AppIcon name="lock" size={IconSize.xs} color="textMuted" opticalCenter accessible={false} />
                  <Text style={[styles.keyText, { color: colors.textSecondary }]} numberOfLines={1}>
                    {maskApiKey(state.stored.apiKey)}
                  </Text>
                </View>
                {state.stored.baseUrl ? (
                  <Text style={[styles.baseUrlText, { color: colors.textMuted }]} numberOfLines={1}>
                    Endpoint: {state.stored.baseUrl}
                  </Text>
                ) : null}
                {state.testResult && state.testResult.status === 'valid' ? (
                  <Text style={[styles.validNote, { color: colors.success }]}>
                    {state.testResult.message}
                  </Text>
                ) : null}
                {/* Discovered models (provider-authoritative) — text, not chips */}
                {state.discoveredModels && state.discoveredModels.length > 0 ? (
                  <View style={styles.modelsWrap}>
                    <Text style={[styles.modelsLabel, { color: colors.textMuted }]}>
                      {t('provider.modelsAvailable', { count: state.discoveredModels.length })}
                    </Text>
                    <Text style={[styles.modelsList, { color: colors.textSecondary }]} numberOfLines={3}>
                      {state.discoveredModels.slice(0, 8).map((m) => m.displayName).join(', ')}
                      {state.discoveredModels.length > 8
                        ? `, +${state.discoveredModels.length - 8} more`
                        : ''}
                    </Text>
                  </View>
                ) : state.discovering ? (
                  <View style={styles.modelDiscovering}>
                    <ActivityIndicator size="small" color={colors.textMuted} />
                    <Text style={[styles.modelHint, { color: colors.textMuted }]}>
                      {t('provider.discoveringModels')}
                    </Text>
                  </View>
                ) : null}
                <Text style={[styles.storageNote, { color: colors.textMuted }]}>
                  {t('provider.storedLocally', { storage: state.stored.storageClass === 'secure' ? t('provider.secureStorage') : t('provider.deviceStorage') })}
                </Text>
                <View style={styles.actionRow}>
                  <SecondaryButton
                    label={t('provider.disconnect')}
                    danger
                    onPress={() => onDisconnect(providerId)}
                    colors={colors}
                    styles={styles}
                  />
                  <SecondaryButton
                    label={t('provider.replaceKey')}
                    onPress={() => onStartEdit(providerId)}
                    colors={colors}
                    styles={styles}
                  />
                </View>
              </View>
            ) : null}

            {/* Not connected state — prompt to connect */}
            {!state.stored && !state.editing ? (
              <View style={styles.connectCta}>
                <Text style={[styles.connectHint, { color: colors.textMuted }]}>
                  {t('provider.noKeySaved', { name: config.name })}
                </Text>
                <PrimaryButton
                  label={t('provider.connect')}
                  onPress={() => onStartEdit(providerId)}
                  colors={colors}
                  styles={styles}
                />
              </View>
            ) : null}

            {/* Editing state — key input + test / cancel */}
            {state.editing ? (
              <View style={styles.editBody}>
                {config.supportsBaseUrl ? (
                  <View style={[styles.inputWrap, { borderColor: colors.border }]}>
                    <AppIcon name="link" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
                    <TextInput
                      style={[styles.input, { color: colors.inputText }]}
                      placeholder="https://your-endpoint/v1"
                      placeholderTextColor={colors.textMuted}
                      value={state.baseUrlInput}
                      onChangeText={(text) =>
                        onPatchProvider(providerId, { baseUrlInput: text })
                      }
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                      accessibilityLabel={`${config.name} base URL`}
                    />
                  </View>
                ) : null}
                <View style={[styles.inputWrap, { borderColor: colors.border }]}>
                  <AppIcon name="key" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
                  <TextInput
                    style={[styles.input, { color: colors.inputText }]}
                    placeholder={config.keyPlaceholder}
                    placeholderTextColor={colors.textMuted}
                    value={state.keyInput}
                    onChangeText={(text) =>
                      onPatchProvider(providerId, { keyInput: text, testResult: null })
                    }
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                    accessibilityLabel={`${config.name} API key`}
                  />
                </View>

                {/* Available models — provider-authoritative (spec 04).
                    Discovered dynamically from the provider's /models
                    endpoint after a successful connection. Before the
                    first connection, we show a truthful placeholder
                    instead of a hardcoded catalogue. */}
                <View style={styles.modelsWrap}>
                  <Text style={[styles.modelsLabel, { color: colors.textMuted }]}>
                    {t('provider.availableModels')}
                  </Text>
                  {state.discoveredModels && state.discoveredModels.length > 0 ? (
                    <Text style={[styles.modelsList, { color: colors.textSecondary }]} numberOfLines={4}>
                      {state.discoveredModels.map((m) => m.displayName).join(', ')}
                    </Text>
                  ) : state.discovering ? (
                    <View style={styles.modelDiscovering}>
                      <ActivityIndicator size="small" color={colors.textMuted} />
                      <Text style={[styles.modelHint, { color: colors.textMuted }]}>
                        {t('provider.discoveringFrom', { name: config.name })}
                      </Text>
                    </View>
                  ) : state.discoveredModels && state.discoveredModels.length === 0 ? (
                    <Text style={[styles.modelHint, { color: colors.textMuted }]}>
                      {t('provider.noModelsReturned', { name: config.name })}
                    </Text>
                  ) : (
                    <Text style={[styles.modelHint, { color: colors.textMuted }]}>
                      {t('provider.modelsAfterConnect', { name: config.name })}
                    </Text>
                  )}
                </View>

                {state.testResult ? (
                  <Text
                    style={[
                      styles.testResult,
                      {
                        color:
                          state.testResult.status === 'valid' ? colors.success : colors.danger },
                    ]}
                  >
                    {state.testResult.message}
                  </Text>
                ) : null}

                <View style={styles.actionRow}>
                  <SecondaryButton
                    label={t('connect.cancel')}
                    onPress={() => onCancelEdit(providerId)}
                    colors={colors}
                    styles={styles}
                  />
                  <PrimaryButton
                    label={state.testing ? t('provider.testing') : t('provider.testSave')}
                    onPress={() => onTest(providerId)}
                    loading={state.testing}
                    disabled={state.testing || state.keyInput.trim().length === 0}
                    colors={colors}
                    styles={styles}
                  />
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
        </>
      ) : null}
    </View>
  );
}
