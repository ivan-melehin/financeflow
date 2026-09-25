const Database = require('better-sqlite3');

// Создаём или открываем файл базы данных FinanceFlow.
const db = new Database('financeflow.db');

// Создаём таблицу заявок.
db.exec(`
  CREATE TABLE IF NOT EXISTS expense_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT NOT NULL UNIQUE,
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

// Создаём таблицу истории согласований.
db.exec(`
  CREATE TABLE IF NOT EXISTS approvals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL,
    approver_name TEXT NOT NULL,
    status TEXT NOT NULL,
    comment TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES expense_requests(id)
  )
`);

// Создаём таблицу платежей.
db.exec(`
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'paid',
    FOREIGN KEY (request_id) REFERENCES expense_requests(id)
  )
`);

module.exports = db;