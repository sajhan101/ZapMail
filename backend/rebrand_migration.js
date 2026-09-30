const { db } = require('./db.js');

try {
  const cols = db.prepare('PRAGMA table_info(Email)').all().map(c => c.name);
  if (!cols.includes('labels')) {
    db.exec("ALTER TABLE Email ADD COLUMN labels TEXT DEFAULT '[]'");
    console.log('Added labels column to Email table!');
  } else {
    console.log('labels column already exists.');
  }

  // Update default names
  db.prepare(`UPDATE User SET name = 'ZapMail User' WHERE name = 'PhoneMail User'`).run();

  // Migrate all @phonemail.com occurrences to @zapmail.com
  const userRes = db.prepare(`UPDATE User SET email = replace(email, '@phonemail.com', '@zapmail.com') WHERE email LIKE '%@phonemail.com'`).run();
  const senderRes = db.prepare(`UPDATE Email SET senderEmail = replace(senderEmail, '@phonemail.com', '@zapmail.com') WHERE senderEmail LIKE '%@phonemail.com'`).run();
  const recRes = db.prepare(`UPDATE Email SET recipientEmail = replace(recipientEmail, '@phonemail.com', '@zapmail.com') WHERE recipientEmail LIKE '%@phonemail.com'`).run();
  const ownerRes = db.prepare(`UPDATE Email SET ownerEmail = replace(ownerEmail, '@phonemail.com', '@zapmail.com') WHERE ownerEmail LIKE '%@phonemail.com'`).run();
  const smsSenderRes = db.prepare(`UPDATE SmsLog SET senderEmail = replace(senderEmail, '@phonemail.com', '@zapmail.com') WHERE senderEmail LIKE '%@phonemail.com'`).run();
  const smsMsgRes = db.prepare(`UPDATE SmsLog SET message = replace(replace(message, '@phonemail.com', '@zapmail.com'), 'via PhoneMail', 'via ZapMail') WHERE message LIKE '%phonemail%'`).run();

  console.log('Database migration complete:', {
    usersUpdated: userRes.changes,
    sendersUpdated: senderRes.changes,
    recipientsUpdated: recRes.changes,
    ownersUpdated: ownerRes.changes,
    smsSendersUpdated: smsSenderRes.changes,
    smsMessagesUpdated: smsMsgRes.changes
  });
} catch (err) {
  console.error('Error:', err.message);
}
