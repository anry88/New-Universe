# New Universe — локальная разработка

Окружение для разработки в Docker. Поднимает Postgres, Redis, бэкенд (Fastify), воркер
очередей (BullMQ) и фронтенд (Vite + React + Telegram Mini App SDK) одной командой.

## Требования

- Docker Desktop (Mac/Windows) или Docker Engine + Compose plugin (Linux), версия ≥ 24
- ~4 GB свободного RAM
- Свободные порты: 3000, 5173, 5432, 6379 (плюс 8080/8081 для devtools)

## Быстрый старт

```bash
# 1. Скопировать конфиг
cp .env.example .env

# 2. (опционально) Получить токен тестового бота у @BotFather и вписать в .env
#    TELEGRAM_BOT_TOKEN=...

# 3. Поднять стек
docker compose up -d

# 4. Накатить миграции и засеять справочники
docker compose exec backend npm run db:migrate
docker compose exec backend npm run db:seed

# 5. Открыть фронтенд
open http://localhost:5173
```

## Куда что доступно

| Сервис | URL | Логин/пароль |
|---|---|---|
| Frontend (TMA dev) | http://localhost:5173 | — |
| Backend API | http://localhost:3000 | — |
| Postgres | localhost:5432 | nu / devpassword |
| Redis | localhost:6379 | — |
| Adminer (Postgres GUI) | http://localhost:8080 | postgres / nu / devpassword / new_universe |
| Redis Commander (Redis GUI) | http://localhost:8081 | — |

UI-инструменты `adminer` и `redis-commander` находятся в профиле `devtools` и не
поднимаются автоматически. Запустить только их:

```bash
docker compose --profile devtools up -d adminer redis-commander
```

## Часто используемые команды

```bash
# Логи
docker compose logs -f backend
docker compose logs -f worker
docker compose logs -f frontend

# Перезапуск одного сервиса
docker compose restart backend

# Запустить тесты
docker compose exec backend npm test
docker compose exec frontend npm test

# Войти в контейнер для отладки
docker compose exec backend sh
docker compose exec postgres psql -U nu -d new_universe

# Сгенерировать новую миграцию из изменений в schema.ts
docker compose exec backend npm run db:generate

# Применить миграции
docker compose exec backend npm run db:migrate

# Засеять справочники (ресурсы, типы зданий, типы кораблей)
docker compose exec backend npm run db:seed

# Полная остановка + удаление данных
docker compose down -v
```

## Hot reload

Backend и frontend используют bind-mount `./backend/src` и `./frontend/src` соответственно.
Любое изменение в коде → сервис перезапускается / Vite HMR подхватывает изменения.

`node_modules` хранятся в named volume отдельно (чтобы не было перезаписи между host и контейнером
с разными платформами).

## Тестирование Telegram Mini App локально

Telegram требует HTTPS для Web App URL. Для dev — самый простой путь:

### Вариант 1: cloudflared tunnel (бесплатно, без регистрации)

```bash
# Установить cloudflared
brew install cloudflared        # macOS
# или скачать с https://github.com/cloudflare/cloudflared/releases

# Поднять туннель к фронтенду
cloudflared tunnel --url http://localhost:5173
# Получишь URL вида https://abc-xyz.trycloudflare.com

# Параллельно — туннель к бэкенду
cloudflared tunnel --url http://localhost:3000
```

Затем у `@BotFather`:
```
/mybots → выбрать тест-бота → Bot Settings → Menu Button → Configure menu button
URL: https://abc-xyz.trycloudflare.com
```

### Вариант 2: ngrok

```bash
brew install ngrok/ngrok/ngrok
ngrok http 5173
```

### Вариант 3: Telegram Test DC

Можно использовать тестовый дата-центр Telegram (`@TGdesktop` → Settings → Advanced → Test).
Тогда ограничения проще, но игроки тоже должны быть на тест-DC.

## Структура папок

```
new-universe/
├── docker-compose.yml         ← основной compose
├── .env.example               ← шаблон конфига
├── .env                       ← локальный конфиг (в gitignore)
├── README.md                  ← этот файл
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── drizzle.config.ts
│   └── src/
│       ├── index.ts           ← entry point Fastify
│       ├── workers/index.ts   ← BullMQ воркеры
│       ├── routes/            ← REST API
│       ├── services/          ← бизнес-логика
│       ├── db/
│       │   ├── schema.ts      ← Drizzle schema
│       │   ├── migrations/
│       │   └── seed.ts
│       └── lib/
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── pages/
│       ├── components/
│       └── lib/api.ts
├── shared/
│   └── types/                 ← общие TS-типы (импортируются и фронтом, и бэком)
└── infra/
    └── prod-compose.yml       ← минимальный prod-стек
```

## Troubleshooting

**Порт занят (`bind: address already in use`)**:
```bash
lsof -i :5432    # узнать кто занял
# поправить порт в docker-compose.yml или убить процесс
```

**Backend не видит Postgres**:
- Проверить `docker compose logs postgres` — поднялся ли.
- Healthcheck должен пройти, прежде чем backend стартует. Подождать 10-15 сек.

**Hot reload не работает**:
- Mac/Windows: убедиться, что Docker Desktop разрешает bind mount папки проекта в File Sharing.
- Если папка вне `~/`, добавить её в File Sharing вручную.

**Слишком долго npm install**:
- Кеш `backend_node_modules` сохраняется между перезапусками. Если что-то поломалось:
  ```bash
  docker compose down
  docker volume rm new-universe_backend_node_modules new-universe_frontend_node_modules
  docker compose up -d
  ```
