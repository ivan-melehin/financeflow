const express = require('express');
const db = require('../db/database');

const router = express.Router();

// Создаём новую финансовую заявку и проверяем входные данные.
router.post('/', (req, res) => {
  const { number, amount, description } = req.body;

  // Проверяем обязательные поля.
  if (!number || amount === undefined || !description) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Номер, сумма и описание обязательны'
      }
    });
  }

  // Проверяем, что сумма является положительным числом.
  if (typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({
      error: {
        code: 'INVALID_AMOUNT',
        message: 'Сумма должна быть положительным числом'
      }
    });
  }

  // Проверяем, что заявки с таким номером ещё нет.
  const existingRequest = db.prepare(`
    SELECT id FROM expense_requests
    WHERE number = ?
  `).get(number);

  if (existingRequest) {
    return res.status(409).json({
      error: {
        code: 'DUPLICATE_NUMBER',
        message: 'Заявка с таким номером уже существует'
      }
    });
  }

  // Сохраняем прошедшую валидацию заявку в базу данных.
  const result = db.prepare(`
    INSERT INTO expense_requests (number, amount, description)
    VALUES (?, ?, ?)
  `).run(number, amount, description);

  // Возвращаем созданную заявку.
  res.status(201).json({
    id: result.lastInsertRowid,
    number,
    amount,
    description,
    status: 'draft'
  });
});

// Получаем список всех финансовых заявок.
router.get('/', (req, res) => {
  const requests = db.prepare(`
    SELECT * FROM expense_requests
    ORDER BY id DESC
  `).all();

  res.json(requests);
});

// Получаем одну финансовую заявку по ID.
router.get('/:id', (req, res) => {
  const request = db.prepare(`
    SELECT * FROM expense_requests
    WHERE id = ?
  `).get(req.params.id);

  if (!request) {
    return res.status(404).json({
      error: 'Заявка не найдена'
    });
  }

  res.json(request);
});

module.exports = router;