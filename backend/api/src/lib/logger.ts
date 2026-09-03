import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      '*.password',
      '*.token',
      '*.secret',
      '*.apiKey',
      '*.email',
      '*.phoneNumber',
      '*.address',
      '*.addressLine1',
      '*.addressLine2',
      '*.postalCode',
      '*.dateOfBirth',
      '*.legalName',
      '*.body',
      '*.message',
      '*.messageText',
      '*.ciphertext',
      '*.cardNumber',
      '*.iban',
      '*.sortCode',
      '*.accountNumber',
      '*.plaintext',
      '*.plaintextB64',
    ],
    censor: '[REDACTED]',
  },
});

export default logger;
