/**
 * GroupInfoControlsSection — owner/admin "Group controls" block on the
 * group details screen (permissions + automations entries). Presentation
 * only; navigation wiring stays in the screen.
 */

import React from 'react';
import { FlagshipFormSection } from '../flagship';
import { GroupInfoRow } from '../groupchat/GroupInfoRow';

export interface GroupInfoControlsSectionProps {
  connectedAgentCount: number;
  onPermissionsPress: () => void;
  onAgentsPress: () => void;
}

export function GroupInfoControlsSection({
  connectedAgentCount,
  onPermissionsPress,
  onAgentsPress,
}: GroupInfoControlsSectionProps) {
  return (
    <FlagshipFormSection title="Group controls" variant="flat">
      <GroupInfoRow
        icon="settings"
        label="Group permissions"
        subtitle="Who can edit info, send messages and add members"
        onPress={onPermissionsPress}
      />
      <GroupInfoRow
        icon="sparkles"
        label="Automations & AI agents"
        subtitle={
          connectedAgentCount > 0
            ? `${connectedAgentCount} agent connected`
            : 'Shopping, styling & moderation assistants'
        }
        onPress={onAgentsPress}
        isLast
      />
    </FlagshipFormSection>
  );
}
