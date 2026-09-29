const express = require('express');
const db = require('../db/database');
const router = express.Router();

// Получаем все активные статьи расходов.
router.get('/', (req, res) => {
  const categories = db.prepare(`
    SELECT id, name, description, active
    FROM expense_categories
    WHERE active = 1
    ORDER BY name
  `).all();
  res.json(categories);
});

// Создаём новую статью расходов.
router.post('/', (req, res) => {
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Название статьи обязательно'
      }
    });
  }
  try {
    const result = db.prepare(`
      INSERT INTO expense_categories (name, description)
      VALUES (?, ?)
    `).run(name.trim(), description || null);
    const category = db.prepare(`
      SELECT id, name, description, active
      FROM expense_categories
      WHERE id = ?
    `).get(result.lastInsertRowid);
    res.status(201).json(category);
  } catch (error) {
    res.status(409).json({
      error: {
        code: 'CATEGORY_EXISTS',
        message: 'Статья с таким названием уже существует'
      }
    });
  }
});

// Изменяем статью расходов.
router.put('/:id', (req, res) => {
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Название статьи обязательно'
      }
    });
  }
  const category = db.prepare(`
    SELECT *
    FROM expense_categories
    WHERE id = ?
  `).get(req.params.id);
  if (!category) {
    return res.status(404).json({
      error: {
        code: 'CATEGORY_NOT_FOUND',
        message: 'Статья расходов не найдена'
      }
    });
  }
  try {
    db.prepare(`
      UPDATE expense_categories
      SET name = ?, description = ?
      WHERE id = ?
    `).run(name.trim(), description || null, req.params.id);
    const updatedCategory = db.prepare(`
      SELECT id, name, description, active
      FROM expense_categories
      WHERE id = ?
    `).get(req.params.id);
    res.json(updatedCategory);
  } catch (error) {
    res.status(409).json({
      error: {
        code: 'CATEGORY_EXISTS',
        message: 'Статья с таким названием уже существует'
      }
    });
  }
});

// Отключаем статью расходов вместо физического удаления.
router.delete('/:id', (req, res) => {
  const category = db.prepare(`
    SELECT *
    FROM expense_categories
    WHERE id = ?
  `).get(req.params.id);
  if (!category) {
    return res.status(404).json({
      error: {
        code: 'CATEGORY_NOT_FOUND',
        message: 'Статья расходов не найдена'
      }
    });
  }
  const requestsCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM expense_requests
    WHERE category_id = ?
  `).get(req.params.id);
  if (requestsCount.count > 0) {
    return res.status(409).json({
      error: {
        code: 'CATEGORY_IN_USE',
        message: 'Статью нельзя удалить, потому что она используется в заявках'
      }
    });
  }
  db.prepare(`
    UPDATE expense_categories
    SET active = 0
    WHERE id = ?
  `).run(req.params.id);
  res.json({
    success: true
  });
});

module.exports = router;