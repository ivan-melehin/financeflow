// const ONE_C_URL = 'http://localhost/InfoBase/hs/financeflow/payment';
const ONE_C_URL = 'http://localhost/InfoBase/hs/financeflow/payment-test';

// Отправляет платёж из FinanceFlow в 1С.
async function sendPaymentTo1C(payment) {
  // Отправляем POST-запрос с данными платежа.
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
  // Проверяем успешность ответа 1С.
  if (!response.ok) {
    throw new Error(`1С вернула HTTP ${response.status}`);
  }
  // Получаем JSON-ответ от 1С.
  return await response.json();
}

module.exports = { sendPaymentTo1C };