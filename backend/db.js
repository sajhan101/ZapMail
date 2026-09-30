const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Path to SQLite database file
const dbPath = process.env.DATABASE_PATH || process.env.DATABASE_FILE || (
  fs.existsSync('/app/data') ? '/app/data/zapmail.sqlite' : path.join(__dirname, 'dev.db')
);

// Ensure directory exists
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(dbPath);

// Enable WAL mode for better concurrency and performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize database tables
function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS User (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'ZapMail User',
      phoneNumber TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      avatarUrl TEXT DEFAULT NULL,
      language TEXT DEFAULT 'English',
      registeredVia TEXT NOT NULL DEFAULT 'WEB' CHECK(registeredVia IN ('MOBILE_APP', 'WEB', 'PHONE_CALL', 'WEB_CLIENT', 'WEB_PORTAL', 'IVR')),
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS Email (
      id TEXT PRIMARY KEY,
      ownerPhone TEXT,
      ownerEmail TEXT,
      userId TEXT,
      senderPhone TEXT,
      senderEmail TEXT NOT NULL,
      recipientPhone TEXT,
      recipientEmail TEXT NOT NULL,
      subject TEXT,
      body TEXT,
      read INTEGER DEFAULT 0,
      folder TEXT DEFAULT 'INBOX' CHECK(folder IN ('INBOX', 'DRAFTS', 'SPAM', 'TRASH', 'SENT')),
      deletedAt DATETIME DEFAULT NULL,
      attachments TEXT DEFAULT '[]',
      isDraft INTEGER DEFAULT 0,
      recipientTrash INTEGER DEFAULT 0,
      senderTrash INTEGER DEFAULT 0,
      labels TEXT DEFAULT '[]',
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
    CREATE INDEX IF NOT EXISTS idx_sms_recipient ON SmsLog(recipientPhone);
  `);

  // Auto-migration for Email columns: ownerPhone, ownerEmail, userId, senderPhone, recipientPhone, recipientTrash, senderTrash, labels, folder check
  const columns = db.prepare("PRAGMA table_info(Email)").all().map(c => c.name);
  if (!columns.includes('labels')) {
    db.exec("ALTER TABLE Email ADD COLUMN labels TEXT DEFAULT '[]'");
  }
  const emailSqlRow = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'Email'").get();
  const needsEmailMigration = !columns.includes('ownerPhone') ||
                              !columns.includes('senderPhone') ||
                              !columns.includes('recipientTrash') ||
                              !columns.includes('senderTrash') ||
                              (emailSqlRow && emailSqlRow.sql && !emailSqlRow.sql.includes("'SENT'"));

  if (needsEmailMigration) {
    db.exec(`
      PRAGMA foreign_keys=off;
      BEGIN TRANSACTION;
      ALTER TABLE Email RENAME TO _Email_old;
      CREATE TABLE Email (
        id TEXT PRIMARY KEY,
        ownerPhone TEXT,
        ownerEmail TEXT,
        userId TEXT,
        senderPhone TEXT,
        senderEmail TEXT NOT NULL,
        recipientPhone TEXT,
        recipientEmail TEXT NOT NULL,
        subject TEXT,
        body TEXT,
        read INTEGER DEFAULT 0,
        folder TEXT DEFAULT 'INBOX' CHECK(folder IN ('INBOX', 'DRAFTS', 'SPAM', 'TRASH', 'SENT')),
        deletedAt DATETIME DEFAULT NULL,
        attachments TEXT DEFAULT '[]',
        isDraft INTEGER DEFAULT 0,
        recipientTrash INTEGER DEFAULT 0,
        senderTrash INTEGER DEFAULT 0,
        labels TEXT DEFAULT '[]',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO Email (
        id, ownerPhone, ownerEmail, userId, senderPhone, senderEmail, recipientPhone, recipientEmail,
        subject, body, read, folder, deletedAt, attachments, isDraft, recipientTrash, senderTrash, labels, createdAt
      )
      SELECT 
        id,
        CASE 
          WHEN folder = 'DRAFTS' OR COALESCE(isDraft, 0) = 1 THEN 
            COALESCE((SELECT phoneNumber FROM User WHERE email = senderEmail LIMIT 1),
              CASE WHEN senderEmail LIKE '%@zapmail.com' OR senderEmail LIKE '%@phonemail.com' THEN substr(senderEmail, 1, instr(senderEmail, '@') - 1) ELSE NULL END)
          WHEN folder = 'SENT' THEN 
            COALESCE((SELECT phoneNumber FROM User WHERE email = senderEmail LIMIT 1),
              CASE WHEN senderEmail LIKE '%@zapmail.com' OR senderEmail LIKE '%@phonemail.com' THEN substr(senderEmail, 1, instr(senderEmail, '@') - 1) ELSE NULL END)
          ELSE 
            COALESCE((SELECT phoneNumber FROM User WHERE email = recipientEmail LIMIT 1),
              CASE WHEN recipientEmail LIKE '%@zapmail.com' OR recipientEmail LIKE '%@phonemail.com' THEN substr(recipientEmail, 1, instr(recipientEmail, '@') - 1) ELSE NULL END)
        END AS ownerPhone,
        CASE 
          WHEN folder = 'DRAFTS' OR COALESCE(isDraft, 0) = 1 THEN senderEmail
          WHEN folder = 'SENT' THEN senderEmail
          ELSE recipientEmail
        END AS ownerEmail,
        NULL AS userId,
        COALESCE((SELECT phoneNumber FROM User WHERE email = senderEmail LIMIT 1),
          CASE WHEN senderEmail LIKE '%@zapmail.com' OR senderEmail LIKE '%@phonemail.com' THEN substr(senderEmail, 1, instr(senderEmail, '@') - 1) ELSE NULL END) AS senderPhone,
        senderEmail,
        COALESCE((SELECT phoneNumber FROM User WHERE email = recipientEmail LIMIT 1),
          CASE WHEN recipientEmail LIKE '%@zapmail.com' OR recipientEmail LIKE '%@phonemail.com' THEN substr(recipientEmail, 1, instr(recipientEmail, '@') - 1) ELSE NULL END) AS recipientPhone,
        recipientEmail,
        COALESCE(subject, '(No Subject)'),
        COALESCE(body, ''),
        COALESCE(read, 0),
        COALESCE(folder, 'INBOX'),
        deletedAt,
        COALESCE(attachments, '[]'),
        COALESCE(isDraft, 0),
        CASE WHEN folder = 'TRASH' THEN 1 ELSE 0 END AS recipientTrash,
        0 AS senderTrash,
        '[]' AS labels,
        COALESCE(createdAt, datetime('now'))
      FROM _Email_old;
      DROP TABLE _Email_old;
      COMMIT;
      PRAGMA foreign_keys=on;
    `);
  }

  // Create Email indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_email_owner_phone ON Email(ownerPhone);
    CREATE INDEX IF NOT EXISTS idx_email_owner_email ON Email(ownerEmail);
    CREATE INDEX IF NOT EXISTS idx_email_sender_phone ON Email(senderPhone);
    CREATE INDEX IF NOT EXISTS idx_email_recipient_phone ON Email(recipientPhone);
    CREATE INDEX IF NOT EXISTS idx_email_folder ON Email(folder);
    CREATE INDEX IF NOT EXISTS idx_email_created_at ON Email(createdAt);
  `);

  // Auto-migration for User columns: name, avatarUrl, language
  const userCols = db.prepare("PRAGMA table_info(User)").all().map(c => c.name);
  if (!userCols.includes('name')) {
    db.exec("ALTER TABLE User ADD COLUMN name TEXT DEFAULT 'ZapMail User'");
  }
  if (!userCols.includes('avatarUrl')) {
    db.exec("ALTER TABLE User ADD COLUMN avatarUrl TEXT DEFAULT NULL");
  }
  if (!userCols.includes('language')) {
    db.exec("ALTER TABLE User ADD COLUMN language TEXT DEFAULT 'English'");
  }

  // Safe migration for registeredVia CHECK constraint
  const userSqlRow = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'User'").get();
  if (userSqlRow && userSqlRow.sql && !userSqlRow.sql.includes("'WEB'")) {
    db.exec(`
      PRAGMA foreign_keys=off;
      BEGIN TRANSACTION;
      ALTER TABLE User RENAME TO _User_old;
      CREATE TABLE User (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT 'PhoneMail User',
        phoneNumber TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        passwordHash TEXT,
        avatarUrl TEXT DEFAULT NULL,
        registeredVia TEXT NOT NULL DEFAULT 'WEB' CHECK(registeredVia IN ('MOBILE_APP', 'WEB', 'PHONE_CALL', 'WEB_CLIENT', 'WEB_PORTAL', 'IVR')),
        language TEXT DEFAULT 'English',
        createdAt TEXT NOT NULL
      );
      INSERT INTO User (id, name, phoneNumber, email, passwordHash, avatarUrl, registeredVia, language, createdAt)
      SELECT id, COALESCE(name, 'PhoneMail User'), phoneNumber, email, passwordHash, avatarUrl,
             CASE WHEN registeredVia IN ('WEB_CLIENT', 'WEB_PORTAL') THEN 'WEB' ELSE registeredVia END,
             COALESCE(language, 'English'), createdAt
      FROM _User_old;
      DROP TABLE _User_old;
      COMMIT;
      PRAGMA foreign_keys=on;
    `);
  }

  // Create folder index after column is guaranteed to exist
  db.exec("CREATE INDEX IF NOT EXISTS idx_email_folder ON Email(folder);");

  // Auto-seed initial demo accounts if table is freshly created
  try {
    const userCount = db.prepare('SELECT COUNT(*) as count FROM User').get().count;
    if (userCount === 0) {
      console.log('🌱 Fresh SQLite database detected - auto-seeding initial demo accounts...');
      const { seedDatabase } = require('./seed');
      if (typeof seedDatabase === 'function') {
        seedDatabase().catch((e) => console.warn('Auto-seed notice:', e.message));
      }
    }
  } catch (err) {
    console.warn('Auto-seed check notice:', err.message);
  }
}

initDb();

// User model operations
const userQueries = {
  create: db.prepare(`
    INSERT INTO User (id, name, phoneNumber, email, passwordHash, avatarUrl, registeredVia, language, createdAt)
    VALUES (@id, COALESCE(@name, 'ZapMail User'), @phoneNumber, @email, @passwordHash, @avatarUrl, COALESCE(@registeredVia, 'WEB'), COALESCE(@language, 'English'), datetime('now'))
  `),
  findByPhone: db.prepare(`
    SELECT id, name, phoneNumber, email, passwordHash, avatarUrl, language, registeredVia, createdAt FROM User WHERE phoneNumber = ?
  `),
  findByEmail: db.prepare(`
    SELECT id, name, phoneNumber, email, passwordHash, avatarUrl, language, registeredVia, createdAt FROM User WHERE email = ?
  `),
  findById: db.prepare(`
    SELECT id, name, phoneNumber, email, avatarUrl, language, registeredVia, createdAt FROM User WHERE id = ?
  `),
  updateProfile: db.prepare(`
    UPDATE User 
    SET name = CASE WHEN @name IS NOT NULL THEN @name ELSE name END,
        avatarUrl = CASE WHEN @avatarUrl IS NOT NULL THEN @avatarUrl ELSE avatarUrl END,
        language = CASE WHEN @language IS NOT NULL THEN @language ELSE language END
    WHERE id = @id OR phoneNumber = @identifier OR email = @identifier
  `),
  updateLanguage: db.prepare(`
    UPDATE User SET language = @language WHERE id = @id OR phoneNumber = @identifier OR email = @identifier
  `),
  list: db.prepare(`
    SELECT id, name, phoneNumber, email, avatarUrl, language, registeredVia, createdAt FROM User ORDER BY createdAt DESC LIMIT ?
  `)
};

// Helper to extract 10-digit phone number from phone or email
function extractPhone(val) {
  if (!val) return null;
  const match = String(val).match(/(\d{10})/);
  return match ? match[1] : null;
}

// Multi-format phone lookup prepared statement (5 positional ? params)
const _findByPhoneMultiStmt = db.prepare(`
  SELECT id, name, phoneNumber, email, passwordHash, avatarUrl, language, registeredVia, createdAt
  FROM User
  WHERE phoneNumber = ?
     OR phoneNumber = ?
     OR phoneNumber = ?
     OR email      = ?
     OR email      = ?
  LIMIT 1
`);

/**
 * Looks up a user by phone number in all stored formats.
 * Matches: raw 10-digit, +91 prefix, 91 prefix, @zapmail.com email, +91...@zapmail.com email.
 * Prevents "new user" false-positive when registration format differs from login format.
 * @param {string} phoneInput
 * @returns {object|null}
 */
function findUserByPhone(phoneInput) {
  if (!phoneInput) return null;
  const digits = String(phoneInput).replace(/\D/g, '');
  const raw10 = digits.slice(-10);
  if (raw10.length !== 10) return null;
  const e164      = `+91${raw10}`;
  const with91    = `91${raw10}`;
  const emailFmt  = `${raw10}@zapmail.com`;
  const e164Email = `${e164}@zapmail.com`;
  return _findByPhoneMultiStmt.get(raw10, e164, with91, emailFmt, e164Email) || null;
}

// Email model statements supporting per-user mailbox data isolation
const insertEmailStmt = db.prepare(`
  INSERT INTO Email (
    id, ownerPhone, ownerEmail, userId, senderPhone, senderEmail, recipientPhone, recipientEmail,
    subject, body, read, folder, deletedAt, attachments, isDraft, recipientTrash, senderTrash, labels, createdAt
  ) VALUES (
    @id, @ownerPhone, @ownerEmail, @userId, @senderPhone, @senderEmail, @recipientPhone, @recipientEmail,
    @subject, @body, @read, @folder, @deletedAt, @attachments, @isDraft, @recipientTrash, @senderTrash, @labels, datetime('now')
  )
`);

const updateFolderScopedStmt = db.prepare(`
  UPDATE Email 
  SET folder = @folder, deletedAt = @deletedAt, recipientTrash = @recipientTrash, senderTrash = @senderTrash
  WHERE id = @id
    AND (
      (ownerPhone IS NOT NULL AND (ownerPhone = @phone OR ownerEmail = @email))
      OR (ownerPhone IS NULL AND (
        recipientPhone = @phone 
        OR senderPhone = @phone
        OR recipientEmail = @email
        OR senderEmail = @email
      ))
    )
`);

const updateFolderUnscopedStmt = db.prepare(`
  UPDATE Email 
  SET folder = @folder, deletedAt = @deletedAt, recipientTrash = @recipientTrash, senderTrash = @senderTrash
  WHERE id = @id
`);

const updateLabelsScopedStmt = db.prepare(`
  UPDATE Email 
  SET labels = @labels
  WHERE id = @id
    AND (
      (ownerPhone IS NOT NULL AND (ownerPhone = @phone OR ownerEmail = @email))
      OR (ownerPhone IS NULL AND (
        recipientPhone = @phone 
        OR senderPhone = @phone
        OR recipientEmail = @email
        OR senderEmail = @email
      ))
    )
`);

const updateLabelsUnscopedStmt = db.prepare(`
  UPDATE Email SET labels = @labels WHERE id = @id
`);

const updateDraftScopedStmt = db.prepare(`
  UPDATE Email 
  SET recipientPhone = @recipientPhone, recipientEmail = @recipientEmail, subject = @subject, body = @body, attachments = @attachments, isDraft = 1, folder = 'DRAFTS'
  WHERE id = @id
    AND (
      (ownerPhone IS NOT NULL AND (ownerPhone = @phone OR ownerEmail = @email))
      OR (ownerPhone IS NULL AND (senderPhone = @phone OR senderEmail = @email))
    )
`);

const markAsReadScopedStmt = db.prepare(`
  UPDATE Email SET read = 1 
  WHERE id = @id 
    AND (
      (ownerPhone IS NOT NULL AND (ownerPhone = @phone OR ownerEmail = @email))
      OR (ownerPhone IS NULL AND (
        recipientPhone = @phone 
        OR senderPhone = @phone
        OR recipientEmail = @email
        OR senderEmail = @email
      ))
    )
`);

const markAsReadUnscopedStmt = db.prepare(`
  UPDATE Email SET read = 1 WHERE id = ?
`);

const deleteScopedStmt = db.prepare(`
  DELETE FROM Email 
  WHERE id = @id 
    AND (
      (ownerPhone IS NOT NULL AND (ownerPhone = @phone OR ownerEmail = @email))
      OR (ownerPhone IS NULL AND (
        recipientPhone = @phone 
        OR senderPhone = @phone
        OR recipientEmail = @email
        OR senderEmail = @email
      ))
    )
`);

const deleteUnscopedStmt = db.prepare(`
  DELETE FROM Email WHERE id = ?
`);

const emailQueries = {
  create: {
    run: (params) => {
      const senderPhone = params.senderPhone || extractPhone(params.senderEmail);
      const recipientPhone = params.recipientPhone || extractPhone(params.recipientEmail);
      const ownerPhone = params.ownerPhone || recipientPhone || senderPhone;
      const ownerEmail = params.ownerEmail || (ownerPhone ? `${ownerPhone}@zapmail.com` : params.recipientEmail);

      return insertEmailStmt.run({
        id: params.id,
        ownerPhone,
        ownerEmail,
        userId: params.userId ?? null,
        senderPhone,
        senderEmail: params.senderEmail,
        recipientPhone,
        recipientEmail: params.recipientEmail,
        subject: params.subject ?? '(No Subject)',
        body: params.body ?? '',
        read: params.read ? 1 : 0,
        folder: params.folder || 'INBOX',
        deletedAt: params.deletedAt ?? null,
        attachments: typeof params.attachments === 'string' ? params.attachments : JSON.stringify(params.attachments || []),
        isDraft: params.isDraft ? 1 : 0,
        recipientTrash: params.recipientTrash ? 1 : 0,
        senderTrash: params.senderTrash ? 1 : 0,
        labels: typeof params.labels === 'string' ? params.labels : JSON.stringify(params.labels || [])
      });
    }
  },
  list: db.prepare(`
    SELECT id, ownerPhone, ownerEmail, userId, senderPhone, senderEmail, recipientPhone, recipientEmail, subject, body, read, folder, deletedAt, attachments, isDraft, recipientTrash, senderTrash, labels, createdAt 
    FROM Email 
    ORDER BY createdAt DESC 
    LIMIT ?
  `),
  findById: db.prepare(`
    SELECT id, ownerPhone, ownerEmail, userId, senderPhone, senderEmail, recipientPhone, recipientEmail, subject, body, read, folder, deletedAt, attachments, isDraft, recipientTrash, senderTrash, labels, createdAt 
    FROM Email 
    WHERE id = ?
  `),
  getAllForUser: db.prepare(`
    SELECT id, ownerPhone, ownerEmail, userId, senderPhone, senderEmail, recipientPhone, recipientEmail, subject, body, read, folder, deletedAt, attachments, isDraft, recipientTrash, senderTrash, labels, createdAt 
    FROM Email 
    WHERE (
      ownerPhone = @phone 
      OR ownerEmail = @email 
      OR (ownerPhone IS NULL AND (recipientPhone = @phone OR senderPhone = @phone OR recipientEmail = @email OR senderEmail = @email))
    )
    ORDER BY createdAt DESC 
    LIMIT @limit
  `),
  getInbox: db.prepare(`
    SELECT id, ownerPhone, ownerEmail, userId, senderPhone, senderEmail, recipientPhone, recipientEmail, subject, body, read, folder, deletedAt, attachments, isDraft, recipientTrash, senderTrash, labels, createdAt 
    FROM Email 
    WHERE (
      (ownerPhone = @phone OR (ownerPhone IS NULL AND (recipientPhone = @phone OR recipientEmail = @email)))
      AND (recipientPhone = @phone OR recipientEmail = @email)
      AND folder = 'INBOX'
      AND COALESCE(isDraft, 0) = 0
      AND COALESCE(recipientTrash, 0) = 0
    )
    ORDER BY createdAt DESC 
    LIMIT @limit
  `),
  getSent: db.prepare(`
    SELECT id, ownerPhone, ownerEmail, userId, senderPhone, senderEmail, recipientPhone, recipientEmail, subject, body, read, folder, deletedAt, attachments, isDraft, recipientTrash, senderTrash, labels, createdAt 
    FROM Email 
    WHERE (
      (ownerPhone = @phone OR (ownerPhone IS NULL AND (senderPhone = @phone OR senderEmail = @email)))
      AND (senderPhone = @phone OR senderEmail = @email)
      AND COALESCE(isDraft, 0) = 0
      AND folder != 'TRASH'
      AND folder != 'DRAFTS'
      AND COALESCE(senderTrash, 0) = 0
    )
    ORDER BY createdAt DESC 
    LIMIT @limit
  `),
  getDrafts: db.prepare(`
    SELECT id, ownerPhone, ownerEmail, userId, senderPhone, senderEmail, recipientPhone, recipientEmail, subject, body, read, folder, deletedAt, attachments, isDraft, recipientTrash, senderTrash, labels, createdAt 
    FROM Email 
    WHERE (
      (ownerPhone = @phone OR (ownerPhone IS NULL AND (senderPhone = @phone OR senderEmail = @email)))
      AND (senderPhone = @phone OR senderEmail = @email)
      AND (folder = 'DRAFTS' OR COALESCE(isDraft, 0) = 1)
      AND folder != 'TRASH'
    )
    ORDER BY createdAt DESC 
    LIMIT @limit
  `),
  getSpam: db.prepare(`
    SELECT id, ownerPhone, ownerEmail, userId, senderPhone, senderEmail, recipientPhone, recipientEmail, subject, body, read, folder, deletedAt, attachments, isDraft, recipientTrash, senderTrash, labels, createdAt 
    FROM Email 
    WHERE (
      (ownerPhone = @phone OR (ownerPhone IS NULL AND (recipientPhone = @phone OR recipientEmail = @email)))
      AND (recipientPhone = @phone OR recipientEmail = @email)
      AND folder = 'SPAM'
      AND COALESCE(recipientTrash, 0) = 0
    )
    ORDER BY createdAt DESC 
    LIMIT @limit
  `),
  getTrash: db.prepare(`
    SELECT id, ownerPhone, ownerEmail, userId, senderPhone, senderEmail, recipientPhone, recipientEmail, subject, body, read, folder, deletedAt, attachments, isDraft, recipientTrash, senderTrash, labels, createdAt 
    FROM Email 
    WHERE (
      (
        (ownerPhone = @phone AND folder = 'TRASH')
        OR
        (
          ((recipientPhone = @phone AND recipientTrash = 1) OR (senderPhone = @phone AND senderTrash = 1))
          AND folder = 'TRASH'
        )
      )
    )
    ORDER BY createdAt DESC 
    LIMIT @limit
  `),
  getByFolder: ({ phone, email, folder, limit = 100 }) => {
    const norm = (folder || 'INBOX').toUpperCase();
    if (norm === 'INBOX') return emailQueries.getInbox.all({ phone, email, limit });
    if (norm === 'SENT') return emailQueries.getSent.all({ phone, email, limit });
    if (norm === 'DRAFTS') return emailQueries.getDrafts.all({ phone, email, limit });
    if (norm === 'SPAM') return emailQueries.getSpam.all({ phone, email, limit });
    if (norm === 'TRASH') return emailQueries.getTrash.all({ phone, email, limit });
    return [];
  },
  getThread: db.prepare(`
    SELECT id, ownerPhone, ownerEmail, userId, senderPhone, senderEmail, recipientPhone, recipientEmail, subject, body, read, folder, deletedAt, attachments, isDraft, recipientTrash, senderTrash, labels, createdAt 
    FROM Email 
    WHERE (
      (
        (senderPhone = @userPhone OR senderEmail = @userEmail)
        AND (recipientPhone = @contactPhone OR recipientEmail = @contactEmail OR recipientEmail LIKE '%' || @contactPattern || '%')
      )
      OR
      (
        (recipientPhone = @userPhone OR recipientEmail = @userEmail OR recipientEmail LIKE '%' || @userPattern || '%')
        AND (senderPhone = @contactPhone OR senderEmail = @contactEmail OR senderEmail LIKE '%' || @contactPattern || '%')
      )
    )
    AND folder != 'TRASH'
    AND COALESCE(isDraft, 0) = 0
    ORDER BY createdAt ASC
  `),
  findByRecipient: db.prepare(`
    SELECT id, ownerPhone, ownerEmail, userId, senderPhone, senderEmail, recipientPhone, recipientEmail, subject, body, read, folder, deletedAt, attachments, isDraft, recipientTrash, senderTrash, labels, createdAt 
    FROM Email 
    WHERE recipientEmail = ? OR recipientEmail LIKE '%' || ? || '%' OR recipientPhone = ?
    ORDER BY createdAt DESC
  `),
  findBySender: db.prepare(`
    SELECT id, ownerPhone, ownerEmail, userId, senderPhone, senderEmail, recipientPhone, recipientEmail, subject, body, read, folder, deletedAt, attachments, isDraft, recipientTrash, senderTrash, labels, createdAt 
    FROM Email 
    WHERE senderEmail = ? OR senderEmail LIKE '%' || ? || '%' OR senderPhone = ?
    ORDER BY createdAt DESC
  `),
  findByFolder: db.prepare(`
    SELECT id, ownerPhone, ownerEmail, userId, senderPhone, senderEmail, recipientPhone, recipientEmail, subject, body, read, folder, deletedAt, attachments, isDraft, recipientTrash, senderTrash, labels, createdAt 
    FROM Email 
    WHERE folder = ?
    ORDER BY createdAt DESC
  `),
  findByUserAndFolder: db.prepare(`
    SELECT id, ownerPhone, ownerEmail, userId, senderPhone, senderEmail, recipientPhone, recipientEmail, subject, body, read, folder, deletedAt, attachments, isDraft, recipientTrash, senderTrash, labels, createdAt 
    FROM Email 
    WHERE (recipientEmail = ? OR recipientEmail LIKE '%' || ? || '%' OR senderEmail = ? OR senderEmail LIKE '%' || ? || '%')
      AND folder = ?
    ORDER BY createdAt DESC
  `),
  updateLabels: {
    run: (params) => {
      const labelsStr = typeof params.labels === 'string' ? params.labels : JSON.stringify(params.labels || []);
      if (params.phone || params.email) {
        return updateLabelsScopedStmt.run({
          id: params.id,
          labels: labelsStr,
          phone: params.phone || '',
          email: params.email || ''
        });
      }
      return updateLabelsUnscopedStmt.run({
        id: params.id,
        labels: labelsStr
      });
    }
  },
  updateFolder: {
    run: (params) => {
      const folder = (params.folder || 'INBOX').toUpperCase();
      const deletedAt = params.deletedAt !== undefined 
        ? params.deletedAt 
        : (folder === 'TRASH' ? new Date().toISOString() : null);
      const recipientTrash = params.recipientTrash !== undefined
        ? params.recipientTrash
        : (folder === 'TRASH' ? 1 : 0);
      const senderTrash = params.senderTrash !== undefined
        ? params.senderTrash
        : (folder === 'TRASH' ? 1 : 0);

      if (params.phone || params.email) {
        return updateFolderScopedStmt.run({
          id: params.id,
          phone: params.phone || '',
          email: params.email || '',
          folder,
          deletedAt,
          recipientTrash,
          senderTrash
        });
      }
      return updateFolderUnscopedStmt.run({
        id: params.id,
        folder,
        deletedAt,
        recipientTrash,
        senderTrash
      });
    }
  },
  updateDraft: {
    run: (params) => {
      const recipientPhone = params.recipientPhone || extractPhone(params.recipientEmail);
      return updateDraftScopedStmt.run({
        id: params.id,
        phone: params.phone || '',
        email: params.email || '',
        recipientPhone: recipientPhone || null,
        recipientEmail: params.recipientEmail || '',
        subject: params.subject || '',
        body: params.body || '',
        attachments: typeof params.attachments === 'string' ? params.attachments : JSON.stringify(params.attachments || [])
      });
    }
  },
  markAsRead: {
    run: (params) => {
      if (typeof params === 'object' && (params.phone || params.email)) {
        return markAsReadScopedStmt.run({
          id: params.id,
          phone: params.phone || '',
          email: params.email || ''
        });
      }
      const id = typeof params === 'string' ? params : params.id;
      return markAsReadUnscopedStmt.run(id);
    }
  },
  delete: {
    run: (params) => {
      if (typeof params === 'object' && (params.phone || params.email)) {
        return deleteScopedStmt.run({
          id: params.id,
          phone: params.phone || '',
          email: params.email || ''
        });
      }
      const id = typeof params === 'string' ? params : params.id;
      return deleteUnscopedStmt.run(id);
    }
  }
};

// SmsLog model operations
const smsQueries = {
  create: db.prepare(`
    INSERT INTO SmsLog (id, recipientPhone, senderEmail, subject, message, timestamp)
    VALUES (@id, @recipientPhone, @senderEmail, @subject, @message, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  `),
  list: db.prepare(`
    SELECT id, recipientPhone, senderEmail, subject, message, timestamp 
    FROM SmsLog 
    ORDER BY rowid DESC 
    LIMIT ?
  `)
};

module.exports = {
  db,
  userQueries,
  emailQueries,
  smsQueries,
  findUserByPhone
};
