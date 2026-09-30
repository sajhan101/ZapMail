const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { userQueries, smsQueries, findUserByPhone } = require('../db');
const { authenticateToken, optionalAuth, JWT_SECRET } = require('../middleware/auth');
const { sendOtpSms, sendSms, formatE164, sanitizePhoneNumber, strip91 } = require('../services/textbeeService');

const router = express.Router();

const avatarUploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(avatarUploadsDir)) {
  fs.mkdirSync(avatarUploadsDir, { recursive: true });
}

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, avatarUploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.png';
    const unique = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    cb(null, `avatar_${unique}${ext}`);
  }
});
const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

const VALID_REGISTERED_VIA = ['MOBILE_APP', 'WEB', 'PHONE_CALL', 'WEB_CLIENT', 'WEB_PORTAL', 'IVR'];

// Temporary in-memory OTP map: key = 10-digit clean phone, value = { otp, expiresAt, name, createdAt }
const otpStore = new Map();
const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

// Periodic cleanup of expired OTP entries
setInterval(() => {
  const now = Date.now();
  for (const [phone, data] of otpStore.entries()) {
    if (data.expiresAt < now) {
      otpStore.delete(phone);
    }
  }
}, 60 * 1000);

/**
 * POST /api/auth/register
 * Accepts: { name, phoneNumber, password, registeredVia, avatarUrl, language }
 */
router.post('/register', async (req, res) => {
  try {
    const { name, phoneNumber, password, registeredVia, avatarUrl } = req.body;

    // Validate phone number presence
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required'
      });
    }

    // Validate that phoneNumber is 10 digits
    const cleanedPhone = String(phoneNumber).trim().replace(/\D/g, '');
    if (cleanedPhone.length !== 10) {
      return res.status(400).json({
        success: false,
        error: 'Phone number must be exactly 10 digits'
      });
    }

    // Validate password
    if (!password || typeof password !== 'string' || password.length < 4) {
      return res.status(400).json({
        success: false,
        error: 'Password is required and must be at least 4 characters long'
      });
    }

    // Validate registeredVia channel
    const rawChannel = registeredVia ? String(registeredVia).toUpperCase() : 'WEB';
    const channel = rawChannel === 'MOBILE_APP' ? 'MOBILE_APP' : (rawChannel === 'PHONE_CALL' ? 'PHONE_CALL' : 'WEB');

    // Check for duplicate phone number (all formats: raw, +91, @zapmail.com)
    const existingByPhone = findUserByPhone(cleanedPhone);
    if (existingByPhone) {
      return res.status(409).json({
        success: false,
        code: 'USER_EXISTS',
        message: 'An account with this phone number already exists. Please sign in.',
        error: 'An account with this phone number already exists. Please sign in.'
      });
    }

    // Auto-assign email as `${phoneNumber}@zapmail.com`
    const autoEmail = `${cleanedPhone}@zapmail.com`;
    const existingByEmail = userQueries.findByEmail.get(autoEmail);
    if (existingByEmail) {
      return res.status(409).json({
        success: false,
        code: 'USER_EXISTS',
        message: 'An account with this phone number already exists. Please sign in.',
        error: 'An account with this phone number already exists. Please sign in.'
      });
    }

    // Hash password with bcryptjs
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Save user to SQLite database
    const userId = crypto.randomUUID();
    const userName = name && typeof name === 'string' && name.trim() ? name.trim() : 'ZapMail User';
    const userAvatar = avatarUrl && typeof avatarUrl === 'string' ? avatarUrl.trim() : null;
    const userLanguage = req.body.language || req.body.preferredLanguage || 'English';

    userQueries.create.run({
      id: userId,
      name: userName,
      phoneNumber: cleanedPhone,
      email: autoEmail,
      passwordHash,
      avatarUrl: userAvatar,
      registeredVia: channel,
      language: userLanguage
    });

    const createdUser = userQueries.findById.get(userId);

    // Sign JWT token
    const token = jwt.sign(
      {
        id: createdUser.id,
        phoneNumber: createdUser.phoneNumber,
        email: createdUser.email
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: createdUser
    });
  } catch (error) {
    console.error('[Auth Register Error]:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error during registration'
    });
  }
});

/**
 * POST /api/auth/login
 * Accepts: { phoneNumber, password }
 */
router.post('/login', async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;

    if (!phoneNumber || !password) {
      return res.status(400).json({
        success: false,
        error: 'Phone number and password are required'
      });
    }

    const cleanedPhone = String(phoneNumber).trim().replace(/\D/g, '');
    if (cleanedPhone.length !== 10) {
      return res.status(400).json({
        success: false,
        error: 'Phone number must be exactly 10 digits'
      });
    }

    // Find user by phone number (matches raw, +91, @zapmail.com formats)
    const user = findUserByPhone(cleanedPhone);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid phone number or password'
      });
    }

    // Verify credentials
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid phone number or password'
      });
    }

    // Generate signed JWT token
    const token = jwt.sign(
      {
        id: user.id,
        phoneNumber: user.phoneNumber,
        email: user.email
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name || 'ZapMail User',
        phoneNumber: user.phoneNumber,
        email: user.email,
        avatarUrl: user.avatarUrl || null,
        language: user.language || 'English',
        registeredVia: user.registeredVia,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('[Auth Login Error]:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error during login'
    });
  }
});

/**
 * GET /api/auth/me
 * Protected route using JWT middleware
 */
router.get('/me', authenticateToken, (req, res) => {
  try {
    const user = userQueries.findById.get(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    return res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('[Auth /me Error]:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error retrieving user profile'
    });
  }
});

/**
 * POST /api/auth/check-user
 * Verifies whether a phone number is registered in PhoneMail.
 * Accepts: { phoneNumber }
 * Returns: { success: true, exists: boolean, user: { phoneNumber, email } | null }
 */
router.post('/check-user', (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ success: false, error: 'Phone number is required' });
    }
    const cleanPhone = String(phoneNumber).trim().replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10) {
      return res.status(400).json({ success: false, error: 'Phone number must be at least 10 digits' });
    }

    const user = findUserByPhone(cleanPhone);
    return res.json({
      success: true,
      exists: Boolean(user),
      user: user ? { id: user.id, phoneNumber: user.phoneNumber, email: user.email } : null
    });
  } catch (error) {
    console.error('[Check User Error]:', error);
    return res.status(500).json({ success: false, error: 'Internal server error checking user' });
  }
});

/**
 * POST /api/auth/step1-credentials
 * Mandatory 2-Step Authentication - Step 1:
 * Accepts: { phoneNumber, password, countryCode }
 * 1. Checks if user already exists:
 *    - If exists: verifies password against stored hash. If mismatch -> 401. If match -> dispatches OTP.
 *    - If new user: validates password length (>=4), dispatches OTP to verify phone number.
 * 2. Returns: { success: true, isNewUser: boolean, message: string, phoneNumber: string }
 */
router.post('/step1-credentials', async (req, res) => {
  try {
    const { name, phoneNumber, password, countryCode = '+91' } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ success: false, error: 'Phone number is required' });
    }

    const rawDigits = String(phoneNumber).trim().replace(/\D/g, '');
    if (rawDigits.length < 10) {
      return res.status(400).json({ success: false, error: 'Phone number must be at least 10 digits' });
    }

    const cleanPhone = rawDigits.slice(-10);

    if (!password || typeof password !== 'string' || password.length < 4) {
      return res.status(400).json({ success: false, error: 'Password must be at least 4 characters long' });
    }

    const existingUser = findUserByPhone(cleanPhone);

    if (existingUser) {
      // Existing user: check password
      const isMatch = await bcrypt.compare(password, existingUser.passwordHash);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          error: 'Incorrect password for this account. Please try again.'
        });
      }
    }

    // Password verified or valid for new account registration -> Dispatch genuine SMS OTP
    const otp = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = Date.now() + OTP_EXPIRY_MS;

    otpStore.set(cleanPhone, {
      otp,
      expiresAt,
      name: name && typeof name === 'string' && name.trim() ? name.trim() : null,
      createdAt: Date.now()
    });

    const smsMessage = `ZapMail login pin: ${otp}`;
    const textbeeResult = await sendOtpSms(phoneNumber, otp, countryCode, {
      fallbackTo10Digit: true
    });

    const smsId = `sms_${crypto.randomUUID()}`;
    try {
      smsQueries.create.run({
        id: smsId,
        recipientPhone: cleanPhone,
        senderEmail: 'telecom@zapmail.local',
        subject: '2-Step Verification PIN',
        message: smsMessage
      });
    } catch (logErr) {
      console.warn('[Step 1 db log error]:', logErr.message);
    }

    console.log(`📲 [2-Step Auth] Credentials checked for ${cleanPhone} (isNewUser: ${!existingUser}, SMS dispatched: ${textbeeResult.success ? 'SENT' : 'QUEUED'})`);

    return res.json({
      success: true,
      isNewUser: !existingUser,
      phoneNumber: cleanPhone,
      message: existingUser
        ? `Password verified! 2-Step verification code sent via SMS to ${cleanPhone}.`
        : `Verification code sent via SMS to ${cleanPhone} to complete new account registration.`
    });
  } catch (error) {
    console.error('[Step 1 Credentials Error]:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error processing credentials'
    });
  }
});

/**
 * POST /api/auth/send-otp
 * Accepts: { phoneNumber, countryCode, stripCountryCode, strip91 }
 * Generates a cryptographically secure random 6-digit numeric OTP.
 * Stores it with a 5-minute expiration timestamp.
 * Dispatches neutralized message: "PhoneMail login pin: {otp}" via TextBee.
 * Note: Never returns the OTP or demo fallback codes in the response body.
 */
router.post('/send-otp', async (req, res) => {
  try {
    const { phoneNumber, countryCode = '+91', stripCountryCode = false, strip91 = false } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ success: false, error: 'Phone number is required' });
    }

    const rawDigits = String(phoneNumber).trim().replace(/\D/g, '');
    if (rawDigits.length < 10) {
      return res.status(400).json({ success: false, error: 'Phone number must be at least 10 digits' });
    }

    // Standard 10-digit clean phone handle
    const cleanPhone = rawDigits.slice(-10);

    // Generate cryptographically secure random 6-digit numeric OTP
    const otp = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = Date.now() + OTP_EXPIRY_MS;

    // Store in temporary in-memory map
    otpStore.set(cleanPhone, {
      otp,
      expiresAt,
      createdAt: Date.now()
    });

    // Neutralized message format to bypass carrier A2P/DLT template scrubbers
    const smsMessage = `ZapMail login pin: ${otp}`;

    // 1. Dispatch genuine SMS via TextBee Android SMS Gateway with sanitization & fallback
    const textbeeResult = await sendOtpSms(phoneNumber, otp, countryCode, {
      stripCountryCode: Boolean(stripCountryCode || strip91),
      fallbackTo10Digit: true
    });

    // 2. Also record in local database SmsLog for in-app telecom simulator audit
    const smsId = `sms_${crypto.randomUUID()}`;
    try {
      smsQueries.create.run({
        id: smsId,
        recipientPhone: cleanPhone,
        senderEmail: 'telecom@zapmail.local',
        subject: 'Login PIN',
        message: smsMessage
      });
    } catch (logErr) {
      console.warn('[Send OTP db log error]:', logErr.message);
    }

    console.log(`📲 [TextBee Auth] PIN dispatched to ${cleanPhone} (Recipient: ${textbeeResult.recipient || cleanPhone}, TextBee status: ${textbeeResult.success ? 'SENT' : 'FAILED'})`);

    // Return clean response - NEVER return OTP or demo fallback in response body
    return res.json({
      success: true,
      message: `Login PIN sent to ${cleanPhone}. Valid for 5 minutes.`,
      dispatchedVia: textbeeResult.success ? 'TEXTBEE' : 'QUEUED',
      recipient: textbeeResult.recipient,
      usedFallback: Boolean(textbeeResult.usedFallback),
      expiresIn: 300
    });
  } catch (error) {
    console.error('[Send OTP Error]:', error);
    return res.status(500).json({ success: false, error: 'Failed to generate and dispatch verification code' });
  }
});

/**
 * POST /api/auth/verify-otp
 * Accepts: { phoneNumber, otp }
 * Validates submitted code against stored OTP.
 * Rejects expired or mismatched codes.
 * On success, clears stored OTP and returns authenticated user session.
 */
router.post('/verify-otp', async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ success: false, error: 'Phone number is required' });
    }

    if (!otp || String(otp).trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Verification code (OTP) is required' });
    }

    const rawDigits = String(phoneNumber).trim().replace(/\D/g, '');
    if (rawDigits.length < 10) {
      return res.status(400).json({ success: false, error: 'Phone number must be at least 10 digits' });
    }

    const cleanPhone = rawDigits.slice(-10);
    const submittedOtp = String(otp).trim();
    const stored = otpStore.get(cleanPhone);

    if (!stored) {
      return res.status(400).json({
        success: false,
        error: 'No active verification code found for this number or code has expired. Please request a new code.'
      });
    }

    if (Date.now() > stored.expiresAt) {
      otpStore.delete(cleanPhone);
      return res.status(400).json({
        success: false,
        error: 'Verification code has expired. Please request a new code.'
      });
    }

    if (stored.otp !== submittedOtp) {
      return res.status(400).json({
        success: false,
        error: 'Invalid verification code. Please check your SMS and try again.'
      });
    }

    // Code matches! Read stored metadata and consume from memory store
    const storedName = stored ? stored.name : null;
    otpStore.delete(cleanPhone);

    // Find or auto-create user (multi-format: raw, +91, @zapmail.com)
    const autoEmail = `${cleanPhone}@zapmail.com`;
    let user = findUserByPhone(cleanPhone);
    const wasNewUser = !user;

    if (!user) {
      const { password, registeredVia, name, avatarUrl } = req.body;
      const salt = await bcrypt.genSalt(10);
      const passwordToHash = password && typeof password === 'string' && password.length >= 4
        ? password
        : crypto.randomBytes(16).toString('hex');
      const passwordHash = await bcrypt.hash(passwordToHash, salt);
      const userId = crypto.randomUUID();

      const userName = (name && typeof name === 'string' && name.trim()) || storedName || 'ZapMail User';
      const rawReg = registeredVia ? String(registeredVia).toUpperCase() : 'WEB';
      const regVia = rawReg === 'MOBILE_APP' ? 'MOBILE_APP' : (rawReg === 'PHONE_CALL' ? 'PHONE_CALL' : 'WEB');
      const userLanguage = req.body.language || req.body.preferredLanguage || 'English';
      const userAvatar = avatarUrl && typeof avatarUrl === 'string' ? avatarUrl.trim() : null;

      userQueries.create.run({
        id: userId,
        name: userName,
        phoneNumber: cleanPhone,
        email: autoEmail,
        passwordHash,
        avatarUrl: userAvatar,
        registeredVia: regVia,
        language: userLanguage
      });

      user = userQueries.findById.get(userId);
    } else if (req.body.name || req.body.avatarUrl) {
      userQueries.updateProfile.run({
        name: req.body.name || null,
        avatarUrl: req.body.avatarUrl || null,
        language: req.body.language || null,
        id: user.id,
        identifier: cleanPhone
      });
      user = userQueries.findById.get(user.id);
    }

    // Sign JWT session token
    const token = jwt.sign(
      {
        id: user.id,
        phoneNumber: user.phoneNumber,
        email: user.email
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      message: 'Phone number verified successfully',
      token,
      user: {
        id: user.id,
        name: user.name || 'ZapMail User',
        phoneNumber: user.phoneNumber,
        email: user.email,
        avatarUrl: user.avatarUrl || null,
        language: user.language || 'English',
        registeredVia: user.registeredVia,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('[Verify OTP Error]:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error verifying OTP'
    });
  }
});

/**
 * POST /api/auth/register-portal
 * Dedicated Web Account Creation Portal endpoint
 * Accepts: { phoneNumber, otp, agreedToTerms }
 */
router.post('/register-portal', async (req, res) => {
  try {
    const { name, phoneNumber, otp, agreedToTerms, language } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ success: false, error: 'Phone number is required' });
    }

    const cleanPhone = String(phoneNumber).trim().replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10) {
      return res.status(400).json({ success: false, error: 'Phone number must be exactly 10 digits' });
    }

    if (!otp || String(otp).trim().length < 4) {
      return res.status(400).json({ success: false, error: 'A valid verification code (OTP) is required' });
    }

    if (agreedToTerms === false) {
      return res.status(400).json({ success: false, error: 'You must agree to the Terms of Service' });
    }

    // Validate OTP against stored OTP if one was issued
    const submittedOtp = String(otp).trim();
    const stored = otpStore.get(cleanPhone);

    if (stored) {
      if (Date.now() > stored.expiresAt) {
        otpStore.delete(cleanPhone);
        return res.status(400).json({
          success: false,
          error: 'Verification code has expired. Please request a new code.'
        });
      }

      if (stored.otp !== submittedOtp) {
        return res.status(400).json({
          success: false,
          error: 'Invalid verification code. Please check your SMS and try again.'
        });
      }

      // Valid OTP consumed
      otpStore.delete(cleanPhone);
    } else {
      // If no OTP was stored in memory, check if user already exists (multi-format)
      const existingUser = findUserByPhone(cleanPhone);
      if (!existingUser) {
        return res.status(400).json({
          success: false,
          error: 'No active verification code found for this number. Please request an OTP first.'
        });
      }
    }

    const autoEmail = `${cleanPhone}@zapmail.com`;

    // Check if user exists (multi-format)
    let user = findUserByPhone(cleanPhone);
    if (user) {
      if (name && typeof name === 'string' && name.trim()) {
        userQueries.updateProfile.run({
          name: name.trim(),
          avatarUrl: null,
          language: language || null,
          id: user.id,
          identifier: cleanPhone
        });
        user = userQueries.findById.get(user.id);
      }

      const token = jwt.sign(
        { id: user.id, phoneNumber: user.phoneNumber, email: user.email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.status(200).json({
        success: true,
        message: `Account already exists for ${autoEmail}. Session authenticated.`,
        email: autoEmail,
        token,
        user
      });
    }

    // Hash password with bcryptjs
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(submittedOtp + 'SecurePin!', salt);

    const userId = crypto.randomUUID();
    const userName = name && typeof name === 'string' && name.trim() ? name.trim() : 'ZapMail User';
    userQueries.create.run({
      id: userId,
      name: userName,
      phoneNumber: cleanPhone,
      email: autoEmail,
      passwordHash,
      avatarUrl: null,
      registeredVia: 'WEB',
      language: language || 'English'
    });

    const createdUser = userQueries.findById.get(userId);

    // Send confirmation SMS to phone via TextBee
    const welcomeMsg = `Welcome to ZapMail! Your web portal registration is complete. Your email handle is ${autoEmail}.`;
    sendSms({ to: cleanPhone, message: welcomeMsg }).catch((err) =>
      console.warn('[TextBee Welcome SMS Error]:', err.message)
    );

    const smsId = `sms_${crypto.randomUUID()}`;
    try {
      smsQueries.create.run({
        id: smsId,
        recipientPhone: cleanPhone,
        senderEmail: 'welcome@zapmail.local',
        subject: 'Registration Confirmed',
        message: welcomeMsg
      });
    } catch (e) {
      // ignore
    }

    const token = jwt.sign(
      { id: createdUser.id, phoneNumber: createdUser.phoneNumber, email: createdUser.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      success: true,
      message: `Account created for ${autoEmail}`,
      email: autoEmail,
      token,
      user: createdUser
    });
  } catch (error) {
    console.error('[Register Portal Error]:', error);
    return res.status(500).json({ success: false, error: 'Internal server error creating portal account' });
  }
});


/**
 * GET /api/auth/demo-users
 * Returns list of accounts stored directly in SQLite dev.db (strictly dynamic, no mock accounts)
 */
router.get('/demo-users', (req, res) => {
  try {
    const dbUsers = userQueries.list.all(10);
    const users = dbUsers.map((user) => {
      const token = jwt.sign(
        { id: user.id, phoneNumber: user.phoneNumber, email: user.email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      return {
        id: user.id,
        phoneNumber: user.phoneNumber,
        email: user.email,
        name: user.name || 'ZapMail User',
        avatarUrl: user.avatarUrl || null,
        registeredVia: user.registeredVia,
        language: user.language || 'English',
        token
      };
    });

    return res.json({
      success: true,
      users
    });
  } catch (error) {
    console.error('[Demo Users Error]:', error);
    return res.status(500).json({ success: false, error: 'Failed to retrieve accounts from database' });
  }
});

/**
 * POST /api/auth/seed-demo
 * Re-runs the database seed script in-process to restore clean presentation data
 */
router.post('/seed-demo', async (req, res) => {
  try {
    const { seedDatabase } = require('../seed');
    await seedDatabase();
    return res.json({
      success: true,
      message: 'Database reset to demo state with fresh SQLite accounts.'
    });
  } catch (error) {
    console.error('[Seed Demo Error]:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/auth/upload-avatar
 * Accepts multipart/form-data with field 'avatar' or JSON base64 dataUrl
 * Returns previewable URL /uploads/<filename>
 */
router.post('/upload-avatar', optionalAuth, (req, res) => {
  if (req.is('multipart/form-data')) {
    avatarUpload.single('avatar')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ success: false, error: err.message });
      } else if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No avatar image file provided' });
      }

      const avatarUrl = `/uploads/${req.file.filename}`;

      // If user is authenticated, update their record in DB immediately
      if (req.user?.id) {
        try {
          userQueries.updateProfile.run({
            name: null,
            avatarUrl,
            language: null,
            id: req.user.id,
            identifier: req.user.phoneNumber || ''
          });
        } catch (dbErr) {
          console.warn('[Avatar Upload DB Sync Error]:', dbErr.message);
        }
      }

      return res.status(201).json({
        success: true,
        avatarUrl,
        message: 'Avatar image uploaded successfully'
      });
    });
  } else {
    // JSON base64 dataUrl upload
    try {
      const { dataUrl, base64, mimeType } = req.body;
      let rawBase64 = base64;
      let ext = '.png';

      if (dataUrl && typeof dataUrl === 'string') {
        const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
        if (matches) {
          ext = `.${matches[1].replace('jpeg', 'jpg')}`;
          rawBase64 = matches[2];
        } else {
          // Store base64 data URL directly
          return res.status(201).json({
            success: true,
            avatarUrl: dataUrl,
            message: 'Avatar data URL received'
          });
        }
      }

      if (!rawBase64) {
        return res.status(400).json({ success: false, error: 'Avatar image data required' });
      }

      const buffer = Buffer.from(rawBase64, 'base64');
      const filename = `avatar_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
      const destPath = path.join(avatarUploadsDir, filename);
      fs.writeFileSync(destPath, buffer);

      const avatarUrl = `/uploads/${filename}`;

      if (req.user?.id) {
        try {
          userQueries.updateProfile.run({
            name: null,
            avatarUrl,
            language: null,
            id: req.user.id,
            identifier: req.user.phoneNumber || ''
          });
        } catch {
          // ignore
        }
      }

      return res.status(201).json({
        success: true,
        avatarUrl,
        message: 'Avatar image saved successfully'
      });
    } catch (err) {
      console.error('[Upload Base64 Avatar Error]:', err);
      return res.status(500).json({ success: false, error: 'Failed to process avatar image' });
    }
  }
});

/**
 * PATCH /api/auth/profile
 * POST /api/auth/profile
 * PUT /api/auth/profile
 * Updates user name, avatarUrl, and language preference in SQLite User table
 */
const updateProfileHandler = (req, res) => {
  try {
    const { name, avatarUrl, language, preferredLanguage, phoneNumber, userId } = req.body;
    const targetId = req.user?.id || userId || null;
    const identifier = req.user?.phoneNumber || (phoneNumber ? String(phoneNumber).trim().replace(/\D/g, '').slice(-10) : '');

    if (!targetId && !identifier) {
      return res.status(400).json({ success: false, error: 'User identifier or authentication token required' });
    }

    const cleanName = (name !== undefined && typeof name === 'string') ? name.trim() : null;
    const cleanAvatar = (avatarUrl !== undefined) ? avatarUrl : null;
    const cleanLang = language || preferredLanguage || null;

    userQueries.updateProfile.run({
      name: cleanName,
      avatarUrl: cleanAvatar,
      language: cleanLang,
      id: targetId || '',
      identifier: identifier
    });

    const updatedUser = targetId
      ? userQueries.findById.get(targetId)
      : (userQueries.findByPhone.get(identifier) || userQueries.findByEmail.get(identifier));

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('[Update Profile Error]:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

router.patch('/profile', optionalAuth, updateProfileHandler);
router.post('/profile', optionalAuth, updateProfileHandler);
router.put('/profile', optionalAuth, updateProfileHandler);
router.patch('/language', optionalAuth, updateProfileHandler);
router.post('/language', optionalAuth, updateProfileHandler);

module.exports = router;
