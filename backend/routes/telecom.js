const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db, userQueries, smsQueries } = require('../db');
const { notifyViaSms, processSmsReply } = require('../services/telecomService');

const router = express.Router();



/**
 * POST /api/telecom/sms-inbound
 * Accepts: { senderPhone, text }
 */
router.post('/sms-inbound', async (req, res) => {
  try {
    const { senderPhone, text } = req.body;

    if (!senderPhone) {
      return res.status(400).json({
        success: false,
        error: 'senderPhone is required'
      });
    }

    const cleanPhone = String(senderPhone).trim().replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      return res.status(400).json({
        success: false,
        error: 'senderPhone must be exactly 10 digits'
      });
    }

    const command = String(text || '').trim().toUpperCase();

    if (command === 'REGISTER') {
      const existingUser = userQueries.findByPhone.get(cleanPhone);
      const email = `${cleanPhone}@zapmail.com`;

      if (!existingUser) {
        const defaultPin = '1234';
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(defaultPin, salt);

        const newId = crypto.randomUUID();
        userQueries.create.run({
          id: newId,
          phoneNumber: cleanPhone,
          email,
          passwordHash,
          registeredVia: 'IVR'
        });

        const confirmMsg = `Welcome to ZapMail! Your email address is ${email}`;

        // Store confirmation SMS
        smsQueries.create.run({
          id: `sms_${crypto.randomUUID()}`,
          recipientPhone: cleanPhone,
          senderEmail: 'system@zapmail.com',
          subject: 'ZapMail Registration Confirmed',
          message: confirmMsg
        });

        console.log(`💬 [SMS Inbound] Auto-created user for phone: ${cleanPhone} via SMS keyword REGISTER`);

        return res.json({
          success: true,
          message: confirmMsg
        });
      } else {
        return res.json({
          success: true,
          message: `Account already exists for ${email}`,
          isExisting: true
        });
      }
    }

    return res.json({
      success: false,
      message: 'Unrecognized keyword. Text REGISTER to activate your ZapMail address.'
    });
  } catch (error) {
    console.error('[SMS Inbound Error]:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error processing incoming SMS'
    });
  }
});

/**
 * GET /api/telecom/sms-logs
 * Returns an array of all simulated SMS notification messages sent by the system
 */
router.get('/sms-logs', (req, res) => {
  try {
    const logs = db.prepare(`
      SELECT id, recipientPhone, senderEmail, subject, message, timestamp 
      FROM SmsLog 
      ORDER BY timestamp DESC
    `).all();

    return res.json(logs);
  } catch (error) {
    console.error('[Get SMS Logs Error]:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error retrieving SMS logs'
    });
  }
});

/**
 * POST /api/telecom/sms-reply
 * Simulates replying to an email purely via an SMS action.
 * Converts incoming carrier SMS into an outgoing email record.
 * Accepts: { senderPhone, text, replyToEmail, subject, originalEmailId }
 */
router.post('/sms-reply', async (req, res) => {
  try {
    const {
      senderPhone,
      callerPhone,
      text,
      replyText,
      message,
      replyToEmail,
      subject,
      originalEmailId
    } = req.body;

    const phone = senderPhone || callerPhone;
    const bodyText = text || replyText || message;

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'senderPhone is required'
      });
    }

    if (!bodyText || !String(bodyText).trim()) {
      return res.status(400).json({
        success: false,
        error: 'text (SMS message content) is required'
      });
    }

    const result = await processSmsReply({
      senderPhone: phone,
      text: bodyText,
      replyToEmail,
      subject,
      originalEmailId
    });

    return res.status(201).json(result);
  } catch (error) {
    console.error('[SMS Reply Error]:', error);
    return res.status(400).json({
      success: false,
      error: error.message || 'Failed to process SMS reply'
    });
  }
});

module.exports = router;
