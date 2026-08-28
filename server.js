/**
 * RayChaser RPG — Telegram Mini App backend
 *
 * Endpoints:
 *   POST /api/auth   — проверка initData от Telegram WebApp
 *   GET  /api/save   — загрузка прогресса
 *   POST /api/save   — сохранение прогресса
 *   GET  /health     — healthcheck
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
const DATA_DIR = path.join(__dirname, 'data');
const SAVES_FILE = path.join(DATA_DIR, 'saves.json');

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN не задан! Создай .env из .env.example');
  process.exit(1);
}

// --- файловое хранилище сохранений ---
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SAVES_FILE)) fs.writeFileSync(SAVES_FILE, '{}', 'utf8');

function loadSaves() {
  try {
    return JSON.parse(fs.readFileSync(SAVES_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeSaves(saves) {
  fs.writeFileSync(SAVES_FILE, JSON.stringify(saves, null, 2), 'utf8');
}

// --- валидация Telegram WebApp initData ---
// Документация: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
function validateInitData(initData) {
  if (!initData || typeof initData !== 'string') {
    return { ok: false, error: 'initData отсутствует' };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { ok: false, error: 'hash отсутствует' };

  // data-check-string: все поля кроме hash, отсортированные, key=value через \n
  const pairs = [];
  for (const [key, value] of params.entries()) {
    if (key !== 'hash') pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  // secret_key = HMAC_SHA256(bot_token, key="WebAppData")
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(BOT_TOKEN)
    .digest();

  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  // timing-safe сравнение
  const hashBuf = Buffer.from(hash, 'hex');
  const calcBuf = Buffer.from(calculatedHash, 'hex');
  if (hashBuf.length !== calcBuf.length || !crypto.timingSafeEqual(hashBuf, calcBuf)) {
    return { ok: false, error: 'Неверная подпись initData' };
  }

  // проверка свежести (не старше 24 часов)
  const authDate = parseInt(params.get('auth_date') || '0', 10);
  const now = Math.floor(Date.now() / 1000);
  if (!authDate || now - authDate > 86400) {
    return { ok: false, error: 'initData устарел (auth_date)' };
  }

  let user = null;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch {
    return { ok: false, error: 'Не удалось разобрать user' };
  }

  if (!user || !user.id) {
    return { ok: false, error: 'user.id отсутствует' };
  }

  return {
    ok: true,
    user: {
      id: user.id,
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      username: user.username || '',
      language_code: user.language_code || 'ru',
      photo_url: user.photo_url || null,
      is_premium: !!user.is_premium
    }
  };
}

// --- простая сессия (HMAC-токен) ---
function issueSession(userId) {
  const payload = `${userId}:${Date.now()}`;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

function verifySession(token) {
  if (!token) return null;
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const parts = raw.split(':');
    if (parts.length !== 3) return null;
    const [userId, ts, sig] = parts;
    const expected = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(`${userId}:${ts}`)
      .digest('hex');
    if (sig !== expected) return null;
    // сессия живёт 30 дней
    if (Date.now() - parseInt(ts, 10) > 30 * 24 * 60 * 60 * 1000) return null;
    return userId;
  } catch {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const userId = verifySession(token);
  if (!userId) {
    return res.status(401).json({ error: 'Не авторизован' });
  }
  req.userId = userId;
  next();
}

// --- middleware ---
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- API ---
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'raychaser', time: new Date().toISOString() });
});

/**
 * POST /api/auth
 * body: { initData: string }
 * → { ok, session, user }
 */
app.post('/api/auth', (req, res) => {
  const { initData } = req.body || {};
  const result = validateInitData(initData);

  if (!result.ok) {
    console.warn('[auth] fail:', result.error);
    return res.status(401).json({ ok: false, error: result.error });
  }

  const session = issueSession(String(result.user.id));
  console.log(`[auth] user ${result.user.id} (@${result.user.username || '—'})`);

  res.json({
    ok: true,
    session,
    user: result.user
  });
});

/**
 * GET /api/save
 * Authorization: Bearer <session>
 */
app.get('/api/save', authMiddleware, (req, res) => {
  const saves = loadSaves();
  const data = saves[req.userId] || null;
  res.json({ ok: true, data });
});

/**
 * POST /api/save
 * body: { data: object }
 */
app.post('/api/save', authMiddleware, (req, res) => {
  const payload = req.body?.data;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Нет data' });
  }

  // защита от слишком больших сейвов
  const size = JSON.stringify(payload).length;
  if (size > 200000) {
    return res.status(413).json({ error: 'Сейв слишком большой' });
  }

  const saves = loadSaves();
  saves[req.userId] = {
    ...payload,
    _updatedAt: new Date().toISOString(),
    _userId: req.userId
  };
  writeSaves(saves);

  res.json({ ok: true });
});

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🎮 RayChaser server → http://localhost:${PORT}`);
  console.log(`   BOT_TOKEN: ${BOT_TOKEN.slice(0, 8)}…`);
});
