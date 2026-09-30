const crypto = require('crypto');
const { db, emailQueries, smsQueries, userQueries } = require('../db');
const { sendSmsViaTextBee } = require('./textbeeService');

/**
 * Carrier Gateway Simulator
 * Simulates telecom SMS delivery and two-way SMS-to-Email bridge.
 */

/**
 * Creates a clean snippet of the email body
 * @param {string} text - Email body text
 * @param {number} maxLen - Maximum snippet length
 * @returns {string} truncated snippet
 */
function createBodySnippet(text, maxLen = 75) {
  if (!text || typeof text !== 'string') return '(No content)';
  const singleLine = text.replace(/[\r\n]+/g, ' ').trim();
  if (singleLine.length <= maxLen) return singleLine;
  return singleLine.slice(0, maxLen - 3) + '...';
}

/**
 * Simulates carrier SMS delivery to mobile numbers.
 * Dispatches an automated SMS notification previewing:
 * "From: <sender>, Subject: <subject>, Body snippet: <preview>"
 *
 * @param {string} recipientPhone - 10-digit mobile number
 * @param {string} senderEmail - Sender of the email
 * @param {string} subject - Email subject line
 * @param {string} body - Email body content
 * @returns {object} created SmsLog record with carrier receipt
 */
function sendSmsNotification(recipientPhone, senderEmail, subject, body = '') {
  const cleanPhone = String(recipientPhone).replace(/\D/g, '');
  const cleanSender = senderEmail && typeof senderEmail === 'string' && senderEmail.trim()
    ? senderEmail.trim()
    : 'system@zapmail.com';
  const cleanSubject = subject || '(No Subject)';
  const snippet = createBodySnippet(body, 80);

  // Standard required format: "You have received an email from <Sender>. Subject: <Subject> via ZapMail."
  const message = body && typeof body === 'string' && body.includes('via ZapMail')
    ? body.trim()
    : `You have received an email from ${cleanSender}. Subject: ${cleanSubject} via ZapMail.`;
  const smsId = `sms_${crypto.randomUUID()}`;

  smsQueries.create.run({
    id: smsId,
    recipientPhone: cleanPhone,
    senderEmail: cleanSender,
    subject: cleanSubject,
    message: message
  });

  const carrierReceipt = {
    id: smsId,
    recipientPhone: cleanPhone,
    senderEmail: cleanSender,
    subject: cleanSubject,
    message: message,
    snippet,
    carrier: 'ZapMail Virtual Carrier Gateway (SMS-C)',
    status: 'DELIVERED',
    latencyMs: Math.floor(15 + Math.random() * 20),
    timestamp: new Date().toISOString()
  };

  console.log(`📡 [Carrier Gateway] SMS dispatched to +1 (${cleanPhone}): "${message}"`);

  return carrierReceipt;
}

/**
 * Alias for notifyViaSms supporting body snippet
 */
function notifyViaSms(recipientPhone, senderEmail, subject, body = '') {
  return sendSmsNotification(recipientPhone, senderEmail, subject, body);
}

/**
 * Automated Carrier SMS Notification on Inbound Email (Buildathon Requirement):
 * - Sends an SMS alert ONLY if recipient does NOT use the mobile app (registeredVia !== 'MOBILE_APP').
 * - Resolves recipient user record by matching incoming destination email/phone (<phone>@phonemail.com).
 * - Format: "You have received an email from <Sender>. Subject: <Subject>."
 * - Dispatches via sendSmsViaTextBee(recipientPhone, smsText)
 * - Safe fallback logging: console.log(`[CARRIER SMS NOTIFICATION] Dispatched to ${recipientPhone}: ${smsText}`);
 */
async function handleInboundCarrierSmsNotification({ recipientEmail, senderEmail, subject, body = '' }) {
  if (!recipientEmail) return null;

  let recipientUser = userQueries.findByEmail.get(recipientEmail);
  let recipientPhone = null;

  const phoneMatch = recipientEmail.match(/(\d{10})@(zapmail|phonemail)/i);
  if (phoneMatch) {
    recipientPhone = phoneMatch[1];
    if (!recipientUser) {
      recipientUser = userQueries.findByPhone.get(recipientPhone);
    }
  } else if (recipientUser) {
    recipientPhone = recipientUser.phoneNumber;
  }

  if (!recipientPhone && recipientUser?.phoneNumber) {
    recipientPhone = recipientUser.phoneNumber;
  }

  if (!recipientPhone) {
    return null;
  }

  const registeredVia = recipientUser ? recipientUser.registeredVia : 'WEB';

  // Buildathon Rule: If registeredVia === 'MOBILE_APP', skip SMS dispatch entirely
  if (registeredVia === 'MOBILE_APP') {
    console.log(`[CARRIER SMS NOTIFICATION] Suppressed for mobile app user ${recipientPhone} (registeredVia: ${registeredVia})`);
    return { skipped: true, reason: 'MOBILE_APP_USER', recipientPhone };
  }

  // Buildathon Rule: Format exactly: "You have received an email from <Sender>. Subject: <Subject> via ZapMail."
  const cleanSender = senderEmail && typeof senderEmail === 'string' && senderEmail.trim()
    ? senderEmail.trim()
    : 'Unknown Sender';
  const cleanSubject = subject && typeof subject === 'string' && subject.trim()
    ? subject.trim()
    : '(No Subject)';
  const smsText = `You have received an email from ${cleanSender}. Subject: ${cleanSubject} via ZapMail.`;

  try {
    console.log(`[CARRIER SMS NOTIFICATION] Dispatched to ${recipientPhone}: ${smsText}`);

    // Trigger TextBee SMS dispatch (non-blocking)
    sendSmsViaTextBee(recipientPhone, smsText).catch((err) => {
      console.warn(`[CARRIER SMS NOTIFICATION] TextBee transport notice: ${err.message}`);
    });

    // Record in SQLite SmsLog table
    const smsId = `sms_${crypto.randomUUID()}`;
    try {
      smsQueries.create.run({
        id: smsId,
        recipientPhone,
        senderEmail: cleanSender,
        subject: cleanSubject,
        message: smsText
      });
    } catch {
      // ignore
    }

    return {
      success: true,
      recipientPhone,
      smsText
    };
  } catch (error) {
    console.log(`[CARRIER SMS NOTIFICATION] Dispatched to ${recipientPhone}: ${smsText}`);
    return {
      success: false,
      recipientPhone,
      smsText,
      error: error.message
    };
  }
}

/**
 * Backward compatibility alias for checkAndNotifyRecipient
 */
function checkAndNotifyRecipient(params) {
  return handleInboundCarrierSmsNotification(params);
}

/**
 * Simulates replying via SMS to trigger an outgoing email
 * POST /api/telecom/sms-reply
 *
 * @param {object} params - { senderPhone, text, replyToEmail, subject, originalEmailId }
 * @returns {object} { success, email, carrierEvent }
 */
async function processSmsReply({ senderPhone, text, replyToEmail, subject, originalEmailId }) {
  if (!senderPhone) {
    throw new Error('senderPhone is required');
  }

  const cleanPhone = String(senderPhone).replace(/\D/g, '');
  if (cleanPhone.length !== 10) {
    throw new Error('senderPhone must be exactly 10 digits');
  }

  const replyText = text && typeof text === 'string' && text.trim()
    ? text.trim()
    : 'Received and confirmed via ZapMail SMS reply.';

  const senderEmailHandle = `${cleanPhone}@zapmail.com`;
  let targetRecipient = replyToEmail && typeof replyToEmail === 'string' && replyToEmail.trim()
    ? replyToEmail.trim()
    : null;
  let targetSubject = subject && typeof subject === 'string' && subject.trim()
    ? subject.trim()
    : null;

  // If recipient is not explicitly provided, find the most recent incoming email for this phone
  if (!targetRecipient) {
    try {
      const lastEmail = db.prepare(`
        SELECT * FROM Email 
        WHERE recipientEmail LIKE ? OR recipientEmail LIKE ?
        ORDER BY createdAt DESC LIMIT 1
      `).get(`%${cleanPhone}%`, senderEmailHandle);

      if (lastEmail) {
        targetRecipient = lastEmail.senderEmail;
        if (!targetSubject) {
          targetSubject = lastEmail.subject.startsWith('Re:')
            ? lastEmail.subject
            : `Re: ${lastEmail.subject}`;
        }
      }
    } catch {
      // ignore
    }
  }

  // Fallback recipient if still not found
  if (!targetRecipient) {
    targetRecipient = 'support@zapmail.com';
  }

  if (!targetSubject) {
    targetSubject = 'Re: ZapMail Conversation';
  } else if (!targetSubject.startsWith('Re:')) {
    targetSubject = `Re: ${targetSubject}`;
  }

  // 1. Create and store outbound email in SQLite Email table
  const emailId = `email_${crypto.randomUUID()}`;
  const emailBody = `[SMS Reply via Carrier Gateway from ${cleanPhone}]\n\n${replyText}`;

  emailQueries.create.run({
    id: emailId,
    senderEmail: senderEmailHandle,
    recipientEmail: targetRecipient,
    subject: targetSubject,
    body: emailBody,
    read: 0
  });

  const createdEmail = emailQueries.findById.get(emailId);

  // 2. Record this carrier event in SmsLog
  const carrierLogId = `sms_${crypto.randomUUID()}`;
  const carrierLogMessage = `Outbound email dispatched to ${targetRecipient} triggered by SMS reply from ${cleanPhone}: "${replyText}"`;

  smsQueries.create.run({
    id: carrierLogId,
    recipientPhone: cleanPhone,
    senderEmail: senderEmailHandle,
    subject: targetSubject,
    message: carrierLogMessage
  });

  console.log(`🚀 [Carrier Bridge] SMS reply from ${cleanPhone} converted to outbound email -> Recipient: ${targetRecipient} ("${targetSubject}")`);

  return {
    success: true,
    message: `SMS reply processed! Outgoing email successfully triggered and delivered to ${targetRecipient}`,
    carrierEvent: {
      eventType: 'CARRIER_SMS_REPLY_BRIDGE',
      senderPhone: cleanPhone,
      senderEmailHandle,
      recipientEmail: targetRecipient,
      subject: targetSubject,
      smsText: replyText,
      timestamp: new Date().toISOString()
    },
    triggeredEmail: createdEmail
  };
}

module.exports = {
  createBodySnippet,
  sendSmsNotification,
  notifyViaSms,
  checkAndNotifyRecipient,
  handleInboundCarrierSmsNotification,
  processSmsReply
};
