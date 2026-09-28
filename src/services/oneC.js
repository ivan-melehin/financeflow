const ONE_C_URL = 'http://localhost/InfoBase/hs/financeflow/payment';

// Отправляет платёж из FinanceFlow в 1С через HTTP-сервис.
async function sendPaymentTo1C(payment) {
  // Отправляем POST-запрос в 1С с JSON-данными.
  const response = await fetch(ONE_C_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      number: payment.number,
      amount: payment.amount,
      description: payment.description
    })
  });
  // Проверяем, успешно ли 1С обработала запрос.
  if (!response.ok) {
    throw new Error(`1С вернула HTTP ${response.status}`);
  }
  // Получаем JSON-ответ от 1С.
  return await response.json();
}

module.exports = { sendPaymentTo1C };