import React from 'react';
import { Text, View } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import type { AgentStudioStyles } from './agentStudioStyles';

/** Help footer — honest note on what agents can and cannot do. */
export function AgentStudioSecurityNote({ styles }: { styles: AgentStudioStyles }) {
  const { colors } = useAppTheme();
  const { t } = useAppTranslation('aiAgent');

  return (
    <View style={styles.securityNote}>
      <View style={styles.securityHeader}>
        <AppIcon name="info" size={IconSize.sm} color="textSecondary" opticalCenter accessible={false} />
        <Text style={[styles.securityTitle, { color: colors.textPrimary }]}>{t('help.title')}</Text>
      </View>
      <Text style={[styles.securityBody, { color: colors.textSecondary }]}>
        {t('help.body')}
      </Text>
    </View>
  );
}
