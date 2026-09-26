'use client';

/**
 * IdentityStep — KYC step 1: legal name, date of birth (masked DD/MM/YYYY,
 * 18+ enforced) and address. One validation pass on Continue; errors land
 * on the offending field and clear as the user types.
 */

import { INPUT_CLASS, INPUT_ERROR_CLASS, SellField } from '@/components/sell/SellField';
import { Button } from '@/components/ui/Button';
import {
  formatDobInput,
  type IdentityErrorMap,
  type KycIdentityFields,
} from './verificationModel';

interface IdentityStepProps {
  fields: KycIdentityFields;
  errors: IdentityErrorMap;
  onChange: (patch: Partial<KycIdentityFields>) => void;
  onBack: () => void;
  onContinue: () => void;
}

const errorRing = (error?: string) => (error ? ` ${INPUT_ERROR_CLASS}` : '');

export function IdentityStep({ fields, errors, onChange, onBack, onContinue }: IdentityStepProps) {
  return (
    <div>
      <div className="flex flex-col gap-5">
        <SellField
          id="kyc-fullname"
          label="Legal full name"
          required
          error={errors.fullName}
        >
          <input
            id="kyc-fullname"
            type="text"
            autoComplete="name"
            autoCapitalize="words"
            placeholder="As shown on your ID"
            value={fields.fullName}
            onChange={(e) => onChange({ fullName: e.target.value })}
            aria-invalid={Boolean(errors.fullName)}
            aria-describedby={errors.fullName ? 'kyc-fullname-error' : undefined}
            className={INPUT_CLASS + errorRing(errors.fullName)}
          />
        </SellField>

        <SellField
          id="kyc-dob"
          label="Date of birth"
          required
          hint="Format: DD/MM/YYYY — you must be 18 or older"
          error={errors.dob}
        >
          <input
            id="kyc-dob"
            type="text"
            inputMode="numeric"
            autoComplete="bday"
            placeholder="DD/MM/YYYY"
            maxLength={10}
            value={fields.dob}
            onChange={(e) => onChange({ dob: formatDobInput(e.target.value) })}
            aria-invalid={Boolean(errors.dob)}
            aria-describedby={errors.dob ? 'kyc-dob-error' : undefined}
            className={INPUT_CLASS + errorRing(errors.dob)}
          />
        </SellField>

        <SellField
          id="kyc-address"
          label="Street address"
          required
          error={errors.addressLine}
        >
          <input
            id="kyc-address"
            type="text"
            autoComplete="street-address"
            placeholder="House number and street"
            value={fields.addressLine}
            onChange={(e) => onChange({ addressLine: e.target.value })}
            aria-invalid={Boolean(errors.addressLine)}
            aria-describedby={errors.addressLine ? 'kyc-address-error' : undefined}
            className={INPUT_CLASS + errorRing(errors.addressLine)}
          />
        </SellField>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <SellField id="kyc-city" label="City" required error={errors.city}>
            <input
              id="kyc-city"
              type="text"
              autoComplete="address-level2"
              placeholder="City"
              value={fields.city}
              onChange={(e) => onChange({ city: e.target.value })}
              aria-invalid={Boolean(errors.city)}
              aria-describedby={errors.city ? 'kyc-city-error' : undefined}
              className={INPUT_CLASS + errorRing(errors.city)}
            />
          </SellField>
          <SellField id="kyc-postcode" label="Postcode" required error={errors.postcode}>
            <input
              id="kyc-postcode"
              type="text"
              autoComplete="postal-code"
              autoCapitalize="characters"
              placeholder="Postcode"
              value={fields.postcode}
              onChange={(e) => onChange({ postcode: e.target.value })}
              aria-invalid={Boolean(errors.postcode)}
              aria-describedby={errors.postcode ? 'kyc-postcode-error' : undefined}
              className={INPUT_CLASS + errorRing(errors.postcode)}
            />
          </SellField>
        </div>
      </div>

      <div className="mt-8 flex items-center gap-3">
        <Button variant="quiet" size="md" onClick={onBack}>
          Back
        </Button>
        <Button variant="primary" size="md" className="flex-1" onClick={onContinue}>
          Continue to document
        </Button>
      </div>
    </div>
  );
}
