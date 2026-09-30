require('dotenv').config();
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DATABASE_PATH || process.env.DATABASE_FILE || (
  fs.existsSync('/app/data') ? '/app/data/zapmail.sqlite' : path.join(__dirname, 'dev.db')
);
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

async function seedDatabase() {
  console.log('🌱 [PhoneMail Seeder] Initializing database tables...');

  // Ensure tables exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS User (
      id TEXT PRIMARY KEY,
      phoneNumber TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      registeredVia TEXT NOT NULL CHECK(registeredVia IN ('MOBILE_APP', 'WEB_CLIENT', 'WEB_PORTAL', 'IVR')),
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS Email (
      id TEXT PRIMARY KEY,
      senderEmail TEXT NOT NULL,
      recipientEmail TEXT NOT NULL,
      subject TEXT,
      body TEXT,
      read INTEGER DEFAULT 0,
      folder TEXT DEFAULT 'INBOX' CHECK(folder IN ('INBOX', 'DRAFTS', 'SPAM', 'TRASH')),
      deletedAt DATETIME DEFAULT NULL,
      attachments TEXT DEFAULT '[]',
      isDraft INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS SmsLog (
      id TEXT PRIMARY KEY,
      recipientPhone TEXT NOT NULL,
      senderEmail TEXT,
      subject TEXT,
      message TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_user_phone ON User(phoneNumber);
    CREATE INDEX IF NOT EXISTS idx_user_email ON User(email);
    CREATE INDEX IF NOT EXISTS idx_email_recipient ON Email(recipientEmail);
    CREATE INDEX IF NOT EXISTS idx_email_folder ON Email(folder);
    CREATE INDEX IF NOT EXISTS idx_sms_recipient ON SmsLog(recipientPhone);
  `);

  console.log('🧹 [PhoneMail Seeder] Cleaning old records...');
  db.prepare('DELETE FROM SmsLog').run();
  db.prepare('DELETE FROM Email').run();
  db.prepare('DELETE FROM User').run();

  console.log('👥 [PhoneMail Seeder] Creating 3 demo users...');
  const salt = await bcrypt.genSalt(10);
  const defaultHash = await bcrypt.hash('Demo123!', salt);

  const users = [
    {
      id: 'user_alex_9876543210',
      name: 'Alex Rivera',
      phoneNumber: '9876543210',
      email: '9876543210@zapmail.com',
      passwordHash: defaultHash,
      avatarUrl: null,
      registeredVia: 'MOBILE_APP',
      language: 'English',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()
    },
    {
      id: 'user_sarah_9123456780',
      name: 'Sarah Jenkins',
      phoneNumber: '9123456780',
      email: '9123456780@zapmail.com',
      passwordHash: defaultHash,
      avatarUrl: null,
      registeredVia: 'PHONE_CALL',
      language: 'English',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString()
    },
    {
      id: 'user_external_client',
      name: 'David Miller',
      phoneNumber: '5550001111',
      email: 'external_client@gmail.com',
      passwordHash: defaultHash,
      avatarUrl: null,
      registeredVia: 'WEB',
      language: 'English',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString()
    }
  ];

  const insertUser = db.prepare(`
    INSERT INTO User (id, name, phoneNumber, email, passwordHash, avatarUrl, registeredVia, language, createdAt)
    VALUES (@id, COALESCE(@name, 'PhoneMail User'), @phoneNumber, @email, @passwordHash, @avatarUrl, COALESCE(@registeredVia, 'WEB'), COALESCE(@language, 'English'), @createdAt)
  `);

  for (const u of users) {
    insertUser.run(u);
    console.log(`   ✓ Created User: ${u.email} (Phone: ${u.phoneNumber}, Channel: ${u.registeredVia})`);
  }

  console.log('📬 [PhoneMail Seeder] Inserting realistic email threads...');
  const emails = [
    {
      id: 'email_seed_1',
      ownerPhone: '9876543210',
      ownerEmail: '9876543210@zapmail.com',
      senderPhone: '5550001111',
      senderEmail: 'external_client@gmail.com',
      recipientPhone: '9876543210',
      recipientEmail: '9876543210@zapmail.com',
      subject: 'PhoneMail Enterprise Deployment & Pilot Agreement',
      body: 'Hi Alex,\n\nWe reviewed the PhoneMail platform architecture and were blown away by the phone-to-email bridge. We are eager to initiate the pilot for 5,000 field staff who only carry basic feature phones.\n\nPlease find the terms attached. Can you confirm if we can start rollout next Monday at 10:00 AM?\n\nBest regards,\nDavid Miller\nManaging Partner, Enterprise Telecom',
      read: 1,
      folder: 'INBOX',
      createdAt: new Date(Date.now() - 1000 * 60 * 120).toISOString()
    },
    {
      id: 'email_seed_2',
      ownerPhone: '9876543210',
      ownerEmail: '9876543210@zapmail.com',
      senderPhone: '9876543210',
      senderEmail: '9876543210@zapmail.com',
      recipientPhone: '5550001111',
      recipientEmail: 'external_client@gmail.com',
      subject: 'Re: PhoneMail Enterprise Deployment & Pilot Agreement',
      body: 'Hi David,\n\nThank you for the wonderful feedback! Monday at 10:00 AM works perfectly. Our embedded SMTP gateway on port 2525 and SQLite telecom store are provisioned and ready to handle inbound and outbound carrier alerts.\n\nLooking forward to our kickoff!\n\nAlex Rivera',
      read: 1,
      folder: 'SENT',
      createdAt: new Date(Date.now() - 1000 * 60 * 80).toISOString()
    },
    // Email 3: Alex -> Sarah (Sender copy for Alex)
    {
      id: 'email_seed_3_sender',
      ownerPhone: '9876543210',
      ownerEmail: '9876543210@zapmail.com',
      senderPhone: '9876543210',
      senderEmail: '9876543210@zapmail.com',
      recipientPhone: '9123456780',
      recipientEmail: '9123456780@zapmail.com',
      subject: 'Urgent Field Alert: Server Maintenance at Substation 4',
      body: 'Sarah,\n\nPlease note our central power grid gateway will undergo maintenance from 2:00 PM to 4:00 PM today. Since you are in the field, this alert is dispatched via carrier SMS to your mobile phone. Please reply by SMS to acknowledge.',
      read: 1,
      folder: 'SENT',
      createdAt: new Date(Date.now() - 1000 * 60 * 35).toISOString()
    },
    // Email 3: Alex -> Sarah (Recipient copy for Sarah)
    {
      id: 'email_seed_3_rcpt',
      ownerPhone: '9123456780',
      ownerEmail: '9123456780@zapmail.com',
      senderPhone: '9876543210',
      senderEmail: '9876543210@zapmail.com',
      recipientPhone: '9123456780',
      recipientEmail: '9123456780@zapmail.com',
      subject: 'Urgent Field Alert: Server Maintenance at Substation 4',
      body: 'Sarah,\n\nPlease note our central power grid gateway will undergo maintenance from 2:00 PM to 4:00 PM today. Since you are in the field, this alert is dispatched via carrier SMS to your mobile phone. Please reply by SMS to acknowledge.',
      read: 0,
      folder: 'INBOX',
      createdAt: new Date(Date.now() - 1000 * 60 * 35).toISOString()
    },
    // Email 4: Sarah -> Alex (Sender copy for Sarah)
    {
      id: 'email_seed_4_sender',
      ownerPhone: '9123456780',
      ownerEmail: '9123456780@zapmail.com',
      senderPhone: '9123456780',
      senderEmail: '9123456780@zapmail.com',
      recipientPhone: '9876543210',
      recipientEmail: '9876543210@zapmail.com',
      subject: 'Re: Urgent Field Alert: Server Maintenance at Substation 4',
      body: 'Received via SMS. Backup generator active at Substation 4. All field telemetry is green.',
      read: 1,
      folder: 'SENT',
      createdAt: new Date(Date.now() - 1000 * 60 * 20).toISOString()
    },
    // Email 4: Sarah -> Alex (Recipient copy for Alex)
    {
      id: 'email_seed_4_rcpt',
      ownerPhone: '9876543210',
      ownerEmail: '9876543210@zapmail.com',
      senderPhone: '9123456780',
      senderEmail: '9123456780@zapmail.com',
      recipientPhone: '9876543210',
      recipientEmail: '9876543210@zapmail.com',
      subject: 'Re: Urgent Field Alert: Server Maintenance at Substation 4',
      body: 'Received via SMS. Backup generator active at Substation 4. All field telemetry is green.',
      read: 0,
      folder: 'INBOX',
      createdAt: new Date(Date.now() - 1000 * 60 * 20).toISOString()
    },
    // Email 5: External -> Sarah
    {
      id: 'email_seed_5',
      ownerPhone: '9123456780',
      ownerEmail: '9123456780@zapmail.com',
      senderPhone: '5550001111',
      senderEmail: 'external_client@gmail.com',
      recipientPhone: '9123456780',
      recipientEmail: '9123456780@zapmail.com',
      subject: 'Inspection Checklist & Equipment Dispatch',
      body: 'Sarah,\n\nSending over the safety inspection checklist for the pilot hardware batch. Let us know if the units arrived safely at the terminal.\n\nThanks,\nDavid Miller',
      read: 0,
      folder: 'INBOX',
      createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString()
    },
    // Email 6: Security -> Alex
    {
      id: 'email_seed_6',
      ownerPhone: '9876543210',
      ownerEmail: '9876543210@zapmail.com',
      senderPhone: null,
      senderEmail: 'security@cloudservice.com',
      recipientPhone: '9876543210',
      recipientEmail: '9876543210@zapmail.com',
      subject: 'Your Security Verification Code: 739201',
      body: 'Your verification code is 739201. This code expires in 10 minutes. PhoneMail automated SMS forwarder has delivered this to your phone.',
      read: 1,
      folder: 'INBOX',
      createdAt: new Date(Date.now() - 1000 * 60 * 50).toISOString()
    },
    // Email 7: Judge -> Alex
    {
      id: 'email_seed_7',
      ownerPhone: '9876543210',
      ownerEmail: '9876543210@zapmail.com',
      senderPhone: null,
      senderEmail: 'judge@hackathon.org',
      recipientPhone: '9876543210',
      recipientEmail: '9876543210@zapmail.com',
      subject: 'Hackathon Final Demo & Evaluation Schedule',
      body: 'Hi Alex and Team PhoneMail,\n\nYour project has been selected for the live demonstration round! We are looking forward to seeing the live telecom simulation and carrier SMS-to-email bridge in action.',
      read: 0,
      folder: 'INBOX',
      deletedAt: null,
      attachments: JSON.stringify([
        {
          id: 'att_seed_schedule',
          filename: 'evaluation_schedule.pdf',
          mimeType: 'application/pdf',
          size: 145200,
          url: '/uploads/evaluation_schedule.pdf'
        }
      ]),
      isDraft: 0,
      createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString()
    },
    // Email Draft 1: Alex draft
    {
      id: 'email_seed_draft_1',
      ownerPhone: '9876543210',
      ownerEmail: '9876543210@zapmail.com',
      senderPhone: '9876543210',
      senderEmail: '9876543210@zapmail.com',
      recipientPhone: null,
      recipientEmail: 'support@telecompartner.org',
      subject: 'Draft: Regional Roaming Gateway Integration',
      body: 'Hi Team,\n\nI am drafting the integration specs for the rural roaming gateway...',
      read: 1,
      folder: 'DRAFTS',
      deletedAt: null,
      attachments: '[]',
      isDraft: 1,
      createdAt: new Date(Date.now() - 1000 * 60 * 10).toISOString()
    },
    // Email Spam 1: Spam to Alex
    {
      id: 'email_seed_spam_1',
      ownerPhone: '9876543210',
      ownerEmail: '9876543210@zapmail.com',
      senderPhone: null,
      senderEmail: 'rewards@crypto-giveaway-winner.xyz',
      recipientPhone: '9876543210',
      recipientEmail: '9876543210@zapmail.com',
      subject: 'URGENT: Claim prize! You won cash & bitcoin giveaway',
      body: 'Congratulations! You have won $500,000 cash. Urgent bank transfer required. Click http://bit.ly/crypto-reward-claim to claim prize.',
      read: 0,
      folder: 'SPAM',
      deletedAt: null,
      attachments: '[]',
      isDraft: 0,
      createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString()
    },
    // Email Trash 1: Trash for Alex
    {
      id: 'email_seed_trash_1',
      ownerPhone: '9876543210',
      ownerEmail: '9876543210@zapmail.com',
      senderPhone: null,
      senderEmail: 'promo@unwanteddeals.net',
      recipientPhone: '9876543210',
      recipientEmail: '9876543210@zapmail.com',
      subject: 'Old Promotional Newsletter',
      body: 'This newsletter was deleted by the user.',
      read: 1,
      folder: 'TRASH',
      deletedAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
      attachments: '[]',
      isDraft: 0,
      recipientTrash: 1,
      createdAt: new Date(Date.now() - 1000 * 60 * 180).toISOString()
    }
  ];

  const insertEmail = db.prepare(`
    INSERT INTO Email (
      id, ownerPhone, ownerEmail, userId, senderPhone, senderEmail, recipientPhone, recipientEmail,
      subject, body, read, folder, deletedAt, attachments, isDraft, recipientTrash, senderTrash, createdAt
    )
    VALUES (
      @id, @ownerPhone, @ownerEmail, @userId, @senderPhone, @senderEmail, @recipientPhone, @recipientEmail,
      @subject, @body, COALESCE(@read, 0), COALESCE(@folder, 'INBOX'), @deletedAt, COALESCE(@attachments, '[]'), COALESCE(@isDraft, 0),
      COALESCE(@recipientTrash, 0), COALESCE(@senderTrash, 0), @createdAt
    )
  `);

  for (const e of emails) {
    insertEmail.run({
      id: e.id,
      ownerPhone: e.ownerPhone || null,
      ownerEmail: e.ownerEmail || null,
      userId: e.userId || null,
      senderPhone: e.senderPhone || null,
      senderEmail: e.senderEmail,
      recipientPhone: e.recipientPhone || null,
      recipientEmail: e.recipientEmail,
      subject: e.subject || '(No Subject)',
      body: e.body || '',
      read: e.read || 0,
      folder: e.folder || 'INBOX',
      deletedAt: e.deletedAt || null,
      attachments: e.attachments || '[]',
      isDraft: e.isDraft || 0,
      recipientTrash: e.recipientTrash || 0,
      senderTrash: e.senderTrash || 0,
      createdAt: e.createdAt
    });
  }
  console.log(`   ✓ Seeded ${emails.length} realistic email threads across users with multi-user isolation`);

  console.log('💬 [PhoneMail Seeder] Inserting realistic SMS notification logs...');
  const smsLogs = [
    {
      id: 'sms_seed_1',
      recipientPhone: '9123456780',
      senderEmail: 'ivr@phonemail.local',
      subject: 'IVR Account Created',
      message: 'Welcome to PhoneMail! Your phone number 9123456780 has been registered via Toll-Free Voice Call. Your email is 9123456780@zapmail.com.',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString()
    },
    {
      id: 'sms_seed_2',
      recipientPhone: '9876543210',
      senderEmail: 'welcome@phonemail.local',
      subject: 'Welcome to PhoneMail',
      message: 'Welcome to PhoneMail Mobile App! Your phone 9876543210 is now your email handle 9876543210@zapmail.com.',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()
    },
    {
      id: 'sms_seed_3',
      recipientPhone: '9123456780',
      senderEmail: '9876543210@zapmail.com',
      subject: 'Urgent Field Alert: Server Maintenance at Substation 4',
      message: 'From: 9876543210@zapmail.com | Subj: Urgent Field Alert: Server Maintenance at Substation 4 | Body: Sarah, Please note our central power grid gateway will undergo maintenance... Reply via SMS.',
      timestamp: new Date(Date.now() - 1000 * 60 * 35).toISOString()
    },
    {
      id: 'sms_seed_4',
      recipientPhone: '9876543210',
      senderEmail: '9123456780@zapmail.com',
      subject: 'Re: Urgent Field Alert: Server Maintenance at Substation 4',
      message: 'From: 9123456780@zapmail.com | Subj: Re: Urgent Field Alert | Body: Received via SMS. Backup generator active at Substation 4.',
      timestamp: new Date(Date.now() - 1000 * 60 * 20).toISOString()
    },
    {
      id: 'sms_seed_5',
      recipientPhone: '9123456780',
      senderEmail: 'external_client@gmail.com',
      subject: 'Inspection Checklist & Equipment Dispatch',
      message: 'From: external_client@gmail.com | Subj: Inspection Checklist & Equipment Dispatch | Body: Sarah, sending over the safety inspection checklist for the pilot hardware batch...',
      timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString()
    },
    {
      id: 'sms_seed_6',
      recipientPhone: '9876543210',
      senderEmail: 'judge@hackathon.org',
      subject: 'Hackathon Final Demo & Evaluation Schedule',
      message: 'From: judge@hackathon.org | Subj: Hackathon Final Demo | Body: Your project has been selected for the live demonstration round! Looking forward to seeing the live telecom simulation.',
      timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString()
    }
  ];

  const insertSms = db.prepare(`
    INSERT INTO SmsLog (id, recipientPhone, senderEmail, subject, message, timestamp)
    VALUES (@id, @recipientPhone, @senderEmail, @subject, @message, @timestamp)
  `);

  for (const s of smsLogs) {
    insertSms.run(s);
  }
  console.log(`   ✓ Seeded ${smsLogs.length} realistic SMS carrier logs`);

  console.log('\n✨ [PhoneMail Seeder] Seed successfully completed!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📌 DEMO ACCOUNTS READY FOR LIVE PRESENTATION:');
  console.log('1. Alex Rivera (Primary Sender / Mobile App)');
  console.log('   • Phone: 9876543210');
  console.log('   • Email: 9876543210@zapmail.com');
  console.log('   • Pass:  Demo123!');
  console.log('2. Sarah Jenkins (Receiver / IVR & Offline SMS User)');
  console.log('   • Phone: 9123456780');
  console.log('   • Email: 9123456780@zapmail.com');
  console.log('   • Pass:  Demo123!');
  console.log('3. David Miller (External Client / Web Partner)');
  console.log('   • Phone: 5550001111');
  console.log('   • Email: external_client@gmail.com');
  console.log('   • Pass:  Demo123!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Seeding failed:', err);
      process.exit(1);
    });
}

module.exports = { seedDatabase };
