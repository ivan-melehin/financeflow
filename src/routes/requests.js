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

// Редактируем финансовую заявку, если она ещё находится в статусе draft.
router.put('/:id', (req, res) => {
  const { amount, description } = req.body;

  // Ищем заявку по ID.
  const request = db.prepare(`
    SELECT * FROM expense_requests
    WHERE id = ?
  `).get(req.params.id);

  // Возвращаем ошибку, если заявка не найдена.
  if (!request) {
    return res.status(404).json({
      error: {
        code: 'REQUEST_NOT_FOUND',
        message: 'Заявка не найдена'
      }
    });
  }

  // Запрещаем редактирование заявки после отправки на согласование.
  if (request.status !== 'draft') {
    return res.status(409).json({
      error: {
        code: 'REQUEST_NOT_EDITABLE',
        message: 'Редактировать можно только заявку в статусе draft'
      }
    });
  }

  // Проверяем, что сумма передана и является положительным числом.
  if (amount === undefined || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({
      error: {
        code: 'INVALID_AMOUNT',
        message: 'Сумма должна быть положительным числом'
      }
    });
  }

  // Проверяем, что описание передано.
  if (!description) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Описание обязательно'
      }
    });
  }

  // Обновляем сумму и описание заявки в базе данных.
  db.prepare(`
    UPDATE expense_requests
    SET amount = ?, description = ?
    WHERE id = ?
  `).run(amount, description, req.params.id);

  // Получаем обновлённую заявку из базы данных.
  const updatedRequest = db.prepare(`
    SELECT * FROM expense_requests
    WHERE id = ?
  `).get(req.params.id);

  // Возвращаем обновлённую заявку.
  res.json(updatedRequest);
});

// Отправляем заявку на согласование, если она находится в статусе draft.
router.post('/:id/submit', (req, res) => {
  // Ищем заявку по ID.
  const request = db.prepare(`
    SELECT * FROM expense_requests
    WHERE id = ?
  `).get(req.params.id);

  // Возвращаем ошибку, если заявка не найдена.
  if (!request) {
    return res.status(404).json({
      error: {
        code: 'REQUEST_NOT_FOUND',
        message: 'Заявка не найдена'
      }
    });
  }

  // Проверяем, что отправить можно только заявку в статусе draft.
  if (request.status !== 'draft') {
    return res.status(409).json({
      error: {
        code: 'REQUEST_NOT_SUBMITTABLE',
        message: 'На согласование можно отправить только заявку в статусе draft'
      }
    });
  }

  // Меняем статус заявки на ожидание согласования.
  db.prepare(`
    UPDATE expense_requests
    SET status = ?
    WHERE id = ?
  `).run('pending_approval', req.params.id);

  // Получаем обновлённую заявку.
  const updatedRequest = db.prepare(`
    SELECT * FROM expense_requests
    WHERE id = ?
  `).get(req.params.id);

  // Возвращаем заявку с новым статусом.
  res.json(updatedRequest);
});

// Согласовываем заявку, которая ожидает решения руководителя.
router.post('/:id/approve', (req, res) => {
  const { approverName, comment } = req.body;

  // Ищем заявку по ID.
  const request = db.prepare(`
    SELECT * FROM expense_requests
    WHERE id = ?
  `).get(req.params.id);

  // Возвращаем ошибку, если заявка не найдена.
  if (!request) {
    return res.status(404).json({
      error: {
        code: 'REQUEST_NOT_FOUND',
        message: 'Заявка не найдена'
      }
    });
  }

  // Проверяем, что согласовать можно только заявку на согласовании.
  if (request.status !== 'pending_approval') {
    return res.status(409).json({
      error: {
        code: 'REQUEST_NOT_APPROVABLE',
        message: 'Согласовать можно только заявку в статусе pending_approval'
      }
    });
  }

  // Проверяем имя сотрудника, который согласовывает заявку.
  if (!approverName) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Имя согласующего обязательно'
      }
    });
  }

  // Меняем статус заявки на approved.
  db.prepare(`
    UPDATE expense_requests
    SET status = ?
    WHERE id = ?
  `).run('approved', req.params.id);

  // Сохраняем решение руководителя в истории согласований.
  db.prepare(`
    INSERT INTO approvals (request_id, approver_name, status, comment)
    VALUES (?, ?, ?, ?)
  `).run(req.params.id, approverName, 'approved', comment || null);

  // Получаем обновлённую заявку.
  const updatedRequest = db.prepare(`
    SELECT * FROM expense_requests
    WHERE id = ?
  `).get(req.params.id);

  // Возвращаем результат согласования.
  res.json(updatedRequest);
});

// Отклоняем заявку, которая ожидает решения руководителя.
router.post('/:id/reject', (req, res) => {
  const { approverName, comment } = req.body;

  // Ищем заявку по ID.
  const request = db.prepare(`
    SELECT * FROM expense_requests
    WHERE id = ?
  `).get(req.params.id);

  // Возвращаем ошибку, если заявка не найдена.
  if (!request) {
    return res.status(404).json({
      error: {
        code: 'REQUEST_NOT_FOUND',
        message: 'Заявка не найдена'
      }
    });
  }

  // Проверяем, что отклонить можно только заявку на согласовании.
  if (request.status !== 'pending_approval') {
    return res.status(409).json({
      error: {
        code: 'REQUEST_NOT_REJECTABLE',
        message: 'Отклонить можно только заявку в статусе pending_approval'
      }
    });
  }

  // Проверяем имя сотрудника, который принимает решение.
  if (!approverName) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Имя согласующего обязательно'
      }
    });
  }

  // Проверяем, что причина отклонения указана.
  if (!comment) {
    return res.status(400).json({
      error: {
        code: 'REJECTION_COMMENT_REQUIRED',
        message: 'Причина отклонения обязательна'
      }
    });
  }

  // Меняем статус заявки на rejected.
  db.prepare(`
    UPDATE expense_requests
    SET status = ?
    WHERE id = ?
  `).run('rejected', req.params.id);

  // Сохраняем решение руководителя в истории согласований.
  db.prepare(`
    INSERT INTO approvals (request_id, approver_name, status, comment)
    VALUES (?, ?, ?, ?)
  `).run(req.params.id, approverName, 'rejected', comment);

  // Получаем обновлённую заявку.
  const updatedRequest = db.prepare(`
    SELECT * FROM expense_requests
    WHERE id = ?
  `).get(req.params.id);

  // Возвращаем результат отклонения.
  res.json(updatedRequest);
});

// Оплачиваем заявку, если она была согласована.
router.post('/:id/pay', (req, res) => {
  // Ищем заявку по ID.
  const request = db.prepare(`
    SELECT * FROM expense_requests
    WHERE id = ?
  `).get(req.params.id);

  // Возвращаем ошибку, если заявка не найдена.
  if (!request) {
    return res.status(404).json({
      error: {
        code: 'REQUEST_NOT_FOUND',
        message: 'Заявка не найдена'
      }
    });
  }

  // Проверяем, что оплачивать можно только согласованную заявку.
  if (request.status !== 'approved') {
    return res.status(409).json({
      error: {
        code: 'REQUEST_NOT_PAYABLE',
        message: 'Оплатить можно только согласованную заявку'
      }
    });
  }

  // Создаём запись о платеже в базе данных.
  db.prepare(`
    INSERT INTO payments (request_id, amount)
    VALUES (?, ?)
  `).run(request.id, request.amount);

  // Меняем статус заявки на paid.
  db.prepare(`
    UPDATE expense_requests
    SET status = ?
    WHERE id = ?
  `).run('paid', request.id);

  // Получаем обновлённую заявку.
  const updatedRequest = db.prepare(`
    SELECT * FROM expense_requests
    WHERE id = ?
  `).get(request.id);

  // Возвращаем результат оплаты.
  res.json(updatedRequest);
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