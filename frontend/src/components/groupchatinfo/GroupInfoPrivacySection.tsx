/**
 * GroupInfoPrivacySection — the "Privacy & transparency" block on the
 * group details screen. Opens the encryption/storage transparency sheet.
 * Presentation only; wording deliberately avoids claiming end-to-end
 * encryption.
 */

import React from 'react';
import { FlagshipFormSection } from '../flagship';
import { GroupInfoRow } from '../groupchat/GroupInfoRow';

export function GroupInfoPrivacySection({ onPress }: { onPress: () => void }) {
  return (
    <FlagshipFormSection title="Privacy & transparency" variant="flat">
      <GroupInfoRow
        icon="shield"
        label="Message storage & security"
        subtitle="Transmitted securely over encrypted channels"
        onPress={onPress}
        isLast
      />
    </FlagshipFormSection>
  );
}
