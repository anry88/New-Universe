# Настройка Telegram Бота для разработки

Этот документ описывает шаги по созданию и настройке Telegram бота для локальной разработки проекта New Universe.

## 1. Создание бота через @BotFather

1. Открой Telegram и найди бота [@BotFather](https://t.me/BotFather).
2. Отправь команду `/newbot`.
3. Введи имя бота (например, `New Universe Dev`).
4. Введи username бота (например, `NewUniverseDevBot` — он должен заканчиваться на `bot`).
5. BotFather пришлет тебе **API Token**. Сохрани его.
6. Для аватара бота отправь BotFather команду `/setuserpic` и загрузи файл `frontend/public/brand/new-universe-logo-512.png`.

## 2. Настройка локального окружения

1. Открой файл `.env` в корне проекта.
2. Впиши полученный токен в переменную `TELEGRAM_BOT_TOKEN`:
   ```env
   TELEGRAM_BOT_TOKEN=твой_токен_здесь
   ```
3. Придумай секретное слово для валидации вебхука и впиши в `TELEGRAM_BOT_SECRET`:
   ```env
   TELEGRAM_BOT_SECRET=любая_случайная_строка
   ```

## 3. Настройка туннеля (cloudflared)

Для того чтобы Telegram мог отправлять сообщения на твой локальный компьютер, нужен публичный HTTPS URL. Мы рекомендуем использовать `cloudflared`.

1. Установи cloudflared: `brew install cloudflared` (на Mac) или скачай с сайта Cloudflare.
2. Запусти туннель на порт бэкенда (3000):
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```
3. Ты получишь URL вида `https://random-words.trycloudflare.com`.

## 4. Установка вебхука

Чтобы Telegram знал, куда отправлять обновления, нужно вызвать метод `setWebhook`.

1. Скопируй свой HTTPS URL из шага 3.
2. Выполни запрос через `curl`:
   ```bash
   export BOT_TOKEN=твой_токен
   export WEBHOOK_URL=https://твой-урл.trycloudflare.com/webhook/telegram
   curl -X POST "https://api.telegram.org/bot$BOT_TOKEN/setWebhook?url=$WEBHOOK_URL"
   ```
3. Проверь статус вебхука:
   ```bash
   curl "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo"
   ```

## 5. Проверка работы

1. Запусти проект: `docker compose up -d`.
2. Открой своего бота в Telegram и нажми `/start`.
3. Проверь логи бэкенда: `docker compose logs -f backend`.
4. Ты должен увидеть запись `Received Telegram update` с JSON-телом сообщения.
