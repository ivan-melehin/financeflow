const { sendPaymentTo1C } = require('./services/oneC');

// Проверяет отправку тестового платежа из Node.js в 1С.
async function test() {
  // Формируем тестовую заявку.
  const payment = {
    number: 'REQ-003',
    amount: 45000,
    description: 'Тест интеграции FinanceFlow с 1С'
  };
  // Отправляем заявку в 1С.
  const result = await sendPaymentTo1C(payment);
  // Выводим ответ 1С в консоль.
  console.log(result);
}

// Запускаем проверку интеграции.
test().catch(console.error);