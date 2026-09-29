const Database = require('better-sqlite3');

// Создаём или открываем файл базы данных FinanceFlow.
const db = new Database('financeflow.db');

// Включаем контроль внешних ключей SQLite.
db.pragma('foreign_keys = ON');

// Создаём таблицу заявок.
db.exec(`
  CREATE TABLE IF NOT EXISTS expense_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT NOT NULL UNIQUE,
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    category_id INTEGER,
    FOREIGN KEY (category_id) REFERENCES expense_categories(id)
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

// Создаём таблицу статей расходов.
db.exec(`
  CREATE TABLE IF NOT EXISTS expense_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    active INTEGER NOT NULL DEFAULT 1
  )
`);

// Добавляем связь заявки со статьёй в уже существующую базу.
const requestColumns = db.prepare('PRAGMA table_info(expense_requests)').all();
if (!requestColumns.some(column => column.name === 'category_id')) {
  db.exec('ALTER TABLE expense_requests ADD COLUMN category_id INTEGER');
}

// Создаём таблицу бюджетных лимитов.
db.exec(`
  CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    limit_amount REAL NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES expense_categories(id)
  )
`);

// Создаём индекс для быстрого поиска бюджета по статье.
db.exec('CREATE INDEX IF NOT EXISTS idx_budgets_category_id ON budgets(category_id)');

// Добавляем базовые статьи расходов для демонстрации.
db.prepare(`
  INSERT OR IGNORE INTO expense_categories (name, description)
  VALUES (?, ?)
`).run('Подрядчики', 'Оплата услуг подрядчиков');

// Добавляем вторую базовую статью расходов для демонстрации.
db.prepare(`
  INSERT OR IGNORE INTO expense_categories (name, description)
  VALUES (?, ?)
`).run('Программное обеспечение', 'Лицензии и программные продукты');

module.exports = db;
