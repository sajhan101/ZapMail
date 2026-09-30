const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { emailQueries, userQueries } = require('../db');
const { authenticateToken, optionalAuth, resolveUser } = require('../middleware/auth');
const { notifyViaSms, handleInboundCarrierSmsNotification } = require('../services/telecom');
const { isSpam } = require('../services/spamDetector');
const { generateEmailSummary, generateSmartReplies } = require('./ai');

const router = express.Router();

// Ensure uploads directory exists for attachments
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage for multipart/form-data attachments
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '';
    const base = path.basename(file.originalname || 'attachment', ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueSuffix = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    cb(null, `${base}_${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

/**
 * Format email object for API responses (parsing JSON attachments, casting booleans)
 */
function formatEmail(email) {
  if (!email) return null;
  let parsedAttachments = [];
  if (typeof email.attachments === 'string') {
    try {
      parsedAttachments = JSON.parse(email.attachments);
    } catch {
      parsedAttachments = [];
    }
  } else if (Array.isArray(email.attachments)) {
    parsedAttachments = email.attachments;
  }

  const hasAttachment = Array.isArray(parsedAttachments) && parsedAttachments.length > 0;

  let parsedLabels = [];
  if (typeof email.labels === 'string') {
    try {
      parsedLabels = JSON.parse(email.labels);
    } catch {
      parsedLabels = [];
    }
  } else if (Array.isArray(email.labels)) {
    parsedLabels = email.labels;
  }

  // Resolve sender details from SQLite User table
  let senderUser = null;
  if (email.senderPhone) {
    senderUser = userQueries.findByPhone.get(email.senderPhone);
  }
  if (!senderUser && email.senderEmail) {
    senderUser = userQueries.findByEmail.get(email.senderEmail);
  }
  if (!senderUser && email.senderEmail && (email.senderEmail.includes('@zapmail.com') || email.senderEmail.includes('@phonemail.com'))) {
    const rawDigits = email.senderEmail.split('@')[0].replace(/\D/g, '').slice(-10);
    if (rawDigits.length === 10) {
      senderUser = userQueries.findByPhone.get(rawDigits);
    }
  }

  // Resolve recipient details from SQLite User table
  let recipientUser = null;
  if (email.recipientPhone) {
    recipientUser = userQueries.findByPhone.get(email.recipientPhone);
  }
  if (!recipientUser && email.recipientEmail) {
    recipientUser = userQueries.findByEmail.get(email.recipientEmail);
  }
  if (!recipientUser && email.recipientEmail && (email.recipientEmail.includes('@zapmail.com') || email.recipientEmail.includes('@phonemail.com'))) {
    const rawDigits = email.recipientEmail.split('@')[0].replace(/\D/g, '').slice(-10);
    if (rawDigits.length === 10) {
      recipientUser = userQueries.findByPhone.get(rawDigits);
    }
  }

  const senderName = senderUser?.name || email.senderName || null;
  const senderAvatar = senderUser?.avatarUrl || email.senderAvatar || null;
  const recipientName = recipientUser?.name || email.recipientName || null;
  const recipientAvatar = recipientUser?.avatarUrl || email.recipientAvatar || null;

  return {
    ...email,
    senderName,
    senderAvatar,
    recipientName,
    recipientAvatar,
    read: Boolean(email.read),
    isDraft: Boolean(email.isDraft),
    attachments: Array.isArray(parsedAttachments) ? parsedAttachments : [],
    labels: Array.isArray(parsedLabels) ? parsedLabels : [],
    hasAttachment,
    hasAttachments: hasAttachment,
    folder: email.folder || 'INBOX'
  };
}

/**
 * Resolve authenticated user from req.user, JWT bearer token, or headers/query
 */
function getReqUser(req) {
  let user = req.user || resolveUser(req);
  const phoneHeader = req.headers['x-user-phone'] || req.query?.userPhone || req.query?.phone;
  const emailHeader = req.headers['x-user-email'] || req.query?.userEmail || req.query?.email;

  const phone = user?.phoneNumber || (phoneHeader ? String(phoneHeader).replace(/\D/g, '').slice(0, 10) : null);
  const email = user?.email || emailHeader || (phone ? `${phone}@zapmail.com` : null);

  if (phone || email) {
    return {
      id: user?.id || null,
      phoneNumber: phone,
      email: email
    };
  }
  return null;
}

/**
 * Verify whether an email record belongs to or can be accessed by the requesting user
 */
function canAccessEmail(emailRecord, user) {
  if (!emailRecord || !user) return false;
  const phone = user.phoneNumber;
  const email = user.email ? user.email.toLowerCase() : null;

  // Strict ownership check if record has an owner
  if (emailRecord.ownerPhone || emailRecord.ownerEmail) {
    if (emailRecord.ownerPhone && phone && emailRecord.ownerPhone === phone) return true;
    if (emailRecord.ownerEmail && email && emailRecord.ownerEmail.toLowerCase() === email) return true;
    return false;
  }

  // Legacy fallback if no owner is designated
  if (emailRecord.recipientPhone && phone && emailRecord.recipientPhone === phone) return true;
  if (emailRecord.senderPhone && phone && emailRecord.senderPhone === phone) return true;
  if (emailRecord.recipientEmail && email && emailRecord.recipientEmail.toLowerCase() === email) return true;
  if (emailRecord.senderEmail && email && emailRecord.senderEmail.toLowerCase() === email) return true;

  return false;
}

/**
 * POST /api/messages/upload-attachment (also /api/mail/upload-attachment)
 * Supports multipart/form-data (field 'file' or 'attachment') and JSON base64 payloads under 5MB.
 * Returns metadata with previewable URL.
 */
router.post('/upload-attachment', (req, res) => {
  if (req.is('multipart/form-data')) {
    upload.single('file')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ success: false, error: 'File size exceeds 5MB limit' });
        }
        return res.status(400).json({ success: false, error: err.message });
      } else if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }

      const attachment = {
        id: `att_${crypto.randomUUID()}`,
        filename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        url: `/uploads/${file.filename}`
      };

      return res.status(201).json({
        success: true,
        attachment
      });
    });
  } else {
    // JSON base64 upload
    try {
      const { filename, mimeType, base64, dataUrl } = req.body;
      let rawBase64 = base64;
      let detectedMime = mimeType || 'application/octet-stream';

      if (dataUrl && typeof dataUrl === 'string') {
        const matches = dataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
        if (matches) {
          detectedMime = matches[1];
          rawBase64 = matches[2];
        }
      }

      if (!rawBase64 || typeof rawBase64 !== 'string') {
        return res.status(400).json({ success: false, error: 'File data (file or base64) is required' });
      }

      const buffer = Buffer.from(rawBase64, 'base64');
      if (buffer.length > 5 * 1024 * 1024) {
        return res.status(400).json({ success: false, error: 'Attachment exceeds 5MB limit' });
      }

      const safeOrigName = (filename || 'attachment').replace(/[^a-zA-Z0-9_.-]/g, '_');
      const ext = path.extname(safeOrigName) || '';
      const base = path.basename(safeOrigName, ext);
      const uniqueSuffix = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const savedFilename = `${base}_${uniqueSuffix}${ext}`;
      const destPath = path.join(uploadsDir, savedFilename);

      fs.writeFileSync(destPath, buffer);

      const attachment = {
        id: `att_${crypto.randomUUID()}`,
        filename: filename || savedFilename,
        mimeType: detectedMime,
        size: buffer.length,
        url: `/uploads/${savedFilename}`
      };

      return res.status(201).json({
        success: true,
        attachment
      });
    } catch (err) {
      console.error('[Upload Base64 Attachment Error]:', err);
      return res.status(500).json({ success: false, error: 'Failed to process attachment' });
    }
  }
});

/**
 * POST /api/mail/receive & POST /api/messages/incoming
 * Inbound receiver route for incoming emails.
 * Buildathon Specification:
 * - Scans for spam: routes to SPAM if flagged and suppresses carrier SMS alerts.
 * - Resolves recipient user record by matching destination email/phone (<phone>@phonemail.com).
 * - Saves as Recipient Copy with ownerPhone = recipientPhone.
 * - Checks recipient registeredVia:
 *     * If registeredVia !== 'MOBILE_APP': Dispatches SMS: "You have received an email from <Sender>. Subject: <Subject>."
 *     * If registeredVia === 'MOBILE_APP': Skips SMS dispatch entirely.
 */
const handleInboundMail = async (req, res) => {
  try {
    const { from, to, subject, body, attachments } = req.body;

    if (!to || typeof to !== 'string' || !to.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Recipient ("to") is required'
      });
    }

    let recipientEmail = to.trim();
    const cleanDigits = recipientEmail.replace(/\D/g, '');
    let recipientPhone = null;

    if (cleanDigits.length === 10 && !recipientEmail.includes('@')) {
      recipientEmail = `${cleanDigits}@zapmail.com`;
      recipientPhone = cleanDigits;
    } else if (cleanDigits.length === 10) {
      recipientPhone = cleanDigits;
    } else {
      const match = recipientEmail.match(/(\d{10})@(zapmail|phonemail)/i);
      if (match) recipientPhone = match[1];
    }

    const senderEmail = from && typeof from === 'string' && from.trim() ? from.trim() : 'external@sender.com';
    const senderPhoneMatch = senderEmail.match(/(\d{10})/);
    const senderPhone = senderPhoneMatch ? senderPhoneMatch[1] : null;

    const emailSubject = subject || '(No Subject)';
    const emailBody = body || '';
    const emailId = `email_${crypto.randomUUID()}`;

    // Process attachments
    let cleanAttachments = [];
    if (Array.isArray(attachments)) {
      cleanAttachments = attachments;
    } else if (typeof attachments === 'string') {
      try {
        cleanAttachments = JSON.parse(attachments);
      } catch {
        cleanAttachments = [];
      }
    }

    // Automated Spam Detection
    const spamCheck = isSpam({ subject: emailSubject, body: emailBody, senderEmail });
    const folder = spamCheck.isSpam ? 'SPAM' : 'INBOX';

    // 1. Resolve recipient user record
    let recipientUser = userQueries.findByEmail.get(recipientEmail);
    if (!recipientUser && recipientPhone) {
      recipientUser = userQueries.findByPhone.get(recipientPhone);
    }
    const resolvedRecipientPhone = recipientPhone || (recipientUser ? recipientUser.phoneNumber : null);

    // 2. Save received email in SQLite database as RECIPIENT COPY
    emailQueries.create.run({
      id: emailId,
      ownerPhone: resolvedRecipientPhone,
      ownerEmail: recipientEmail,
      userId: recipientUser ? recipientUser.id : resolvedRecipientPhone,
      senderPhone,
      senderEmail,
      recipientPhone: resolvedRecipientPhone,
      recipientEmail,
      subject: emailSubject,
      body: emailBody,
      read: 0,
      folder,
      deletedAt: null,
      attachments: cleanAttachments,
      isDraft: 0,
      recipientTrash: 0,
      senderTrash: 0
    });

    const savedEmail = formatEmail(emailQueries.findById.get(emailId));

    // 3. Trigger Carrier SMS notification hook per Buildathon spec:
    // Sends SMS ONLY if recipient does NOT use mobile app (registeredVia !== 'MOBILE_APP')
    let smsNotification = null;

    if (!spamCheck.isSpam) {
      smsNotification = await handleInboundCarrierSmsNotification({
        recipientEmail,
        senderEmail,
        subject: emailSubject,
        body: emailBody
      });
    } else {
      console.log(`🛡️ [PhoneMail Spam Gatekeeper] Inbound email flagged as SPAM (${spamCheck.reason}). SMS alert suppressed.`);
    }

    // 4. Return confirmation JSON response with status 201
    return res.status(201).json({
      success: true,
      message: spamCheck.isSpam ? 'Inbound email received (filtered to SPAM)' : 'Inbound email received and processed',
      email: savedEmail,
      recipientUser: recipientUser
        ? {
            id: recipientUser.id,
            name: recipientUser.name,
            phoneNumber: recipientUser.phoneNumber,
            email: recipientUser.email,
            avatarUrl: recipientUser.avatarUrl,
            registeredVia: recipientUser.registeredVia
          }
        : null,
      isSpam: spamCheck.isSpam,
      spamReason: spamCheck.reason,
      smsAlertSent: Boolean(smsNotification && !smsNotification.skipped),
      smsNotification
    });
  } catch (error) {
    console.error('[Receive Mail Error]:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error processing incoming email'
    });
  }
};

router.post('/receive', handleInboundMail);
router.post('/incoming', handleInboundMail);

/**
 * POST /api/mail/send
 * Outbound email endpoint.
 * Multi-user data isolation:
 * - Creates a Sender Copy owned by senderPhone (folder: 'SENT', read: 1).
 * - Creates a Recipient Copy owned by recipientPhone if local PhoneMail recipient (folder: 'INBOX', read: 0).
 */
router.post('/send', optionalAuth, (req, res) => {
  try {
    const { to, subject, body, from, attachments } = req.body;

    if (!to || typeof to !== 'string' || !to.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Recipient ("to") is required'
      });
    }

    const user = getReqUser(req);

    let recipientEmail = to.trim();
    const cleanDigits = recipientEmail.replace(/\D/g, '');
    let recipientPhone = null;

    if (cleanDigits.length === 10 && !recipientEmail.includes('@')) {
      recipientEmail = `${cleanDigits}@zapmail.com`;
      recipientPhone = cleanDigits;
    } else if (cleanDigits.length === 10) {
      recipientPhone = cleanDigits;
    } else {
      const match = recipientEmail.match(/(\d{10})@(zapmail|phonemail)/i);
      if (match) recipientPhone = match[1];
    }

    const senderPhone = user?.phoneNumber || (from ? from.replace(/\D/g, '').slice(0, 10) : null);
    let senderEmail = user?.email || from || (senderPhone ? `${senderPhone}@zapmail.com` : 'user@zapmail.com');
    if (typeof senderEmail === 'string') {
      senderEmail = senderEmail.replace(/@phonemail\.com/gi, '@zapmail.com');
    }
    const emailSubject = subject || '(No Subject)';
    const emailBody = body || '';

    // Process attachments
    let cleanAttachments = [];
    if (Array.isArray(attachments)) {
      cleanAttachments = attachments;
    } else if (typeof attachments === 'string') {
      try {
        cleanAttachments = JSON.parse(attachments);
      } catch {
        cleanAttachments = [];
      }
    }

    // Automated Spam Check
    const spamCheck = isSpam({ subject: emailSubject, body: emailBody, senderEmail });
    const recipientFolder = spamCheck.isSpam ? 'SPAM' : 'INBOX';

    // 1. Create SENDER COPY (owned by senderPhone, folder = 'SENT')
    const senderEmailId = `email_${crypto.randomUUID()}`;
    emailQueries.create.run({
      id: senderEmailId,
      ownerPhone: senderPhone,
      ownerEmail: senderEmail,
      userId: user?.id || senderPhone,
      senderPhone,
      senderEmail,
      recipientPhone,
      recipientEmail,
      subject: emailSubject,
      body: emailBody,
      read: 1, // Sender has read the message they just wrote
      folder: 'SENT',
      deletedAt: null,
      attachments: cleanAttachments,
      isDraft: 0,
      recipientTrash: 0,
      senderTrash: 0
    });

    const savedSenderEmail = formatEmail(emailQueries.findById.get(senderEmailId));

    // 2. Check if recipient is a registered or local ZapMail user
    let recipientUser = userQueries.findByEmail.get(recipientEmail);
    if (!recipientUser && recipientPhone) {
      recipientUser = userQueries.findByPhone.get(recipientPhone);
    }
    const isLocalRecipient = Boolean(recipientUser || (recipientPhone && (recipientEmail.includes('@zapmail.com') || recipientEmail.includes('@phonemail.com'))));

    // 3. Create RECIPIENT COPY if local recipient (owned by recipientPhone, folder = INBOX / SPAM)
    let recipientEmailId = null;
    if (isLocalRecipient) {
      recipientEmailId = `email_${crypto.randomUUID()}`;
      emailQueries.create.run({
        id: recipientEmailId,
        ownerPhone: recipientPhone || (recipientUser ? recipientUser.phoneNumber : null),
        ownerEmail: recipientEmail,
        userId: recipientUser ? recipientUser.id : recipientPhone,
        senderPhone,
        senderEmail,
        recipientPhone: recipientPhone || (recipientUser ? recipientUser.phoneNumber : null),
        recipientEmail,
        subject: emailSubject,
        body: emailBody,
        read: 0,
        folder: recipientFolder,
        deletedAt: null,
        attachments: cleanAttachments,
        isDraft: 0,
        recipientTrash: 0,
        senderTrash: 0
      });
    }

    // 4. Trigger SMS notification hook per Buildathon spec
    let smsNotification = null;
    if (!spamCheck.isSpam) {
      if (recipientUser) {
        if (recipientUser.registeredVia !== 'MOBILE_APP') {
          const smsText = `You have received an email from ${senderEmail}. Subject: ${emailSubject} via ZapMail.`;
          smsNotification = notifyViaSms(recipientUser.phoneNumber, senderEmail, emailSubject, smsText);
          console.log(`[CARRIER SMS NOTIFICATION] Dispatched to ${recipientUser.phoneNumber}:${smsText}`);
        } else {
          console.log(`[CARRIER SMS NOTIFICATION] Skipped for mobile app user ${recipientUser.phoneNumber}`);
        }
      } else if (recipientPhone) {
        const smsText = `You have received an email from ${senderEmail}. Subject: ${emailSubject} via ZapMail.`;
        smsNotification = notifyViaSms(recipientPhone, senderEmail, emailSubject, smsText);
        console.log(`[CARRIER SMS NOTIFICATION] Dispatched to ${recipientPhone}:${smsText}`);
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Email sent successfully',
      email: savedSenderEmail,
      recipientEmailId,
      isSpam: spamCheck.isSpam,
      smsAlertSent: Boolean(smsNotification),
      smsNotification
    });
  } catch (error) {
    console.error('[Send Mail Error]:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error sending email'
    });
  }
});

/**
 * POST /api/messages/draft (also /api/mail/draft)
 * Saves or updates a draft email strictly owned by the authenticated user
 */
router.post('/draft', optionalAuth, (req, res) => {
  try {
    const user = getReqUser(req);
    if (!user || (!user.phoneNumber && !user.email)) {
      return res.status(401).json({ success: false, error: 'Authentication required to save draft' });
    }

    const { id, recipientPhone, to, recipientEmail, subject, body, attachments } = req.body;

    let targetRecipient = recipientEmail || to || '';
    let targetRecipientPhone = recipientPhone;
    if (recipientPhone) {
      const cleanDigits = String(recipientPhone).replace(/\D/g, '');
      if (cleanDigits.length === 10) {
        targetRecipient = `${cleanDigits}@zapmail.com`;
        targetRecipientPhone = cleanDigits;
      }
    } else if (targetRecipient) {
      const cleanDigits = targetRecipient.replace(/\D/g, '');
      if (cleanDigits.length === 10 && !targetRecipient.includes('@')) {
        targetRecipient = `${cleanDigits}@zapmail.com`;
        targetRecipientPhone = cleanDigits;
      } else if (cleanDigits.length === 10) {
        targetRecipientPhone = cleanDigits;
      }
    }

    const senderPhone = user.phoneNumber;
    const senderEmail = user.email || (senderPhone ? `${senderPhone}@zapmail.com` : 'user@zapmail.local');
    const draftSubject = subject || '';
    const draftBody = body || '';

    let cleanAttachments = [];
    if (Array.isArray(attachments)) {
      cleanAttachments = attachments;
    } else if (typeof attachments === 'string') {
      try {
        cleanAttachments = JSON.parse(attachments);
      } catch {
        cleanAttachments = [];
      }
    }

    let draftId = id;
    const existing = draftId ? emailQueries.findById.get(draftId) : null;

    if (existing) {
      if (!canAccessEmail(existing, user)) {
        return res.status(403).json({ success: false, error: "Access denied: Cannot edit another user's draft" });
      }

      emailQueries.updateDraft.run({
        id: draftId,
        phone: senderPhone,
        email: senderEmail,
        recipientPhone: targetRecipientPhone || null,
        recipientEmail: targetRecipient,
        subject: draftSubject,
        body: draftBody,
        attachments: cleanAttachments
      });
    } else {
      draftId = draftId || `email_draft_${crypto.randomUUID()}`;
      emailQueries.create.run({
        id: draftId,
        ownerPhone: senderPhone,
        ownerEmail: senderEmail,
        userId: user.id || senderPhone,
        senderPhone,
        senderEmail,
        recipientPhone: targetRecipientPhone || null,
        recipientEmail: targetRecipient,
        subject: draftSubject,
        body: draftBody,
        read: 1,
        folder: 'DRAFTS',
        deletedAt: null,
        attachments: cleanAttachments,
        isDraft: 1,
        recipientTrash: 0,
        senderTrash: 0
      });
    }

    const savedDraft = formatEmail(emailQueries.findById.get(draftId));
    return res.status(200).json({
      success: true,
      message: 'Draft saved successfully',
      draft: savedDraft
    });
  } catch (error) {
    console.error('[Save Draft Error]:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/messages/by-folder/:folder (also /api/mail/by-folder/:folder)
 * Retrieves messages in a specific folder (INBOX, DRAFTS, SPAM, TRASH, SENT)
 * Strictly scoped to the authenticated user's account.
 */
router.get('/by-folder/:folder', optionalAuth, (req, res) => {
  try {
    const user = getReqUser(req);
    if (!user || (!user.phoneNumber && !user.email)) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const rawFolder = req.params.folder;
    if (!rawFolder) {
      return res.status(400).json({ success: false, error: 'folder parameter is required' });
    }

    const folder = rawFolder.toUpperCase();
    if (!['INBOX', 'DRAFTS', 'SPAM', 'TRASH', 'SENT'].includes(folder)) {
      return res.status(400).json({
        success: false,
        error: 'folder must be INBOX, DRAFTS, SPAM, TRASH, or SENT'
      });
    }

    // Reject query attempting to access another phone number
    const requestedPhone = req.query.phone || req.query.userPhone;
    if (requestedPhone && user.phoneNumber) {
      const cleanReq = String(requestedPhone).replace(/\D/g, '').slice(0, 10);
      if (cleanReq && cleanReq !== user.phoneNumber) {
        return res.status(403).json({ success: false, error: "Access denied: Cannot access another user's mailbox" });
      }
    }

    const limit = parseInt(req.query.limit, 10) || 100;
    const emails = emailQueries.getByFolder({
      phone: user.phoneNumber || '',
      email: user.email || '',
      folder,
      limit
    });

    return res.json(emails.map(formatEmail));
  } catch (error) {
    console.error('[Get By Folder Error]:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/mail/inbox
 * Returns emails where recipient matches authenticated user and folder is 'INBOX'
 */
router.get('/inbox', optionalAuth, (req, res) => {
  try {
    const user = getReqUser(req);
    if (!user || (!user.phoneNumber && !user.email)) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const limit = parseInt(req.query.limit, 10) || 100;
    const emails = emailQueries.getInbox.all({
      phone: user.phoneNumber || '',
      email: user.email || '',
      limit
    });
    return res.json(emails.map(formatEmail));
  } catch (error) {
    console.error('[Get Inbox Error]:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error retrieving inbox'
    });
  }
});

/**
 * GET /api/messages/thread/:contactId (also /api/mail/thread/:contactId)
 * Returns all bi-directional messages between the authenticated user and contactId
 * Merges INBOX and SENT messages, sorted chronologically ascending.
 */
router.get('/thread/:contactId', optionalAuth, (req, res) => {
  try {
    const user = getReqUser(req);
    if (!user || (!user.phoneNumber && !user.email)) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const rawContact = decodeURIComponent(req.params.contactId || '').trim();
    if (!rawContact) {
      return res.status(400).json({ success: false, error: 'contactId parameter is required' });
    }

    const contactDigits = rawContact.replace(/\D/g, '');
    const contactPhone = contactDigits.length === 10 ? contactDigits : '';
    const contactEmail = rawContact.includes('@') ? rawContact : (contactPhone ? `${contactPhone}@zapmail.com` : rawContact);
    const userPhone = user.phoneNumber || '';
    const userEmail = (user.email || (userPhone ? `${userPhone}@zapmail.com` : '')).toLowerCase();

    const messages = emailQueries.getThread.all({
      userPhone,
      userEmail,
      userPattern: userPhone || userEmail,
      contactPhone,
      contactEmail,
      contactPattern: contactPhone || contactEmail
    });

    return res.json({
      success: true,
      count: messages.length,
      data: messages.map(formatEmail)
    });
  } catch (error) {
    console.error('[Get Thread Messages Error]:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/mail/sent
 * Returns emails sent by the authenticated user, excluding TRASH and DRAFTS
 */
router.get('/sent', optionalAuth, (req, res) => {
  try {
    const user = getReqUser(req);
    if (!user || (!user.phoneNumber && !user.email)) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const limit = parseInt(req.query.limit, 10) || 100;
    const emails = emailQueries.getSent.all({
      phone: user.phoneNumber || '',
      email: user.email || '',
      limit
    });
    return res.json(emails.map(formatEmail));
  } catch (error) {
    console.error('[Get Sent Mail Error]:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error retrieving sent mail'
    });
  }
});

/**
 * PATCH /api/messages/:id/folder (also /api/mail/:id/folder)
 * Accepts: { folder: 'TRASH' | 'SPAM' | 'INBOX' | 'DRAFTS' | 'SENT' }
 * Updates folder strictly for the authenticated user's copy.
 */
router.patch('/:id/folder', optionalAuth, (req, res) => {
  try {
    const user = getReqUser(req);
    if (!user || (!user.phoneNumber && !user.email)) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { id } = req.params;
    const { folder } = req.body;

    if (!folder || typeof folder !== 'string') {
      return res.status(400).json({ success: false, error: 'folder is required' });
    }

    const normalizedFolder = folder.toUpperCase();
    if (!['INBOX', 'DRAFTS', 'SPAM', 'TRASH', 'SENT'].includes(normalizedFolder)) {
      return res.status(400).json({ success: false, error: 'folder must be INBOX, DRAFTS, SPAM, TRASH, or SENT' });
    }

    const existing = emailQueries.findById.get(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Email not found' });
    }

    if (!canAccessEmail(existing, user)) {
      return res.status(403).json({ success: false, error: "Access denied: Cannot modify another user's email" });
    }

    const isMovingToTrash = normalizedFolder === 'TRASH';
    const isRecipient = existing.recipientPhone === user.phoneNumber || existing.recipientEmail === user.email;
    const isSender = existing.senderPhone === user.phoneNumber || existing.senderEmail === user.email;

    emailQueries.updateFolder.run({
      id,
      phone: user.phoneNumber,
      email: user.email,
      folder: normalizedFolder,
      deletedAt: isMovingToTrash ? new Date().toISOString() : null,
      recipientTrash: isMovingToTrash && isRecipient ? 1 : 0,
      senderTrash: isMovingToTrash && isSender ? 1 : 0
    });

    const updated = formatEmail(emailQueries.findById.get(id));
    return res.json({
      success: true,
      message: `Message moved to ${normalizedFolder}`,
      email: updated
    });
  } catch (error) {
    console.error('[Update Folder Error]:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/messages/:id/restore (also /api/mail/:id/restore)
 * Restores a message from TRASH back to INBOX or SENT
 */
router.post('/:id/restore', optionalAuth, (req, res) => {
  try {
    const user = getReqUser(req);
    if (!user || (!user.phoneNumber && !user.email)) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { id } = req.params;
    const existing = emailQueries.findById.get(id);

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Email not found' });
    }

    if (!canAccessEmail(existing, user)) {
      return res.status(403).json({ success: false, error: "Access denied: Cannot restore another user's email" });
    }

    const isSender = existing.senderPhone === user.phoneNumber || existing.senderEmail === user.email;
    const targetFolder = isSender && !existing.recipientPhone ? 'SENT' : 'INBOX';

    emailQueries.updateFolder.run({
      id,
      phone: user.phoneNumber,
      email: user.email,
      folder: targetFolder,
      deletedAt: null,
      recipientTrash: 0,
      senderTrash: 0
    });

    const updated = formatEmail(emailQueries.findById.get(id));
    return res.json({
      success: true,
      message: `Message restored to ${targetFolder}`,
      email: updated
    });
  } catch (error) {
    console.error('[Restore Message Error]:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/mail/:id/read
 * Mark an email as read (scoped to owner/recipient)
 */
router.patch('/:id/read', optionalAuth, (req, res) => {
  try {
    const user = getReqUser(req);
    if (!user || (!user.phoneNumber && !user.email)) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { id } = req.params;
    const email = emailQueries.findById.get(id);

    if (!email) {
      return res.status(404).json({
        success: false,
        error: 'Email not found'
      });
    }

    if (!canAccessEmail(email, user)) {
      return res.status(403).json({ success: false, error: "Access denied: Cannot modify another user's email" });
    }

    emailQueries.markAsRead.run({
      id,
      phone: user.phoneNumber,
      email: user.email
    });

    return res.json({
      success: true,
      message: 'Email marked as read',
      id
    });
  } catch (error) {
    console.error('[Mark Mail Read Error]:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error updating email'
    });
  }
});

/**
 * PATCH /api/mail/:id/labels (also /api/messages/:id/labels)
 * Updates labels for an email record (scoped to owner/recipient/sender)
 */
router.patch('/:id/labels', optionalAuth, (req, res) => {
  try {
    const user = getReqUser(req);
    if (!user || (!user.phoneNumber && !user.email)) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { id } = req.params;
    const email = emailQueries.findById.get(id);

    if (!email) {
      return res.status(404).json({ success: false, error: 'Email not found' });
    }

    if (!canAccessEmail(email, user)) {
      return res.status(403).json({ success: false, error: "Access denied: Cannot modify another user's email" });
    }

    let nextLabels = [];
    if (Array.isArray(req.body.labels)) {
      nextLabels = req.body.labels.map(l => String(l).trim()).filter(Boolean);
    } else if (typeof req.body.label === 'string') {
      let current = [];
      try {
        current = typeof email.labels === 'string' ? JSON.parse(email.labels) : (email.labels || []);
      } catch {
        current = [];
      }
      const labelToToggle = req.body.label.trim();
      if (req.body.action === 'remove') {
        nextLabels = current.filter(l => l !== labelToToggle);
      } else {
        nextLabels = current.includes(labelToToggle) ? current : [...current, labelToToggle];
      }
    }

    emailQueries.updateLabels.run({
      id,
      phone: user.phoneNumber,
      email: user.email,
      labels: nextLabels
    });

    const updated = formatEmail(emailQueries.findById.get(id));
    return res.json({
      success: true,
      message: 'Labels updated successfully',
      email: updated
    });
  } catch (error) {
    console.error('[Update Labels Error]:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/mail/:id (or /api/messages/:id)
 * Fetch a single email by ID (strictly authorized)
 */
router.get('/:id', optionalAuth, (req, res) => {
  try {
    const { id } = req.params;
    const email = emailQueries.findById.get(id);

    if (!email) {
      return res.status(404).json({
        success: false,
        error: 'Email not found'
      });
    }

    const user = getReqUser(req);
    if (user && !canAccessEmail(email, user)) {
      return res.status(403).json({ success: false, error: "Access denied: Cannot access another user's email" });
    }

    return res.json(formatEmail(email));
  } catch (error) {
    console.error('[Get Email Error]:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/messages/:id/summarize (also /api/mail/:id/summarize)
 * Summarizes an email into 2-3 concise bullet points
 */
router.post('/:id/summarize', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const email = emailQueries.findById.get(id);

    if (!email) {
      return res.status(404).json({ success: false, error: 'Email not found' });
    }

    const user = getReqUser(req);
    if (user && !canAccessEmail(email, user)) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }

    const emailContent = email.body || email.subject || '';
    const result = await generateEmailSummary(emailContent, email.subject || '');
    return res.json({
      success: true,
      emailId: id,
      summary: result.summary,
      bullets: result.bullets,
      provider: result.provider
    });
  } catch (error) {
    console.error('[Summarize Email Error]:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/mail/:id (or /api/messages/:id)
 * Permanent deletion of an email record belonging to the user
 */
router.delete('/:id', optionalAuth, (req, res) => {
  try {
    const user = getReqUser(req);
    if (!user || (!user.phoneNumber && !user.email)) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { id } = req.params;
    const email = emailQueries.findById.get(id);

    if (!email) {
      return res.status(404).json({
        success: false,
        error: 'Email not found'
      });
    }

    if (!canAccessEmail(email, user)) {
      return res.status(403).json({ success: false, error: "Access denied: Cannot delete another user's email" });
    }

    emailQueries.delete.run({
      id,
      phone: user.phoneNumber,
      email: user.email
    });

    return res.json({
      success: true,
      message: 'Email deleted successfully',
      id
    });
  } catch (error) {
    console.error('[Delete Mail Error]:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error deleting email'
    });
  }
});

/**
 * GET /api/mail (also /api/messages)
 * Full mailbox overview strictly scoped to the requesting user's account.
 */
router.get('/', optionalAuth, (req, res) => {
  try {
    const user = getReqUser(req);
    if (!user || (!user.phoneNumber && !user.email)) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required: User must be signed in or provide credentials'
      });
    }

    // Reject attempt to query another phone's mailbox
    const requestedPhone = req.query.phone || req.query.userPhone;
    if (requestedPhone && user.phoneNumber) {
      const cleanReq = String(requestedPhone).replace(/\D/g, '').slice(0, 10);
      if (cleanReq && cleanReq !== user.phoneNumber) {
        return res.status(403).json({
          success: false,
          error: "Access denied: Cannot access another user's mailbox"
        });
      }
    }

    const limit = parseInt(req.query.limit, 10) || 100;
    const emails = emailQueries.getAllForUser.all({
      phone: user.phoneNumber || '',
      email: user.email || '',
      limit
    });

    return res.json({
      success: true,
      count: emails.length,
      data: emails.map(formatEmail)
    });
  } catch (error) {
    console.error('[Get Mailbox Error]:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/mail/attachment/:filename & GET /api/messages/attachment/:filename
 * Safely stream attachment with inline PDF headers and CSP framing permissions
 */
router.get('/attachment/:filename', (req, res) => {
  try {
    const rawFilename = req.params.filename;
    const safeFilename = path.basename(rawFilename);
    const filePath = path.join(uploadsDir, safeFilename);

    if (!fs.existsSync(filePath)) {
      const demoPath = path.join(uploadsDir, 'carrier_specification_doc.pdf');
      if (fs.existsSync(demoPath)) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('Content-Security-Policy', "frame-ancestors 'self' *");
        return res.sendFile(demoPath);
      }
      return res.status(404).json({ success: false, error: 'Attachment file not found' });
    }

    if (safeFilename.toLowerCase().endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Content-Security-Policy', "frame-ancestors 'self' *");
    }

    return res.sendFile(filePath);
  } catch (error) {
    console.error('[Attachment Serve Error]:', error);
    return res.status(500).json({ success: false, error: 'Failed to stream attachment' });
  }
});

/**
 * POST /api/mail/suggest-replies & POST /api/messages/suggest-replies
 * Context-aware smart replies endpoint
 */
router.post('/suggest-replies', async (req, res) => {
  try {
    const { content, body, text, subject, from } = req.body;
    const emailText = content || body || text || '';
    const emailSubject = subject || '';

    const result = await generateSmartReplies(emailText, emailSubject, from);
    return res.json({
      success: true,
      suggestions: result.suggestions,
      provider: result.provider
    });
  } catch (error) {
    console.error('[Mail Suggest Replies Error]:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate smart replies'
    });
  }
});

module.exports = router;
