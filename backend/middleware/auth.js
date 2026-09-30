const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretphonemailkey12345';

function resolveUser(req) {
  if (req.user && req.user.phoneNumber) {
    return req.user;
  }
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      return req.user;
    } catch {
      // invalid token
    }
  }

  const phoneHeader = req.headers['x-user-phone'] || req.query?.userPhone || req.query?.phone;
  const emailHeader = req.headers['x-user-email'] || req.query?.userEmail || req.query?.email;

  if (phoneHeader) {
    const cleanPhone = String(phoneHeader).replace(/\D/g, '').slice(0, 10);
    if (cleanPhone.length === 10) {
      req.user = {
        phoneNumber: cleanPhone,
        email: (emailHeader && !emailHeader.includes('@phonemail.com')) ? emailHeader : `${cleanPhone}@zapmail.com`
      };
      return req.user;
    }
  }

  if (emailHeader) {
    const cleanEmail = String(emailHeader).trim().replace(/@phonemail\.com/gi, '@zapmail.com');
    const phoneMatch = cleanEmail.match(/(\d{10})@(zapmail|phonemail)/i);
    const cleanPhone = phoneMatch ? phoneMatch[1] : null;
    req.user = {
      phoneNumber: cleanPhone,
      email: cleanEmail
    };
    return req.user;
  }

  return null;
}

function authenticateToken(req, res, next) {
  const user = resolveUser(req);
  if (!user || (!user.phoneNumber && !user.email)) {
    return res.status(401).json({
      success: false,
      error: 'Authorization required: Please sign in or provide user credentials'
    });
  }
  next();
}

function optionalAuth(req, res, next) {
  resolveUser(req);
  next();
}

module.exports = {
  authenticateToken,
  optionalAuth,
  resolveUser,
  JWT_SECRET
};

