import { config } from '../config.js';

interface SendAuthEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface SendAuthEmailResult {
  accepted: boolean;
  provider: string;
  providerMessageId?: string;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export async function sendAuthEmail(input: SendAuthEmailInput): Promise<SendAuthEmailResult> {
  const provider = config.authEmailProvider;

  if (provider === 'resend') {
    if (!config.resendApiKey || !config.authEmailFrom) {
      throw new Error('Resend email provider is not configured');
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.authEmailFrom,
        to: [normalizeEmail(input.to)],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!response.ok) {
      const failureBody = await response.text();
      throw new Error(`Resend delivery failed (${response.status}): ${failureBody}`);
    }

    const payload = (await response.json()) as {
      id?: string;
    };

    return {
      accepted: true,
      provider: 'resend',
      providerMessageId: payload.id,
    };
  }

  if (provider === 'brevo') {
    if (!config.brevoApiKey || !config.authEmailFrom) {
      throw new Error('Brevo email provider is not configured');
    }

    const senderMatch = config.authEmailFrom.match(/^(?:(.+?)\s*)?<([^>]+)>$/);
    const sender = senderMatch
      ? { email: senderMatch[2].trim(), ...(senderMatch[1] ? { name: senderMatch[1].trim() } : {}) }
      : { email: config.authEmailFrom.trim() };

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: {
        'api-key': config.brevoApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender,
        to: [{ email: normalizeEmail(input.to) }],
        subject: input.subject,
        htmlContent: input.html,
        textContent: input.text,
      }),
    });

    if (!response.ok) {
      const failureBody = await response.text();
      throw new Error(`Brevo delivery failed (${response.status}): ${failureBody}`);
    }

    const payload = (await response.json()) as {
      messageId?: string;
    };

    return {
      accepted: true,
      provider: 'brevo',
      providerMessageId: payload.messageId,
    };
  }

  if (config.nodeEnv === 'production') {
    throw new Error(`Email provider '${provider}' is not configured for production`);
  }

  console.info(
    `[auth-email:${provider}] to=${normalizeEmail(input.to)} subject="${input.subject}"`
  );

  return {
    accepted: true,
    provider,
  };
}
