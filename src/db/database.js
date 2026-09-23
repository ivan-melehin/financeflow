const Database = require('better-sqlite3');

// Создаём или открываем файл базы данных FinanceFlow.
const db = new Database('financeflow.db');

// Создаём таблицу заявок, если её ещё нет.
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

module.exports = db;