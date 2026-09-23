const express = require('express');
const requestsRouter = require('./routes/requests');

const app = express();
const PORT = 3000;

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

// Запускаем сервер.
app.listen(PORT, () => {
  console.log(`FinanceFlow API запущен: http://localhost:${PORT}`);
});