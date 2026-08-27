const express = require('express');
const crypto = require('crypto');
const app = express();

app.use(express.json());

const BOT_TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN_HERE';

// Функция валидации Telegram initData
function verifyTelegramWebAppData(initData) {
  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get('hash');
  urlParams.delete('hash');

  const params = Array.from(urlParams.entries())
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(params).digest('hex');

  if (calculatedHash === hash) {
    return JSON.parse(urlParams.get('user'));
  }
  return null;
}

// Эндпоинт сохранения
app.post('/api/save_progress', (req, res) => {
  const initData = req.headers['x-telegram-init-data'];
  const user = verifyTelegramWebAppData(initData);

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized Telegram session' });
  }

  const userId = user.id;
  const saveData = req.body.saveData;

  // Здесь выполняем сохранение в базу данных (PostgreSQL / SQLite / MongoDB):
  // await db.query('INSERT INTO user_saves (user_id, data) VALUES ($1, $2) ON CONFLICT...', [userId, saveData]);

  return res.json({ success: true, message: 'Saved for user ' + userId });
});

// Эндпоинт загрузки
app.get('/api/load_progress', (req, res) => {
  const initData = req.headers['x-telegram-init-data'];
  const user = verifyTelegramWebAppData(initData);

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized Telegram session' });
  }

  // const saveData = await db.query('SELECT data FROM user_saves WHERE user_id = $1', [user.id]);
  // return res.json({ success: true, saveData: saveData.rows[0]?.data || null });

  return res.json({ success: true, saveData: null });
});

app.listen(3000, () => console.log('Server running on port 3000'));