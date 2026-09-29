const express = require('express');
const db = require('../db/database');
const router = express.Router();

// Получаем бюджеты вместе с названиями статей и использованными суммами.
router.get('/', (req, res) => {
  const budgets = db.prepare(`
    SELECT
      b.*,
      c.name AS category_name,
      COALESCE((
        SELECT SUM(r.amount)
        FROM expense_requests r
        WHERE r.category_id = b.category_id
          AND r.status IN ('pending_approval', 'approved', 'paid')
      ), 0) AS reserved_amount
    FROM budgets b
    JOIN expense_categories c ON c.id = b.category_id
    ORDER BY b.period_start DESC, c.name
  `).all();
  res.json(budgets);
});

// Создаём или изменяем бюджетный лимит статьи.
router.post('/', (req, res) => {
  const { categoryId, limitAmount, periodStart, periodEnd } = req.body;
  if (!categoryId || !limitAmount || !periodStart || !periodEnd) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Статья, лимит и период обязательны'
      }
    });
  }
  if (Number(limitAmount) <= 0) {
    return res.status(400).json({
      error: {
        code: 'INVALID_LIMIT',
        message: 'Лимит должен быть больше нуля'
      }
    });
  }
  if (periodStart > periodEnd) {
    return res.status(400).json({
      error: {
        code: 'INVALID_PERIOD',
        message: 'Дата начала не может быть позже даты окончания'
      }
    });
  }
  const category = db.prepare(`
    SELECT id, name
    FROM expense_categories
    WHERE id = ? AND active = 1
  `).get(categoryId);
  if (!category) {
    return res.status(404).json({
      error: {
        code: 'CATEGORY_NOT_FOUND',
        message: 'Статья расходов не найдена'
      }
    });
  }
  const existingBudget = db.prepare(`
    SELECT id
    FROM budgets
    WHERE category_id = ?
      AND period_start = ?
      AND period_end = ?
  `).get(categoryId, periodStart, periodEnd);
  if (existingBudget) {
    db.prepare(`
      UPDATE budgets
      SET limit_amount = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(limitAmount, existingBudget.id);
    const updatedBudget = db.prepare(`
      SELECT
        b.*,
        c.name AS category_name
      FROM budgets b
      JOIN expense_categories c ON c.id = b.category_id
      WHERE b.id = ?
    `).get(existingBudget.id);
    return res.json(updatedBudget);
  }
  const result = db.prepare(`
    INSERT INTO budgets (
      category_id,
      limit_amount,
      period_start,
      period_end
    )
    VALUES (?, ?, ?, ?)
  `).run(categoryId, limitAmount, periodStart, periodEnd);
  const budget = db.prepare(`
    SELECT
      b.*,
      c.name AS category_name
    FROM budgets b
    JOIN expense_categories c ON c.id = b.category_id
    WHERE b.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json(budget);
});

// Удаляем бюджетный лимит.
router.delete('/:id', (req, res) => {
  const budget = db.prepare(`
    SELECT id
    FROM budgets
    WHERE id = ?
  `).get(req.params.id);
  if (!budget) {
    return res.status(404).json({
      error: {
        code: 'BUDGET_NOT_FOUND',
        message: 'Бюджет не найден'
      }
    });
  }
  db.prepare(`
    DELETE FROM budgets
    WHERE id = ?
  `).run(req.params.id);
  res.json({
    success: true
  });
});

module.exports = router;