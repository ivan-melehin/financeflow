const express = require('express');
const db = require('../db/database');
const { sendPaymentTo1C } = require('../services/oneC');
const router = express.Router();

// Создаём номер следующей заявки на основе максимального ID.
function generateRequestNumber() {
  const row = db.prepare(`
    SELECT COALESCE(MAX(id), 0) + 1 AS next_id
    FROM expense_requests
  `).get();
  return `FF-${String(row.next_id).padStart(4, '0')}`;
}

// Получаем действующий бюджет выбранной статьи расходов.
function getCurrentBudget(categoryId) {
  return db.prepare(`
    SELECT *
    FROM budgets
    WHERE category_id = ?
      AND date('now') BETWEEN date(period_start) AND date(period_end)
    ORDER BY id DESC
    LIMIT 1
  `).get(categoryId);
}

// Считаем сумму заявок, которая уже использует бюджет статьи.
function getReservedAmount(categoryId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS reserved_amount
    FROM expense_requests
    WHERE category_id = ?
      AND status IN ('pending_approval', 'approved', 'paid')
  `).get(categoryId);
  return row.reserved_amount;
}

// Создаём новую заявку с автоматическим номером.
router.post('/', (req, res) => {
  const { amount, description, categoryId } = req.body;
  if (amount === undefined || !description || !categoryId) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Сумма, описание и статья расходов обязательны'
      }
    });
  }
  if (typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({
      error: {
        code: 'INVALID_AMOUNT',
        message: 'Сумма должна быть положительным числом'
      }
    });
  }
  const category = db.prepare(`
    SELECT id, name
    FROM expense_categories
    WHERE id = ? AND active = 1
  `).get(categoryId);
  if (!category) {
    return res.status(400).json({
      error: {
        code: 'CATEGORY_NOT_FOUND',
        message: 'Статья расходов не найдена или отключена'
      }
    });
  }
  const number = generateRequestNumber();
  const result = db.prepare(`
    INSERT INTO expense_requests (number, amount, description, category_id)
    VALUES (?, ?, ?, ?)
  `).run(number, amount, description, category.id);
  res.status(201).json({
    id: result.lastInsertRowid,
    number,
    amount,
    description,
    categoryId: category.id,
    categoryName: category.name,
    status: 'draft'
  });
});

// Получаем список заявок вместе с названиями статей расходов.
router.get('/', (req, res) => {
  const requests = db.prepare(`
    SELECT
      r.*,
      c.name AS category_name
    FROM expense_requests r
    LEFT JOIN expense_categories c ON c.id = r.category_id
    ORDER BY r.id DESC
  `).all();
  res.json(requests);
});

// Редактируем заявку, пока она находится в статусе draft.
router.put('/:id', (req, res) => {
  const { amount, description, categoryId } = req.body;
  const request = db.prepare(`
    SELECT *
    FROM expense_requests
    WHERE id = ?
  `).get(req.params.id);
  if (!request) {
    return res.status(404).json({
      error: {
        code: 'REQUEST_NOT_FOUND',
        message: 'Заявка не найдена'
      }
    });
  }
  if (request.status !== 'draft') {
    return res.status(409).json({
      error: {
        code: 'REQUEST_NOT_EDITABLE',
        message: 'Редактировать можно только заявку в статусе draft'
      }
    });
  }
  if (amount === undefined || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({
      error: {
        code: 'INVALID_AMOUNT',
        message: 'Сумма должна быть положительным числом'
      }
    });
  }
  if (!description || !categoryId) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Сумма, описание и статья расходов обязательны'
      }
    });
  }
  const category = db.prepare(`
    SELECT id, name
    FROM expense_categories
    WHERE id = ? AND active = 1
  `).get(categoryId);
  if (!category) {
    return res.status(400).json({
      error: {
        code: 'CATEGORY_NOT_FOUND',
        message: 'Статья расходов не найдена или отключена'
      }
    });
  }
  db.prepare(`
    UPDATE expense_requests
    SET amount = ?, description = ?, category_id = ?
    WHERE id = ?
  `).run(amount, description, category.id, req.params.id);
  const updatedRequest = db.prepare(`
    SELECT
      r.*,
      c.name AS category_name
    FROM expense_requests r
    LEFT JOIN expense_categories c ON c.id = r.category_id
    WHERE r.id = ?
  `).get(req.params.id);
  res.json(updatedRequest);
});

// Удаляем заявку, пока она находится в статусе draft.
router.delete('/:id', (req, res) => {
  // Получаем заявку по ID.
  const request = db.prepare(`
    SELECT *
    FROM expense_requests
    WHERE id = ?
  `).get(req.params.id);
  // Проверяем, существует ли заявка.
  if (!request) {
    return res.status(404).json({
      error: {
        code: 'REQUEST_NOT_FOUND',
        message: 'Заявка не найдена'
      }
    });
  }
  // Разрешаем удаление только черновика.
  if (request.status !== 'draft') {
    return res.status(409).json({
      error: {
        code: 'REQUEST_NOT_DELETABLE',
        message: 'Удалить можно только заявку в статусе draft'
      }
    });
  }
  // Удаляем заявку из базы данных.
  db.prepare(`
    DELETE FROM expense_requests
    WHERE id = ?
  `).run(req.params.id);
  // Возвращаем подтверждение удаления.
  res.json({
    success: true,
    message: 'Заявка удалена',
    id: Number(req.params.id)
  });
});

// Отправляем заявку на согласование после проверки бюджета.
router.post('/:id/submit', (req, res) => {
  const request = db.prepare(`
    SELECT *
    FROM expense_requests
    WHERE id = ?
  `).get(req.params.id);
  if (!request) {
    return res.status(404).json({
      error: {
        code: 'REQUEST_NOT_FOUND',
        message: 'Заявка не найдена'
      }
    });
  }
  if (request.status !== 'draft') {
    return res.status(409).json({
      error: {
        code: 'REQUEST_NOT_SUBMITTABLE',
        message: 'На согласование можно отправить только заявку в статусе draft'
      }
    });
  }
  if (!request.category_id) {
    return res.status(409).json({
      error: {
        code: 'CATEGORY_REQUIRED',
        message: 'Для отправки заявки необходимо выбрать статью расходов'
      }
    });
  }
  const budget = getCurrentBudget(request.category_id);
  if (!budget) {
    return res.status(409).json({
      error: {
        code: 'BUDGET_NOT_FOUND',
        message: 'Для выбранной статьи расходов не установлен действующий бюджет'
      }
    });
  }
  const reservedAmount = getReservedAmount(request.category_id);
  const remainingAmount = budget.limit_amount - reservedAmount;
  if (request.amount > remainingAmount) {
    return res.status(409).json({
      error: {
        code: 'BUDGET_EXCEEDED',
        message: 'Сумма заявки превышает доступный бюджет',
        limitAmount: budget.limit_amount,
        reservedAmount,
        remainingAmount
      }
    });
  }
  db.prepare(`
    UPDATE expense_requests
    SET status = ?
    WHERE id = ?
  `).run('pending_approval', req.params.id);
  const updatedRequest = db.prepare(`
    SELECT
      r.*,
      c.name AS category_name
    FROM expense_requests r
    LEFT JOIN expense_categories c ON c.id = r.category_id
    WHERE r.id = ?
  `).get(req.params.id);
  res.json(updatedRequest);
});

// Согласовываем заявку, которая ожидает решения руководителя.
router.post('/:id/approve', (req, res) => {
  const { approverName, comment } = req.body;
  const request = db.prepare(`
    SELECT *
    FROM expense_requests
    WHERE id = ?
  `).get(req.params.id);
  if (!request) {
    return res.status(404).json({
      error: {
        code: 'REQUEST_NOT_FOUND',
        message: 'Заявка не найдена'
      }
    });
  }
  if (request.status !== 'pending_approval') {
    return res.status(409).json({
      error: {
        code: 'REQUEST_NOT_APPROVABLE',
        message: 'Согласовать можно только заявку в статусе pending_approval'
      }
    });
  }
  if (!approverName) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Имя согласующего обязательно'
      }
    });
  }
  db.prepare(`
    UPDATE expense_requests
    SET status = ?
    WHERE id = ?
  `).run('approved', req.params.id);
  db.prepare(`
    INSERT INTO approvals (request_id, approver_name, status, comment)
    VALUES (?, ?, ?, ?)
  `).run(req.params.id, approverName, 'approved', comment || null);
  const updatedRequest = db.prepare(`
    SELECT *
    FROM expense_requests
    WHERE id = ?
  `).get(req.params.id);
  res.json(updatedRequest);
});

// Отклоняем заявку с обязательным комментарием руководителя.
router.post('/:id/reject', (req, res) => {
  const { approverName, comment } = req.body;
  const request = db.prepare(`
    SELECT *
    FROM expense_requests
    WHERE id = ?
  `).get(req.params.id);
  if (!request) {
    return res.status(404).json({
      error: {
        code: 'REQUEST_NOT_FOUND',
        message: 'Заявка не найдена'
      }
    });
  }
  if (request.status !== 'pending_approval') {
    return res.status(409).json({
      error: {
        code: 'REQUEST_NOT_REJECTABLE',
        message: 'Отклонить можно только заявку в статусе pending_approval'
      }
    });
  }
  if (!approverName) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Имя согласующего обязательно'
      }
    });
  }
  if (!comment) {
    return res.status(400).json({
      error: {
        code: 'REJECTION_COMMENT_REQUIRED',
        message: 'Причина отклонения обязательна'
      }
    });
  }
  db.prepare(`
    UPDATE expense_requests
    SET status = ?
    WHERE id = ?
  `).run('rejected', req.params.id);
  db.prepare(`
    INSERT INTO approvals (request_id, approver_name, status, comment)
    VALUES (?, ?, ?, ?)
  `).run(req.params.id, approverName, 'rejected', comment);
  const updatedRequest = db.prepare(`
    SELECT *
    FROM expense_requests
    WHERE id = ?
  `).get(req.params.id);
  res.json(updatedRequest);
});

// Оплачиваем согласованную заявку и передаём платёж в 1С.
router.post('/:id/pay', async (req, res) => {
  const request = db.prepare(`
    SELECT *
    FROM expense_requests
    WHERE id = ?
  `).get(req.params.id);
  if (!request) {
    return res.status(404).json({
      error: {
        code: 'REQUEST_NOT_FOUND',
        message: 'Заявка не найдена'
      }
    });
  }
  if (request.status !== 'approved') {
    return res.status(409).json({
      error: {
        code: 'REQUEST_NOT_PAYABLE',
        message: 'Оплатить можно только согласованную заявку'
      }
    });
  }
  try {
    const oneCResult = await sendPaymentTo1C(request);
    db.prepare(`
      INSERT INTO payments (request_id, amount)
      VALUES (?, ?)
    `).run(request.id, request.amount);
    db.prepare(`
      UPDATE expense_requests
      SET status = ?
      WHERE id = ?
    `).run('paid', request.id);
    const updatedRequest = db.prepare(`
      SELECT *
      FROM expense_requests
      WHERE id = ?
    `).get(request.id);
    res.json({
      request: updatedRequest,
      oneC: oneCResult
    });
  } catch (error) {
    res.status(502).json({
      error: {
        code: 'ONE_C_INTEGRATION_ERROR',
        message: 'Не удалось передать платёж в 1С',
        details: error.message
      }
    });
  }
});

// Получаем одну заявку по ID вместе со статьёй расходов.
router.get('/:id', (req, res) => {
  const request = db.prepare(`
    SELECT
      r.*,
      c.name AS category_name
    FROM expense_requests r
    LEFT JOIN expense_categories c ON c.id = r.category_id
    WHERE r.id = ?
  `).get(req.params.id);
  if (!request) {
    return res.status(404).json({
      error: 'Заявка не найдена'
    });
  }
  res.json(request);
});

module.exports = router;