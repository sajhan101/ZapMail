/**
 * Automated Spam Detection Engine
 * Scans incoming email subjects, body text, and sender addresses against
 * financial fraud, phishing, lottery scams, crypto giveaways, and suspicious URL patterns.
 */

const SPAM_TRIGGERS = [
  // Lottery & Cash Scams
  /\blottery\b/i,
  /\bwin cash\b/i,
  /\bclaim prize\b/i,
  /\bclaim your prize\b/i,
  /\bprize claim\b/i,
  /\bfree money\b/i,
  /\bcongratulations,?\s+you\s+(have\s+)?won\b/i,
  /\bmillion dollars?\b/i,
  /\bunclaimed funds?\b/i,
  /\binheritance fund\b/i,
  /\bbillionaire beneficiary\b/i,

  // Crypto Giveaways & Financial Scams
  /\bcrypto giveaway\b/i,
  /\bbitcoin giveaway\b/i,
  /\bfree crypto\b/i,
  /\bdouble your (btc|crypto|bitcoin|eth)\b/i,
  /\bairdrop claim\b/i,
  /\bwallet validation\b/i,
  /\bwire transfer\b/i,
  /\burgent bank transfer\b/i,
  /\bbank transfer requested\b/i,
  /\baccount suspended\b/i,
  /\bverify your account immediately\b/i,
  /\bsecurity alert:\s*verify\b/i,

  // High-Pressure / Phishing Phrases
  /\bact now.*limited time\b/i,
  /\b100% free.*no risk\b/i,
  /\bget rich quick\b/i,
  /\bearn \$\d+ (daily|weekly|hourly)\b/i,
  /\bwork from home.*make \$\d+\b/i,
  /\bwestern union\b/i,
  /\bmoneygram\b/i,
  /\bconfidential proposal\b/i
];

const SUSPICIOUS_URL_PATTERNS = [
  /https?:\/\/(bit\.ly|tinyurl\.com|t\.co|is\.gd|cutt\.ly|ow\.ly|buff\.ly|rebrand\.ly)\/[a-zA-Z0-9_-]+/i,
  /https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?(\/[^\s]*)?/i,
  /https?:\/\/[a-zA-Z0-9.-]+(\.xyz|\.top|\.tk|\.ml|\.ga|\.cf|\.gq|\.buzz|\.cam|\.work|\.loan|\.click)\b/i,
  /https?:\/\/.*(login|verify|secure|update|banking|account).*(free|bonus|reward|win).*\//i
];

/**
 * Evaluates whether an email is spam based on subject, body, and sender.
 *
 * @param {object} params
 * @param {string} params.subject - Email subject
 * @param {string} params.body - Email body text or HTML
 * @param {string} [params.senderEmail] - Sender's email address
 * @returns {{isSpam: boolean, reason: string | null, matchedTriggers: string[]}}
 */
function isSpam({ subject = '', body = '', senderEmail = '' }) {
  const cleanSubject = String(subject || '');
  const cleanBody = String(body || '');
  const cleanSender = String(senderEmail || '').toLowerCase();

  const combinedText = `${cleanSubject} \n ${cleanBody}`;
  const matchedTriggers = [];

  // 1. Scan for keyword and phrase triggers
  for (const trigger of SPAM_TRIGGERS) {
    if (trigger.test(combinedText)) {
      matchedTriggers.push(trigger.toString());
    }
  }

  // 2. Scan for suspicious URL patterns
  for (const urlPattern of SUSPICIOUS_URL_PATTERNS) {
    const match = combinedText.match(urlPattern);
    if (match) {
      matchedTriggers.push(`Suspicious URL pattern: ${match[0]}`);
    }
  }

  // 3. Known spam / disposable sender domains
  const disposableDomains = ['mailinator.com', '10minutemail.com', 'tempmail.com', 'guerrillamail.com', 'trashmail.com'];
  for (const domain of disposableDomains) {
    if (cleanSender.endsWith(`@${domain}`)) {
      matchedTriggers.push(`Disposable sender domain: ${domain}`);
    }
  }

  const isFlagged = matchedTriggers.length > 0;

  return {
    isSpam: isFlagged,
    reason: isFlagged ? `Flagged by automated spam filters (${matchedTriggers.slice(0, 3).join(', ')})` : null,
    matchedTriggers
  };
}

module.exports = {
  isSpam,
  SPAM_TRIGGERS,
  SUSPICIOUS_URL_PATTERNS
};
