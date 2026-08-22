/**
 * SMS provider abstraction for transactional text messages.
 *
 * Supports Twilio as the primary provider with a log-only fallback for
 * development. The provider is selected via the SMS_PROVIDER environment
 * variable ('twilio' | 'log').
 *
 * Used for:
 * - Order status updates (shipped, delivered)
 * - Delivery exception alerts
 * - Security verification codes (2FA backup)
 * - Critical account notifications
 */

export interface SmsMessage {
  to: string;
  body: string;
  /** Optional sender ID override (defaults to configured sender) */
  from?: string;
  /** Optional metadata for delivery tracking */
  metadata?: Record<string, string>;
}

export interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider: string;
}

export interface SmsProvider {
  readonly name: string;
  send(message: SmsMessage): Promise<SmsResult>;
}

// ── Log provider (development) ────────────────────────────────────────

export class LogSmsProvider implements SmsProvider {
  readonly name = 'log';

  async send(message: SmsMessage): Promise<SmsResult> {
    console.log(`[SMS] to=${message.to} body=${message.body}`);
    return {
      success: true,
      messageId: `log_${Date.now()}`,
      provider: 'log',
    };
  }
}

// ── Twilio provider ───────────────────────────────────────────────────

export class TwilioSmsProvider implements SmsProvider {
  readonly name = 'twilio';
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly fromNumber: string;
  private readonly messagingServiceSid?: string;

  constructor(config: {
    accountSid: string;
    authToken: string;
    fromNumber?: string;
    messagingServiceSid?: string;
  }) {
    this.accountSid = config.accountSid;
    this.authToken = config.authToken;
    this.fromNumber = config.fromNumber ?? '';
    this.messagingServiceSid = config.messagingServiceSid;
  }

  async send(message: SmsMessage): Promise<SmsResult> {
    const from = message.from ?? this.messagingServiceSid ?? this.fromNumber;
    if (!from) {
      return {
        success: false,
        error: 'No sender configured (set TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID)',
        provider: 'twilio',
      };
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');

    const body = new URLSearchParams();
    body.append('To', message.to);
    body.append('From', from);
    body.append('Body', message.body);
    if (message.metadata) {
      body.append('StatusCallback', message.metadata.callbackUrl ?? '');
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Twilio API error ${response.status}: ${errorText}`,
          provider: 'twilio',
        };
      }

      const data = await response.json() as { sid?: string; error_code?: number; error_message?: string };
      if (data.error_code) {
        return {
          success: false,
          error: `Twilio error ${data.error_code}: ${data.error_message}`,
          provider: 'twilio',
        };
      }

      return {
        success: true,
        messageId: data.sid,
        provider: 'twilio',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Twilio error',
        provider: 'twilio',
      };
    }
  }
}

// ── Factory ───────────────────────────────────────────────────────────

let cachedProvider: SmsProvider | null = null;

/**
 * Create or return the cached SMS provider based on environment variables.
 *
 * Environment variables:
 * - SMS_PROVIDER: 'twilio' | 'log' (default: 'log')
 * - TWILIO_ACCOUNT_SID: Twilio account SID
 * - TWILIO_AUTH_TOKEN: Twilio auth token
 * - TWILIO_FROM_NUMBER: Sender phone number
 * - TWILIO_MESSAGING_SERVICE_SID: Optional messaging service SID
 */
export function getSmsProvider(): SmsProvider {
  if (cachedProvider) return cachedProvider;

  const providerType = process.env.SMS_PROVIDER ?? 'log';

  if (providerType === 'twilio') {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_FROM_NUMBER;
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

    if (!accountSid || !authToken) {
      console.warn('[SMS] Twilio provider selected but TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set — falling back to log provider');
      cachedProvider = new LogSmsProvider();
      return cachedProvider;
    }

    cachedProvider = new TwilioSmsProvider({
      accountSid,
      authToken,
      fromNumber,
      messagingServiceSid,
    });
  } else {
    cachedProvider = new LogSmsProvider();
  }

  return cachedProvider;
}

/**
 * Send an SMS message using the configured provider.
 */
export async function sendSms(message: SmsMessage): Promise<SmsResult> {
  return getSmsProvider().send(message);
}
