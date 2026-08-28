# RayChaser RPG — Telegram Mini App

## Шаг 1. Залей на GitHub

В корне репо:
- server.js, package.json, .env.example, .gitignore, README.md
- public/index.html + все PNG (Floor, Wall_Front, Wall_Top, archer, goblin)

НЕ коммить файл .env

## Шаг 2. Render.com

1. render.com → Sign in with GitHub
2. New → Web Service → свой репозиторий
3. Build: npm install
4. Start: npm start
5. Environment Variables:
   - BOT_TOKEN = токен от BotFather
   - SESSION_SECRET = любая длинная строка
6. Create → дождись деплоя
7. Скопируй URL: https://ИМЯ.onrender.com

Проверка: https://ИМЯ.onrender.com/health → {"ok":true}

## Шаг 3. BotFather

/setmenubutton
- Text: Играть
- URL: https://ИМЯ.onrender.com

## Шаг 4

Открой бота в Telegram → кнопка «Играть».

ВАЖНО: ссылку github.com боту НЕ давать. Только https://....onrender.com
