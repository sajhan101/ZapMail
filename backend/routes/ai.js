const express = require('express');

const router = express.Router();

const { emailQueries } = require('../db');

/**
 * Intelligent Fallback Summarizer
 * Produces 2-3 concise, high-impact bullet points when external AI keys are not provided.
 */
function fallbackSummarize(content, subject = '') {
  if (!content || !content.trim()) {
    return {
      summary: '• Empty email message with no readable body text.\n• Sender did not provide additional message details.',
      bullets: [
        'Empty email message with no readable body text.',
        'Sender did not provide additional message details.'
      ]
    };
  }

  const clean = content.replace(/\r\n/g, '\n').trim();
  const lines = clean
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('>') && !l.startsWith('From:') && !l.startsWith('Sent:') && !l.startsWith('Subject:'));

  const fullText = lines.join(' ');

  // Identify key themes
  const hasMeeting = /meeting|schedule|appointment|time|calendar|call|zoom|presentation|slot|sync/i.test(fullText);
  const hasSecurity = /security|token|password|login|2fa|verification|code|unauthorized/i.test(fullText);
  const hasBilling = /invoice|payment|paid|statement|receipt|subscription|billing|charge|\$/i.test(fullText);
  const hasAttachment = /attach|attached|agreement|pdf|spec|document|checklist|contract/i.test(fullText);
  const hasUrgent = /urgent|asap|critical|action required|important|immediate/i.test(fullText);

  // Extract informative sentences
  const sentences = fullText
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);

  const bullets = [];

  // Bullet 1: Core Subject / Intent
  if (subject && subject.trim() && !/no subject|re:|fwd:/i.test(subject.trim())) {
    bullets.push(`Purpose: ${subject.trim()} - ${sentences[0] || 'Email discussion regarding project updates.'}`);
  } else if (sentences[0]) {
    bullets.push(sentences[0]);
  } else {
    bullets.push(`Overview: ${fullText.slice(0, 100)}...`);
  }

  // Bullet 2: Key Substance / Details
  if (sentences.length > 1 && sentences[1] !== sentences[0]) {
    bullets.push(sentences[1]);
  } else if (hasAttachment) {
    bullets.push('Deliverables & Files: Attached project documentation and specifications are ready for review.');
  } else if (hasMeeting) {
    bullets.push('Calendar & Scheduling: Meeting session details or agenda proposals outlined.');
  } else if (hasBilling) {
    bullets.push('Commercial Details: Billing statement, invoice, or payment confirmation referenced.');
  } else if (sentences.length > 2) {
    bullets.push(sentences[2]);
  }

  // Bullet 3: Action Item / Deadline / Next Step
  const actionSentences = sentences.filter((s) => /please|confirm|review|send|approve|check|reply|deadline|by\s+[a-z]+/i.test(s));
  if (actionSentences.length > 0 && !bullets.includes(actionSentences[0])) {
    bullets.push(`Action Item: ${actionSentences[0]}`);
  } else if (hasUrgent) {
    bullets.push('Priority Action: Immediate review and confirmation requested by sender.');
  } else if (hasMeeting) {
    bullets.push('Next Step: Please verify availability for the scheduled meeting discussion.');
  } else if (hasAttachment) {
    bullets.push('Next Step: Inspect the attached files and reply with your approval or notes.');
  } else if (bullets.length < 3 && sentences[2] && !bullets.includes(sentences[2])) {
    bullets.push(sentences[2]);
  } else if (bullets.length < 2) {
    bullets.push('Next Step: Awaiting recipient review and confirmation.');
  }

  // Normalize to 2-3 bullets
  const finalBullets = bullets.slice(0, 3).map((b) => b.replace(/^[•\-\*]\s*/, '').trim());
  const summaryText = finalBullets.map((b) => `• ${b}`).join('\n');

  return {
    summary: summaryText,
    bullets: finalBullets
  };
}

/**
 * Intelligent Fallback Smart Replies
 * Generates three context-aware 1-click reply options.
 */
function fallbackSuggestReplies(content = '', subject = '') {
  const combined = `${subject} ${content}`.toLowerCase();

  // 1. Question Detection (Answering a question / inquiry)
  if (/\?|can you|could you|would you|are you|will you|what is|how do|where is|when can|any update/i.test(combined)) {
    return [
      'Yes, absolutely! I will take care of this.',
      'Let me look into this and get back to you shortly.',
      'Could you provide a few more details on this?'
    ];
  }

  // 2. Meeting & Scheduling (Confirming a time / reschedule)
  if (/meeting|schedule|time|calendar|reschedule|presentation|call|slot|tomorrow|today|sync|appointment/i.test(combined)) {
    return [
      'Confirmed, that time works perfectly for me!',
      'Could we reschedule for 30 minutes later?',
      'Received! Looking forward to connecting then.'
    ];
  }

  // 3. Billing & Invoices
  if (/invoice|payment|paid|billing|receipt|subscription|charge|\$|budget/i.test(combined)) {
    return [
      'Payment receipt confirmed, thank you!',
      'Could you share an itemized breakdown?',
      'Acknowledged, forwarding to our finance team.'
    ];
  }

  // 4. Security & Verification
  if (/security|verification|2fa|code|password|token|alert|access|login/i.test(combined)) {
    return [
      'This activity was authorized by me. Thank you!',
      'I did not authorize this, please freeze access.',
      'Credentials updated and verified successfully.'
    ];
  }

  // 5. Urgent / Critical Escalations
  if (/urgent|asap|critical|action required|important|immediate/i.test(combined)) {
    return [
      'On it right now! Will update you as soon as resolved.',
      'Received and prioritized. Expect an update shortly.',
      'Could you clarify the priority blocker before we proceed?'
    ];
  }

  // 6. General Professional Receipt Acknowledgement
  return [
    'Received with thanks! Reviewing right now.',
    'Thank you for the update! Everything looks great.',
    'Sounds like a plan! Let us proceed as proposed.'
  ];
}

/**
 * Core Summarizer Function: Condenses an email into 2-3 concise bullet points
 */
async function generateEmailSummary(content, subject = '') {
  const emailText = content || '';
  if (!emailText.trim()) {
    return {
      summary: '• Empty email message with no readable body text.\n• Sender did not provide additional message details.',
      bullets: [
        'Empty email message with no readable body text.',
        'Sender did not provide additional message details.'
      ],
      provider: 'PhoneMail AI Engine'
    };
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;

  // 1. Try Gemini API if key is provided
  if (geminiKey) {
    try {
      const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
      const prompt = `You are an executive email assistant. Summarize the following email message or thread in exactly 2-3 concise, high-impact bullet points. Highlight the main topic, key updates or deliverables, and any required action or deadline. Do not include introductory filler. Format each bullet on its own line starting with "• ".\n\nSubject: ${subject}\n\nEmail Content:\n${emailText}`;

      const apiRes = await fetch(geminiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 180
          }
        })
      });

      if (apiRes.ok) {
        const apiData = await apiRes.json();
        const candidateText = apiData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText && candidateText.trim()) {
          const rawBullets = candidateText
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 3)
            .map((l) => l.replace(/^[•\-\*\d\.]+\s*/, '').trim())
            .filter(Boolean);

          if (rawBullets.length >= 2) {
            const bullets = rawBullets.slice(0, 3);
            return {
              summary: bullets.map((b) => `• ${b}`).join('\n'),
              bullets,
              provider: 'Google Gemini'
            };
          }
        }
      }
    } catch (geminiErr) {
      console.warn('[AI Service] Gemini call failed, falling back to local NLP:', geminiErr.message);
    }
  }

  // 2. Try OpenAI API if key is provided
  if (openAiKey) {
    try {
      const apiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openAiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are an executive email summarizer. Provide exactly 2-3 concise, high-impact bullet points summarizing the email. Format each on a new line starting with "• ". Do not add introductory filler.'
            },
            { role: 'user', content: `Subject: ${subject}\n\n${emailText}` }
          ],
          max_tokens: 180,
          temperature: 0.3
        })
      });

      if (apiRes.ok) {
        const apiData = await apiRes.json();
        const summaryText = apiData.choices?.[0]?.message?.content;
        if (summaryText && summaryText.trim()) {
          const rawBullets = summaryText
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 3)
            .map((l) => l.replace(/^[•\-\*\d\.]+\s*/, '').trim())
            .filter(Boolean);

          if (rawBullets.length >= 2) {
            const bullets = rawBullets.slice(0, 3);
            return {
              summary: bullets.map((b) => `• ${b}`).join('\n'),
              bullets,
              provider: 'OpenAI GPT'
            };
          }
        }
      }
    } catch (openAiErr) {
      console.warn('[AI Service] OpenAI call failed, falling back to local NLP:', openAiErr.message);
    }
  }

  // 3. Fallback High-Quality Heuristic Summarizer
  const fallbackResult = fallbackSummarize(emailText, subject);
  return {
    summary: fallbackResult.summary,
    bullets: fallbackResult.bullets,
    provider: 'PhoneMail AI Engine'
  };
}

/**
 * POST /api/ai/summarize
 * Takes an email thread, body text, or email id and returns 2-3 concise bullet points
 * Accepts: { content, subject } or { id, emailId }
 */
router.post('/summarize', async (req, res) => {
  try {
    const { content, body, text, thread, subject, id, emailId } = req.body;
    let emailText = content || body || text || thread || '';
    let emailSubject = subject || '';

    // If an email ID is provided without body, load from database
    const targetId = id || emailId;
    if (!emailText && targetId) {
      const existing = emailQueries.findById.get(targetId);
      if (existing) {
        emailText = existing.body || '';
        emailSubject = existing.subject || '';
      }
    }

    if (!emailText || !emailText.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Email content is required to summarize'
      });
    }

    const result = await generateEmailSummary(emailText, emailSubject);
    return res.json({
      success: true,
      summary: result.summary,
      bullets: result.bullets,
      provider: result.provider
    });
  } catch (error) {
    console.error('[AI Summarize Error]:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate email summary'
    });
  }
});

/**
 * POST /api/ai/suggest-reply
/**
 * Generate 3 context-aware smart reply options
 */
async function generateSmartReplies(content, subject = '', from = 'Sender') {
  const emailText = content || '';
  const emailSubject = subject || '';

  const geminiKey = process.env.GEMINI_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;

  // 1. Try Gemini API
  if (geminiKey) {
    try {
      const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
      const prompt = `Based on the following incoming email, generate exactly THREE distinct, natural, and professional 1-click smart reply options for the recipient. Return ONLY a valid JSON array of three strings, e.g. ["Option 1", "Option 2", "Option 3"].\n\nSubject: ${emailSubject}\nFrom: ${from || 'Sender'}\nBody:\n${emailText}`;

      const apiRes = await fetch(geminiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.4
          }
        })
      });

      if (apiRes.ok) {
        const apiData = await apiRes.json();
        const rawOutput = apiData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawOutput) {
          const parsed = JSON.parse(rawOutput);
          if (Array.isArray(parsed) && parsed.length >= 3) {
            return {
              suggestions: parsed.slice(0, 3),
              provider: 'Google Gemini'
            };
          }
        }
      }
    } catch (geminiErr) {
      console.warn('[AI Service] Gemini smart reply failed, falling back:', geminiErr.message);
    }
  }

  // 2. Try OpenAI API
  if (openAiKey) {
    try {
      const apiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openAiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'Generate exactly three 1-click smart reply suggestions for the following email. Return ONLY a JSON array of 3 strings, e.g. ["Option 1", "Option 2", "Option 3"].'
            },
            { role: 'user', content: `Subject: ${emailSubject}\nBody:\n${emailText}` }
          ],
          response_format: { type: 'json_object' }
        })
      });

      if (apiRes.ok) {
        const apiData = await apiRes.json();
        const raw = apiData.choices?.[0]?.message?.content;
        if (raw) {
          const parsed = JSON.parse(raw);
          const array = Array.isArray(parsed) ? parsed : parsed.suggestions || parsed.replies || Object.values(parsed);
          if (Array.isArray(array) && array.length >= 3) {
            return {
              suggestions: array.slice(0, 3),
              provider: 'OpenAI GPT'
            };
          }
        }
      }
    } catch (openAiErr) {
      console.warn('[AI Service] OpenAI smart reply failed, falling back:', openAiErr.message);
    }
  }

  // 3. Fallback Contextual Smart Replies
  const suggestions = fallbackSuggestReplies(emailText, emailSubject);
  return {
    suggestions,
    provider: 'PhoneMail AI Engine'
  };
}

/**
 * POST /api/ai/suggest-reply
 * Generates three 1-click smart reply options based on incoming mail content
 * Accepts: { content, subject, from } or { body }
 */
router.post('/suggest-reply', async (req, res) => {
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
    console.error('[AI Suggest Reply Error]:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate smart replies'
    });
  }
});

router.generateEmailSummary = generateEmailSummary;
router.fallbackSummarize = fallbackSummarize;
router.generateSmartReplies = generateSmartReplies;
router.fallbackSuggestReplies = fallbackSuggestReplies;

module.exports = router;
module.exports.generateEmailSummary = generateEmailSummary;
module.exports.fallbackSummarize = fallbackSummarize;
module.exports.generateSmartReplies = generateSmartReplies;
module.exports.fallbackSuggestReplies = fallbackSuggestReplies;
