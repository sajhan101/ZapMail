const { db } = require('../db');

console.log('Tables:');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.table(tables);

console.log('\nUsers:');
const users = db.prepare('SELECT id, phoneNumber, email, registeredVia, createdAt FROM User').all();
console.table(users);

console.log('\nEmails:');
const emails = db.prepare('SELECT id, senderEmail, recipientEmail, subject, read, createdAt FROM Email').all();
console.table(emails);

console.log('\nSMS Logs:');
const smsLogs = db.prepare('SELECT id, recipientPhone, senderEmail, subject, message, timestamp FROM SmsLog').all();
console.table(smsLogs);
