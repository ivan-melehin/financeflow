require('dotenv').config();
const express = require('express');
const requestsRouter = require('./routes/requests');

const app = express();
const PORT = process.env.PORT || 3000;

const path = require('path');

const categoriesRouter = require('./routes/categories');
const budgetsRouter = require('./routes/budgets');

// Разрешаем Express отдавать файлы интерфейса из папки public.
app.use(express.static(path.join(__dirname, '../public')));

// Разрешаем API принимать JSON в теле запроса.
app.use(express.json());

// Проверяем, что API запущен.
app.get('/', (req, res) => {
  res.json({
    name: 'FinanceFlow API',
    status: 'ok'
  });
});

// Подключаем маршруты финансовых заявок.
app.use('/api/requests', requestsRouter);

// Подключаем маршруты статей расходов.
app.use('/api/categories', categoriesRouter);

// Подключаем маршруты бюджетов.
app.use('/api/budgets', budgetsRouter);

// Запускаем сервер на порту Render или 3000 локально.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`FinanceFlow API запущен на порту ${PORT}`);
});