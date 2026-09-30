require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');

const { db, emailQueries, smsQueries, userQueries } = require('./db');
const authRouter = require('./routes/auth');
const telecomRouter = require('./routes/telecom');
const mailRouter = require('./routes/mail');
const aiRouter = require('./routes/ai');
const { notifyViaSms, checkAndNotifyRecipient } = require('./services/telecom');
const { isSpam } = require('./services/spamDetector');

const app = express();
const PORT = process.env.PORT || 5000;
const SMTP_PORT = process.env.SMTP_PORT || 2525;

// Ensure uploads directory exists for attachment file storage
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Static serving for uploaded email attachments (PDFs, images, documents) with inline PDF display & CSP framing
app.use(
  '/uploads',
  (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self' *");
    if (req.path.toLowerCase().endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
    }
    next();
  },
  express.static(uploadsDir, {
    setHeaders: (res, filePath) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Security-Policy', "frame-ancestors 'self' *");
      if (filePath.toLowerCase().endsWith('.pdf')) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline');
      }
    }
  })
);

// Mount Routers
app.use('/api/auth', authRouter);
app.use('/api/telecom', telecomRouter);
app.use('/api/mail', mailRouter);
app.use('/api/messages', mailRouter); // Full mailbox & messages router
app.use('/api/emails', mailRouter); // Backward compatibility
app.use('/api/ai', aiRouter);

// Base API Health Route with Database Stats
app.get('/api/health', (req, res) => {
  try {
    const userCount = db.prepare('SELECT COUNT(*) as count FROM User').get().count;
    const emailCount = db.prepare('SELECT COUNT(*) as count FROM Email').get().count;
    const smsCount = db.prepare('SELECT COUNT(*) as count FROM SmsLog').get().count;

    res.json({
      status: 'ok',
      service: 'ZapMail Backend & Telecom Engine',
      port: PORT,
      smtpPort: SMTP_PORT,
      database: 'SQLite (dev.db)',
      counts: {
        users: userCount,
        emails: emailCount,
        smsLogs: smsCount
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});


// Legacy / Direct SMS Logs Endpoint (also available at /api/telecom/sms-logs)
app.get('/api/sms-logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const logs = smsQueries.list.all(limit);
    res.json({
      success: true,
      count: logs.length,
      data: logs
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint to simulate/test sending an email to the embedded SMTP server
app.post('/api/send-test-email', async (req, res) => {
  try {
    const { from, to, subject, text } = req.body;

    const transporter = nodemailer.createTransport({
      host: '127.0.0.1',
      port: Number(SMTP_PORT),
      secure: false,
      ignoreTLS: true
    });

    const info = await transporter.sendMail({
      from: from || 'caller@zapmail.com',
      to: to || 'inbox@zapmail.com',
      subject: subject || 'ZapMail Test Message',
      text: text || 'Hello from ZapMail embedded SMTP test!'
    });

    res.json({
      success: true,
      messageId: info.messageId,
      detail: 'Email dispatched to embedded SMTP server on port 2525'
    });
  } catch (error) {
    console.error('[API] Error dispatching test email:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// -------------------------------------------------------------
// Embedded SMTP Server Configuration with Inbound Parser Hook
// -------------------------------------------------------------
const smtpServer = new SMTPServer({
  // Disable authentication requirement for local dev & testing
  authOptional: true,
  disabledCommands: ['AUTH'],
  secure: false,

  onConnect(session, callback) {
    console.log(`[SMTP] Client connected: ${session.remoteAddress}`);
    return callback();
  },

  onMailFrom(address, session, callback) {
    return callback();
  },

  onRcptTo(address, session, callback) {
    return callback();
  },

  onData(stream, session, callback) {
    simpleParser(stream, (err, parsed) => {
      if (err) {
        console.error('[SMTP] Error parsing incoming email:', err);
        return callback(err);
      }

      const sender = parsed.from?.text || parsed.from?.value?.[0]?.address || 'Unknown Sender';
      const recipient = parsed.to?.text || 
        (Array.isArray(parsed.to?.value) ? parsed.to.value.map(v => v.address).join(', ') : 'Unknown Recipient');
      const subject = parsed.subject || '(No Subject)';
      const body = parsed.text || parsed.html || '';

      console.log('\n========================================');
      console.log('📬 [ZapMail SMTP] Incoming Email Received');
      console.log(`From:    ${sender}`);
      console.log(`To:      ${recipient}`);
      console.log(`Subject: ${subject}`);
      console.log(`Date:    ${parsed.date || new Date().toISOString()}`);
      console.log('========================================\n');

      const emailId = parsed.messageId || `email_${crypto.randomUUID()}`;

      try {
        // 1. Process attachments if present
        const attachments = [];
        if (Array.isArray(parsed.attachments) && parsed.attachments.length > 0) {
          for (const att of parsed.attachments) {
            try {
              const ext = path.extname(att.filename || '') || '';
              const safeName = `att_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
              const filePath = path.join(uploadsDir, safeName);
              fs.writeFileSync(filePath, att.content);
              attachments.push({
                id: `att_${crypto.randomUUID()}`,
                filename: att.filename || safeName,
                mimeType: att.contentType || 'application/octet-stream',
                size: att.size || (att.content ? att.content.length : 0),
                url: `/uploads/${safeName}`
              });
            } catch (attErr) {
              console.error('[SMTP Attachment Save Error]:', attErr);
            }
          }
        }

        // 2. Automated Spam Detection
        const spamCheck = isSpam({ subject, body, senderEmail: sender });
        const folder = spamCheck.isSpam ? 'SPAM' : 'INBOX';

        if (spamCheck.isSpam) {
          console.warn(`🚨 [ZapMail Spam Detector] Inbound email flagged as SPAM: ${spamCheck.reason}`);
        }

        // 3. Resolve recipient user & phones
        let recipientPhone = null;
        const cleanDigits = recipient.replace(/\D/g, '');
        if (cleanDigits.length === 10) {
          recipientPhone = cleanDigits;
        } else {
          const match = recipient.match(/(\d{10})@(zapmail|phonemail)/i);
          if (match) recipientPhone = match[1];
        }

        let recipientUser = userQueries.findByEmail.get(recipient);
        if (!recipientUser && recipientPhone) {
          recipientUser = userQueries.findByPhone.get(recipientPhone);
        }
        const resolvedRecipientPhone = recipientPhone || (recipientUser ? recipientUser.phoneNumber : null);
        const senderPhoneMatch = sender.match(/(\d{10})/);
        const senderPhone = senderPhoneMatch ? senderPhoneMatch[1] : null;

        // 4. Store email into the Email table in SQLite as RECIPIENT COPY
        emailQueries.create.run({
          id: emailId,
          ownerPhone: resolvedRecipientPhone,
          ownerEmail: recipient,
          userId: recipientUser ? recipientUser.id : resolvedRecipientPhone,
          senderPhone,
          senderEmail: sender,
          recipientPhone: resolvedRecipientPhone,
          recipientEmail: recipient,
          subject: subject,
          body: body,
          read: 0,
          folder: folder,
          deletedAt: null,
          attachments: attachments,
          isDraft: 0,
          recipientTrash: 0,
          senderTrash: 0
        });

        // 4. Automatically trigger SMS notification hook for non-spam emails only
        if (!spamCheck.isSpam) {
          checkAndNotifyRecipient({
            recipientEmail: recipient,
            senderEmail: sender,
            subject: subject
          });
        } else {
          console.log(`🛡️ [PhoneMail Spam Gatekeeper] Suppressed SMS notification for spam message to ${recipient}`);
        }
      } catch (dbErr) {
        console.error('[Database Error during email persist]:', dbErr);
      }

      callback(null, 'OK');
    });
  }
});

smtpServer.on('error', (err) => {
  console.error('[SMTP Server Error]:', err);
});

// Start Express HTTP Server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 [HTTP] PhoneMail API Server listening on http://0.0.0.0:${PORT} (all interfaces)`);
});

// Start Embedded SMTP Server
smtpServer.listen(SMTP_PORT, '0.0.0.0', () => {
  console.log(`📧 [SMTP] PhoneMail Embedded SMTP Server listening on port ${SMTP_PORT} (0.0.0.0)`);
});

module.exports = { app, server, smtpServer, notifyViaSms };
