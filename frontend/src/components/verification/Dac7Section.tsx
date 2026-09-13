import React from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { SettingsSection } from '../settings/SettingsSection';
import { SettingsRow } from '../settings/SettingsRow';
import { SettingsInfoBanner } from '../settings/SettingsInfoBanner';
import { VerificationFlowCard } from './VerificationFlowCard';
import { VerificationFlowNav } from './VerificationFlowNav';
import { createVerificationScreenStyles } from './verificationScreenStyles';
import {
  TAX_RESIDENCE_COUNTRIES,
  dac7StepTitle,
  resolveDac7RowSubtitle } from '../../domain/verification';
import type { UseDac7FlowResult } from '../../hooks/verification/useDac7Flow';

export interface Dac7SectionProps {
  /** The DAC7 flow hook result — step machine, fields, submit wiring. */
  flow: UseDac7FlowResult;
  /** Backend-authoritative: tax info has been provided. */
  completed: boolean;
  /** Persisted tax-residence country from the backend record, when present. */
  savedCountry: string | null | undefined;
}

/**
 * The DAC7 tax-information surface: the status row plus the in-screen
 * details form (TIN, country of tax residence, self-declaration).
 */
export function Dac7Section({ flow, completed, savedCountry }: Dac7SectionProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createVerificationScreenStyles(colors), [colors]);
  return (
    <>
      <SettingsSection title="Tax information (DAC7)">
        <SettingsRow
          icon="document-text-outline"
          iconColor={completed ? colors.brand : colors.textMuted}
          title="DAC7 tax details"
          subtitle={resolveDac7RowSubtitle(completed, savedCountry ?? flow.country)}
          onPress={flow.toggleOpen}
          isFirst
          isLast
        />
      </SettingsSection>

      {flow.step !== 'status' ? (
        <VerificationFlowCard
          title={dac7StepTitle(flow.step)}
          onClose={flow.cancel}
          closeAccessibilityLabel="Cancel"
          closeAccessibilityHint="Cancels and returns to status screen"
        >
          {flow.step === 'details' ? (
            <>
              <SettingsInfoBanner
                icon="information-circle-outline"
                text="Under the EU DAC7 directive, digital platforms must report seller tax information. This data is shared with EU tax authorities."
              />
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Tax identification number (TIN)</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                value={flow.tin}
                onChangeText={flow.setTin}
                placeholder="Your TIN / National Insurance number"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
                returnKeyType="done"
              />
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Country of tax residence</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.countryScroll}
                contentContainerStyle={styles.countryScrollContent}
              >
                {TAX_RESIDENCE_COUNTRIES.map((code) => (
                  <Pressable
                    key={code}
                    style={[
                      styles.countryChip,
                      {
                        borderColor: flow.country === code ? colors.brand : colors.border,
                        backgroundColor: flow.country === code ? colors.brandSubtle : colors.surfaceAlt },
                    ]}
                    onPress={() => flow.selectCountry(code)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: flow.country === code }}
                    accessibilityLabel={`Select ${code}`}
                  >
                    <Text style={[styles.countryChipText, { color: flow.country === code ? colors.brand : colors.textPrimary }]}>
                      {code}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable
                style={styles.checkboxRow}
                onPress={flow.toggleSelfDeclared}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: flow.selfDeclared }}
                accessibilityLabel="Confirm tax information is accurate"
              >
                <Ionicons
                  name={flow.selfDeclared ? 'checkbox-outline' : 'square-outline'}
                  size={20}
                  color={flow.selfDeclared ? colors.brand : colors.textMuted}
                />
                <Text style={[styles.checkboxText, { color: colors.textSecondary }]}>
                  I confirm this tax information is accurate and complete
                </Text>
              </Pressable>
              <VerificationFlowNav
                onBack={flow.cancel}
                backLabel="Cancel"
                backAccessibilityLabel="Cancel tax information entry"
                onPrimary={flow.submit}
                primaryLabel="Save"
                primaryAccessibilityLabel="Save tax information"
                primaryLoading={flow.isSubmitting}
              />
            </>
          ) : null}
        </VerificationFlowCard>
      ) : null}
    </>
  );
}
