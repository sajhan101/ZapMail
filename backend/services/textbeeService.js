const axios = require('axios');

/**
 * TextBee Real SMS Gateway Service
 * Dispatches live SMS messages to mobile devices via TextBee Android SMS Gateway.
 */

/**
 * Strips '+91' or '91' country code prefix from an Indian phone number
 * to produce a clean, standard 10-digit mobile number.
 *
 * @param {string} phone
 * @returns {string} 10-digit phone number
 */
function strip91(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length > 10) {
    return digits.slice(-10);
  }
  return digits;
}

/**
 * Sanitizes and cleans a phone number string.
 * Strips all non-digit characters except optional leading '+'.
 *
 * @param {string} phone - Target phone number
 * @param {object} [options]
 * @param {boolean} [options.stripCountryCode=false] - Strip +91 to return standard 10-digit number
 * @param {string} [options.countryCode='+91'] - Country code prefix
 * @returns {string} Clean formatted phone string
 */
function sanitizePhoneNumber(phone, options = {}) {
  if (!phone) return '';
  const { stripCountryCode = false, countryCode = '+91' } = options;
  const trimmed = String(phone).trim();

  // If stripping country code is explicitly requested
  if (stripCountryCode) {
    return strip91(trimmed);
  }

  // If already starts with '+', keep '+' and strip any non-digit formatting
  if (trimmed.startsWith('+')) {
    return '+' + trimmed.slice(1).replace(/\D/g, '');
  }

  const digits = trimmed.replace(/\D/g, '');

  // If exactly 10 digits, prefix with country code
  if (digits.length === 10) {
    const code = countryCode.startsWith('+') ? countryCode : `+${countryCode}`;
    return `${code}${digits}`;
  }

  // If 12 digits starting with 91, add '+'
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }

  // If already contains country code digits (>10 digits) without '+'
  if (digits.length > 10) {
    return `+${digits}`;
  }

  return `+${digits}`;
}

/**
 * Formats a phone number into standard E.164 international format.
 * Defaults to +91 (India) if a 10-digit number without country code is provided.
 */
function formatE164(phone, countryCode = '+91') {
  return sanitizePhoneNumber(phone, { stripCountryCode: false, countryCode });
}

/**
 * Dispatches an SMS message through TextBee API.
 *
 * @param {object} options
 * @param {string} options.to - Recipient phone number
 * @param {string} options.message - SMS message body
 * @param {string} [options.countryCode='+91'] - Country code if not included in `to`
 * @param {boolean} [options.stripCountryCode=false] - If true, sends via standard 10-digit format
 * @param {boolean} [options.fallbackTo10Digit=true] - If dispatch with +91 fails, retry with 10-digit format
 * @returns {Promise<{success: boolean, data?: any, error?: string, recipient: string, usedFallback?: boolean}>}
 */
async function sendSms({
  to,
  message,
  countryCode = '+91',
  stripCountryCode = false,
  fallbackTo10Digit = true
}) {
  const apiKey = process.env.TEXTBEE_API_KEY;
  const deviceId = process.env.TEXTBEE_DEVICE_ID;
  const baseUrl = (process.env.TEXTBEE_BASE_URL || 'https://api.textbee.dev/api/v1').replace(/\/+$/, '');

  if (!apiKey || !deviceId) {
    const errorMsg = 'TextBee credentials not configured. Please set TEXTBEE_API_KEY and TEXTBEE_DEVICE_ID in backend/.env';
    console.error(`❌ [TextBee Service]: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }

  // Format recipient cleanly based on options
  const formattedRecipient = sanitizePhoneNumber(to, { stripCountryCode, countryCode });
  const endpoint = `${baseUrl}/gateway/devices/${deviceId}/send-sms`;

  console.log(`📡 [TextBee Service] Dispatching SMS to ${formattedRecipient} via device ${deviceId}...`);

  try {
    const response = await axios.post(
      endpoint,
      {
        recipients: [formattedRecipient],
        message: message
      },
      {
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 15000 // 15s timeout
      }
    );

    console.log(`✅ [TextBee Service] SMS successfully sent to ${formattedRecipient}. Response:`, response.data);
    return {
      success: true,
      data: response.data,
      recipient: formattedRecipient
    };
  } catch (error) {
    const errorDetail = error.response?.data || error.message;
    console.error(`❌ [TextBee Service] Failed to send SMS to ${formattedRecipient}:`, errorDetail);

    // If destination starts with "+91" (or "91") and dispatch failed, retry with standard 10-digit format
    const isIndianPrefix = formattedRecipient.startsWith('+91') || (formattedRecipient.startsWith('91') && formattedRecipient.length === 12);
    if (fallbackTo10Digit && !stripCountryCode && isIndianPrefix) {
      const tenDigit = strip91(formattedRecipient);
      console.log(`🔄 [TextBee Service] Automatic fallback: Retrying SMS dispatch using standard 10-digit format (${tenDigit})...`);

      try {
        const retryResponse = await axios.post(
          endpoint,
          {
            recipients: [tenDigit],
            message: message
          },
          {
            headers: {
              'x-api-key': apiKey,
              'Content-Type': 'application/json'
            },
            timeout: 15000
          }
        );

        console.log(`✅ [TextBee Service] Fallback SMS successfully sent to 10-digit ${tenDigit}. Response:`, retryResponse.data);
        return {
          success: true,
          data: retryResponse.data,
          recipient: tenDigit,
          usedFallback: true
        };
      } catch (retryError) {
        const retryErrorDetail = retryError.response?.data || retryError.message;
        console.error(`❌ [TextBee Service] Fallback dispatch to ${tenDigit} also failed:`, retryErrorDetail);
        return {
          success: false,
          error: retryErrorDetail,
          initialError: errorDetail,
          recipient: tenDigit
        };
      }
    }

    return {
      success: false,
      error: errorDetail,
      recipient: formattedRecipient
    };
  }
}

/**
 * Dispatches a verification PIN SMS via TextBee using the neutral template.
 * Neutral template avoids telecom carrier A2P filters and DLT template scrubber blocks:
 * "PhoneMail login pin: {otp}"
 *
 * @param {string} to - Recipient phone number
 * @param {string} otp - 6-digit OTP code
 * @param {string} [countryCode='+91'] - Country code prefix
 * @param {object} [options={}] - Additional options (e.g. stripCountryCode, fallbackTo10Digit)
 * @returns {Promise<{success: boolean, data?: any, error?: string, recipient?: string, usedFallback?: boolean}>}
 */
async function sendOtpSms(to, otp, countryCode = '+91', options = {}) {
  // Neutralized template to bypass telecom carrier scrubber blocks
  const message = `PhoneMail login pin: ${otp}`;
  return await sendSms({ to, message, countryCode, ...options });
}

/**
 * Convenience helper to dispatch an SMS via TextBee Android Gateway.
 * Exactly matches the buildathon required signature:
 * sendSmsViaTextBee(recipientPhone, smsText)
 */
async function sendSmsViaTextBee(recipientPhone, smsText) {
  return await sendSms({
    to: recipientPhone,
    message: smsText,
    fallbackTo10Digit: true
  });
}

module.exports = {
  sendSms,
  sendSmsViaTextBee,
  sendOtpSms,
  formatE164,
  sanitizePhoneNumber,
  strip91
};
