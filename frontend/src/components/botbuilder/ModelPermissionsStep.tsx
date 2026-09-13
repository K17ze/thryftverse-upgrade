import React from 'react';
import { Text, View } from 'react-native';
import type { ThemeColors } from '../../theme/ThemeContext';
import type { ChatAgentConfig } from '../../domain';
import {
  CAPABILITY_RISK_LABELS,
  type AgentCapability,
  type CapabilityGrantConfig } from '../../platform/agents/agentDefinition';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { CollapsibleStep } from './CollapsibleStep';
import { OptionGrid } from './OptionGrid';
import { ChoiceList } from './ChoiceList';
import { CapabilityRow } from './CapabilityRow';
import { RISK_DOT, SUPPORTED_MODELS, type PlannedRiskGroup } from './botBuilderTypes';
import type { BotBuilderStyles } from './botBuilderStyles';

// ── Step 4: Model & permissions (collapsible, advanced) ──

export function ModelPermissionsStep({
  modelId,
  onModelIdChange,
  conversationContext,
  onToggleConversationContext,
  maxTurns,
  onMaxTurnsChange,
  activeGrants,
  plannedGrantsByRisk,
  onGrantToggle,
  complete,
  open,
  onToggle,
  colors,
  styles }: {
  modelId: ChatAgentConfig['model'];
  onModelIdChange: (value: ChatAgentConfig['model']) => void;
  conversationContext: boolean;
  onToggleConversationContext: () => void;
  maxTurns: number;
  onMaxTurnsChange: (value: number) => void;
  activeGrants: CapabilityGrantConfig[];
  plannedGrantsByRisk: PlannedRiskGroup[];
  onGrantToggle: (capability: AgentCapability, enabled: boolean) => void;
  complete: boolean;
  open: boolean;
  onToggle: () => void;
  colors: ThemeColors;
  styles: BotBuilderStyles;
}) {
  return (
    <CollapsibleStep
      stepNumber={4}
      title="Model & permissions"
      detail="The AI model and what this agent can access."
      complete={complete}
      open={open}
      onToggle={onToggle}
      colors={colors}
      styles={styles}
    >
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Model</Text>
      <ChoiceList
        options={SUPPORTED_MODELS}
        selected={modelId}
        onSelect={(value) => onModelIdChange(value as ChatAgentConfig['model'])}
      />
      <View style={styles.caution}>
        <AppIcon name="info" size={IconSize.sm} color="textSecondary" opticalCenter accessible={false} />
        <Text style={styles.cautionText}>
          Agents run on the server runtime. This deployment supports the models listed here.
        </Text>
      </View>

      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>History limit</Text>
      <CapabilityRow
        label="Conversation context"
        risk="low"
        enabled={conversationContext}
        onToggle={onToggleConversationContext}
      />
      {conversationContext ? (
        <>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Recent turns available</Text>
          <OptionGrid
            options={[
              { value: '8', label: '8' },
              { value: '16', label: '16' },
              { value: '32', label: '32' },
            ]}
            selected={String(maxTurns)}
            onSelect={(value) => onMaxTurnsChange(Number(value))}
          />
        </>
      ) : null}

      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Permissions</Text>
      <View style={styles.capabilityGroup}>
        <Text style={styles.capabilityGroupTitle}>Active capabilities</Text>
        <View style={styles.permissionList}>
          {activeGrants.map((grant, index) => {
            const meta = CAPABILITY_RISK_LABELS[grant.capability];
            return (
              <View key={grant.capability}>
                <CapabilityRow
                  label={meta.label}
                  risk={meta.risk}
                  enabled={grant.enabled}
                  onToggle={() => onGrantToggle(grant.capability, !grant.enabled)}
                />
                {index < activeGrants.length - 1 ? <View style={styles.divider} /> : null}
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.capabilityGroup}>
        <View style={styles.plannedHeader}>
          <Text style={styles.capabilityGroupTitle}>Planned capabilities</Text>
          <Text style={styles.plannedHint}>
            Coming soon — not yet available on this deployment.
          </Text>
        </View>
        {plannedGrantsByRisk.map((group) => (
          <View key={group.risk} style={styles.riskGroup}>
            <View style={styles.riskGroupHeader}>
              <View style={styles.riskGroupTitleRow}>
                <AppIcon
                  name={RISK_DOT[group.risk]}
                  size={IconSize.sm}
                  color={group.risk === 'critical' ? 'danger' : 'textSecondary'}
                  opticalCenter
                  accessible={false}
                />
                <Text style={styles.riskGroupTitle}>{group.title}</Text>
              </View>
            </View>
            <View style={styles.permissionList}>
              {group.grants.map((grant, index) => {
                const meta = CAPABILITY_RISK_LABELS[grant.capability];
                return (
                  <View key={grant.capability}>
                    <CapabilityRow
                      label={meta.label}
                      risk={group.risk}
                      enabled={false}
                      planned
                    />
                    {index < group.grants.length - 1 ? <View style={styles.divider} /> : null}
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    </CollapsibleStep>
  );
}
