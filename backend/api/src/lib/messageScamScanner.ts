export type ScamSeverity = 'low' | 'medium' | 'high';

export interface ScamScanResult {
  flagged: boolean;
  patterns: string[];
  severity: ScamSeverity;
}

interface PatternRule {
  name: string;
  regex: RegExp;
  severity: ScamSeverity;
}

const PHONE_PATTERN: RegExp = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,4}\d{2,4}/;
const EMAIL_PATTERN: RegExp = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const URL_PATTERN: RegExp = /https?:\/\/[^\s]+/i;

const PATTERN_RULES: PatternRule[] = [
  { name: 'phone_number', regex: PHONE_PATTERN, severity: 'medium' },
  { name: 'email_address', regex: EMAIL_PATTERN, severity: 'medium' },

  { name: 'paypal', regex: /paypal(?:\s*(?:me|to|at|\.com|\.co\.uk))?/i, severity: 'low' },
  { name: 'venmo', regex: /venmo(?:\s*(?:me|at|\.com))?/i, severity: 'low' },
  { name: 'cashapp', regex: /cashapp|cash\s*app|cash\s*tag/i, severity: 'low' },
  { name: 'zelle', regex: /\bzelle\b/i, severity: 'low' },
  { name: 'revolut', regex: /revolut/i, severity: 'low' },
  { name: 'monzo', regex: /monzo/i, severity: 'low' },
  { name: 'wise', regex: /\bwise\b|transferwise/i, severity: 'low' },
  { name: 'samsung_pay', regex: /samsung\s*pay/i, severity: 'low' },
  { name: 'google_pay', regex: /google\s*pay/i, severity: 'low' },
  { name: 'apple_pay', regex: /apple\s*pay(?!\s*in\s*app)/i, severity: 'low' },

  { name: 'bank_transfer', regex: /bank\s*(?:transfer|details|account|sort\s*code|iban|swift)/i, severity: 'medium' },
  { name: 'sort_code', regex: /sort\s*code/i, severity: 'medium' },
  { name: 'iban', regex: /\biban\b/i, severity: 'medium' },
  { name: 'account_number', regex: /account\s*(?:number|no\.?)\s*[:\-]?\s*\d/i, severity: 'medium' },

  { name: 'bitcoin_address', regex: /\b(?:bc1|[13])[a-z0-9]{25,42}\b/i, severity: 'high' },
  { name: 'ethereum_address', regex: /\b0x[a-fA-F0-9]{40}\b/i, severity: 'high' },
  { name: 'crypto_wallet', regex: /bitcoin|btc\b|ethereum|eth\b|crypto(?:currency)?\s*(?:wallet|transfer|payment)/i, severity: 'high' },
  { name: 'usdt', regex: /\busdt\b|tether/i, severity: 'high' },
  { name: 'crypto_address_request', regex: /(?:btc|eth|usdt)\s*(?:address|wallet)/i, severity: 'high' },

  { name: 'western_union', regex: /western\s*union/i, severity: 'high' },
  { name: 'moneygram', regex: /moneygram|money\s*gram/i, severity: 'high' },

  { name: 'gift_card', regex: /gift\s*card(?:\s*(?:code|number|balance))?/i, severity: 'medium' },
  { name: 'steam_card', regex: /steam\s*card|itunes\s*card|amazon\s*card\s*code/i, severity: 'medium' },

  { name: 'send_money_request', regex: /send\s*(?:money|payment|cash|deposit)\s*(?:to|via|through|on|using)?/i, severity: 'high' },
  { name: 'pay_me_directly', regex: /pay\s*(?:me|us)\s*(?:directly|outside|via|through)/i, severity: 'high' },
  { name: 'off_platform_payment', regex: /outside\s*(?:thryft|the\s*app|platform)|off(?:\s*|-)?platform/i, severity: 'high' },
  { name: 'direct_transfer', regex: /direct\s*(?:transfer|payment|to\s*my)/i, severity: 'high' },

  { name: 'whatsapp_contact', regex: /whatsapp\s*(?:me|at|on)?\s*[:+]?\s*\d|contact\s*me\s*(?:on|at|via)\s*whatsapp/i, severity: 'medium' },
  { name: 'telegram_contact', regex: /telegram\s*(?:me|at|on)\s*[@@]|contact\s*me\s*(?:on|at|via)\s*telegram/i, severity: 'medium' },
  { name: 'signal_contact', regex: /contact\s*me\s*(?:on|at|via)\s*signal/i, severity: 'medium' },
  { name: 'text_me', regex: /(?:text|sms)\s*me\s*(?:at|on)?\s*[:+]?\s*\d/i, severity: 'medium' },
  { name: 'email_me', regex: /email\s*me\s*(?:at|on)?\s*[\w.@]/i, severity: 'medium' },
  { name: 'move_off_app', regex: /take\s*this\s*(?:off|outside)\s*(?:the\s*)?app|let'?s\s*(?:talk|chat|continue)\s*(?:on|via|through)\s*(?!thryft)/i, severity: 'medium' },
  { name: 'share_contact', regex: /my\s*(?:email|phone|number)\s*(?:is|:)\s*[\w@+]/i, severity: 'medium' },

  { name: 'payment_link_url', regex: /https?:\/\/(?:www\.)?(?:paypal|venmo|cash\.app|zelle|revolut|monzo|wise|transferwise)\b[^\s]*/i, severity: 'high' },

  { name: 'too_good_to_be_true', regex: /i'?ll\s*pay\s*(?:double|twice|extra|more)|send\s*me\s*(?:your|ur)\s*(?:details|info|address)/i, severity: 'high' },
  { name: 'upfront_payment', regex: /send\s*(?:payment|money|deposit)\s*(?:first|before|upfront)/i, severity: 'high' },
];

const SEVERITY_RANK: Record<ScamSeverity, number> = { low: 1, medium: 2, high: 3 };

export function scanMessageForScamPatterns(text: string): ScamScanResult {
  if (!text || !text.trim()) {
    return { flagged: false, patterns: [], severity: 'low' };
  }

  const matchedPatterns: string[] = [];
  let highestSeverity: ScamSeverity = 'low';

  for (const rule of PATTERN_RULES) {
    if (rule.regex.test(text)) {
      matchedPatterns.push(rule.name);
      if (SEVERITY_RANK[rule.severity] > SEVERITY_RANK[highestSeverity]) {
        highestSeverity = rule.severity;
      }
    }
  }

  if (matchedPatterns.length === 0) {
    return { flagged: false, patterns: [], severity: 'low' };
  }

  return {
    flagged: true,
    patterns: matchedPatterns,
    severity: highestSeverity,
  };
}
