#!/usr/bin/env bash
# New Universe — bulk import задач в GitHub Issues + Projects v2
# Запускать ЛОКАЛЬНО на машине с настроенным gh CLI и SSH-доступом к GitHub.
# Перед запуском: см. README_github_import.md
set -euo pipefail

# === НАСТРОЙКИ ===
REPO="${REPO:-anry88/new-universe}"      # owner/repo куда создавать issues
PROJECT_OWNER="${PROJECT_OWNER:-anry88}" # владелец проекта (user или org)
PROJECT_NUMBER="${PROJECT_NUMBER:-3}"    # номер проекта (из URL)

# === ПРОВЕРКИ ===
command -v gh >/dev/null || { echo "gh CLI не установлен. brew install gh"; exit 1; }
gh auth status >/dev/null || { echo "Не авторизован: gh auth login"; exit 1; }

echo ">> Получаем ID проекта..."
PROJECT_ID=$(gh api graphql -f query='query($login:String!,$num:Int!){user(login:$login){projectV2(number:$num){id}}}' \
  -F login="$PROJECT_OWNER" -F num="$PROJECT_NUMBER" --jq .data.user.projectV2.id)
echo "PROJECT_ID=$PROJECT_ID"

# === СОЗДАНИЕ LABELS ===
echo ">> Создаём labels (если ещё нет)..."
gh label create 'epic:EPIC-P0-INFRA' --repo "$REPO" --color "0F4C81" --force >/dev/null 2>&1 || true
gh label create 'epic:EPIC-P1-AUTH' --repo "$REPO" --color "0F4C81" --force >/dev/null 2>&1 || true
gh label create 'epic:EPIC-P1-BLD' --repo "$REPO" --color "0F4C81" --force >/dev/null 2>&1 || true
gh label create 'epic:EPIC-P1-BOT' --repo "$REPO" --color "0F4C81" --force >/dev/null 2>&1 || true
gh label create 'epic:EPIC-P1-DB' --repo "$REPO" --color "0F4C81" --force >/dev/null 2>&1 || true
gh label create 'epic:EPIC-P1-EXP' --repo "$REPO" --color "0F4C81" --force >/dev/null 2>&1 || true
gh label create 'epic:EPIC-P1-FE' --repo "$REPO" --color "0F4C81" --force >/dev/null 2>&1 || true
gh label create 'epic:EPIC-P1-QA' --repo "$REPO" --color "0F4C81" --force >/dev/null 2>&1 || true
gh label create 'epic:EPIC-P1-RES' --repo "$REPO" --color "0F4C81" --force >/dev/null 2>&1 || true
gh label create 'epic:EPIC-P1-SHP' --repo "$REPO" --color "0F4C81" --force >/dev/null 2>&1 || true
gh label create 'epic:EPIC-P1-WORLD' --repo "$REPO" --color "0F4C81" --force >/dev/null 2>&1 || true
gh label create 'epic:EPIC-P2-OUT' --repo "$REPO" --color "0F4C81" --force >/dev/null 2>&1 || true
gh label create 'epic:EPIC-P3-OUT' --repo "$REPO" --color "0F4C81" --force >/dev/null 2>&1 || true
gh label create 'phase:P0' --repo "$REPO" --color "0F4C81" --force >/dev/null 2>&1 || true
gh label create 'phase:P1' --repo "$REPO" --color "0F4C81" --force >/dev/null 2>&1 || true
gh label create 'phase:P2' --repo "$REPO" --color "0F4C81" --force >/dev/null 2>&1 || true
gh label create 'phase:P3' --repo "$REPO" --color "0F4C81" --force >/dev/null 2>&1 || true
gh label create 'size:L' --repo "$REPO" --color "0F4C81" --force >/dev/null 2>&1 || true
gh label create 'size:M' --repo "$REPO" --color "0F4C81" --force >/dev/null 2>&1 || true
gh label create 'size:S' --repo "$REPO" --color "0F4C81" --force >/dev/null 2>&1 || true
gh label create 'size:XL' --repo "$REPO" --color "0F4C81" --force >/dev/null 2>&1 || true

# === СОЗДАНИЕ ISSUES + ДОБАВЛЕНИЕ В ПРОЕКТ ===
declare -A ISSUE_URL_BY_TASK_ID

echo ">> P0-001: [P0-001] Инициализация git-репозитория и базовых файлов"
URL=$(gh issue create --repo "$REPO" --title '[P0-001] Инициализация git-репозитория и базовых файлов' -l 'epic:EPIC-P0-INFRA' -l 'phase:P0' -l 'size:S' --body '**ID:** P0-001
**Epic:** EPIC-P0-INFRA
**Size:** S
**Phase:** P0

## Описание
Создать репозиторий new-universe на GitHub, добавить README, LICENSE (MIT), .gitignore (Node + Docker), .editorconfig, базовый .github/CODEOWNERS.

## Acceptance criteria
1. Репозиторий доступен по https://github.com/anry88/new-universe
2. README содержит описание проекта в 3-5 предложений и ссылку на GDD
3. .gitignore исключает node_modules, .env, dist, .DS_Store
4. Главная ветка main, защищена от прямых пушей

## Файлы
- `README.md`
- `LICENSE`
- `.gitignore`
- `.editorconfig`
- `.github/CODEOWNERS`

## Зависимости
(нет)

## Как проверить
git clone https://github.com/anry88/new-universe и `ls -la` показывает все файлы

## Примечания
GDD-документы скопировать в /docs из текущей папки New Universe.')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P0-001"]="$URL"

echo ">> P0-002: [P0-002] Docker compose локальное dev-окружение"
URL=$(gh issue create --repo "$REPO" --title '[P0-002] Docker compose локальное dev-окружение' -l 'epic:EPIC-P0-INFRA' -l 'phase:P0' -l 'size:M' --body '**ID:** P0-002
**Epic:** EPIC-P0-INFRA
**Size:** M
**Phase:** P0

## Описание
Перенести dev/docker-compose.yml, dev/.env.example, dev/backend/Dockerfile, dev/frontend/Dockerfile, dev/README.md из текущей папки в репозиторий. Проверить, что docker compose up -d поднимает postgres + redis (backend и frontend будут добавлены позже).

## Acceptance criteria
1. `docker compose up -d postgres redis` запускается без ошибок
2. `docker compose logs postgres` показывает healthy state
3. `docker compose exec postgres psql -U nu -d new_universe -c "SELECT 1"` отвечает 1

## Файлы
- `docker-compose.yml`
- `.env.example`
- `README.md (в корне)`

## Зависимости
- P0-001

## Как проверить
Команды из dev/README.md работают

## Примечания
Порт 5432 не должен конфликтовать с локально установленным Postgres (если есть — поменять порт в .env).')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P0-002"]="$URL"

echo ">> P0-003: [P0-003] Backend skeleton — Fastify + TS"
URL=$(gh issue create --repo "$REPO" --title '[P0-003] Backend skeleton — Fastify + TS' -l 'epic:EPIC-P0-INFRA' -l 'phase:P0' -l 'size:M' --body '**ID:** P0-003
**Epic:** EPIC-P0-INFRA
**Size:** M
**Phase:** P0

## Описание
Создать backend/ с минимальным Fastify-приложением: GET /health, структурированное логирование через Pino, чтение env через dotenv + Zod-валидация. Запуск через docker compose up backend.

## Acceptance criteria
1. GET /health возвращает {"status":"ok","ts":...}
2. Логи в JSON-формате, в dev — pino-pretty
3. Сервер падает на старте, если в .env отсутствует обязательная переменная

## Файлы
- `backend/src/index.ts`
- `backend/src/lib/env.ts`
- `backend/src/lib/logger.ts`
- `backend/src/routes/health.ts`
- `backend/tsconfig.json`

## Зависимости
- P0-002

## Как проверить
curl http://localhost:3000/health → 200 ok

## Примечания
Fastify v5, TypeScript strict, ES modules.')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P0-003"]="$URL"

echo ">> P0-004: [P0-004] Frontend skeleton — Vite + React + TMA SDK"
URL=$(gh issue create --repo "$REPO" --title '[P0-004] Frontend skeleton — Vite + React + TMA SDK' -l 'epic:EPIC-P0-INFRA' -l 'phase:P0' -l 'size:M' --body '**ID:** P0-004
**Epic:** EPIC-P0-INFRA
**Size:** M
**Phase:** P0

## Описание
Создать frontend/ с минимальным React-приложением, инициализацией Telegram WebApp SDK, Tailwind CSS, страницей "Hello, {username}". Запуск через docker compose up frontend.

## Acceptance criteria
1. http://localhost:5173 отдаёт страницу с приветствием
2. При запуске внутри Telegram — берёт username из initData
3. Поддерживается dark/light тема Telegram
4. Tailwind CSS работает (классы применяются)

## Файлы
- `frontend/src/main.tsx`
- `frontend/src/App.tsx`
- `frontend/index.html`
- `frontend/vite.config.ts`
- `frontend/tailwind.config.ts`
- `frontend/src/index.css`

## Зависимости
- P0-002

## Как проверить
docker compose up frontend → открыть http://localhost:5173 → отображается страница

## Примечания
Использовать @telegram-apps/sdk-react. Если запущено НЕ из Telegram — использовать заглушку user="DevUser".')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P0-004"]="$URL"

echo ">> P0-005: [P0-005] Drizzle ORM + миграции"
URL=$(gh issue create --repo "$REPO" --title '[P0-005] Drizzle ORM + миграции' -l 'epic:EPIC-P0-INFRA' -l 'phase:P0' -l 'size:S' --body '**ID:** P0-005
**Epic:** EPIC-P0-INFRA
**Size:** S
**Phase:** P0

## Описание
Установить drizzle-orm + drizzle-kit. Настроить drizzle.config.ts. Создать пустую schema.ts. Команды npm run db:migrate, db:generate, db:studio должны работать.

## Acceptance criteria
1. `npm run db:generate` создаёт миграцию из изменений schema.ts
2. `npm run db:migrate` накатывает миграции на dev БД
3. `npm run db:studio` запускает Drizzle Studio на http://localhost:4983

## Файлы
- `backend/drizzle.config.ts`
- `backend/src/db/index.ts`
- `backend/src/db/schema.ts`
- `backend/src/db/migrations/.gitkeep`

## Зависимости
- P0-003

## Как проверить
`npm run db:migrate` без ошибок, `\dt` в psql показывает только пустые системные таблицы
')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P0-005"]="$URL"

echo ">> P0-006: [P0-006] GitHub Actions CI"
URL=$(gh issue create --repo "$REPO" --title '[P0-006] GitHub Actions CI' -l 'epic:EPIC-P0-INFRA' -l 'phase:P0' -l 'size:M' --body '**ID:** P0-006
**Epic:** EPIC-P0-INFRA
**Size:** M
**Phase:** P0

## Описание
Workflow .github/workflows/ci.yml: на каждый PR — lint, type-check, тесты для backend и frontend. Использовать docker compose для прогона. Кэшировать node_modules.

## Acceptance criteria
1. PR на main → запускается workflow
2. Workflow проходит на ~3-5 минут
3. Падение тестов блокирует merge

## Файлы
- `.github/workflows/ci.yml`

## Зависимости
- P0-003
- P0-004

## Как проверить
Создать PR с заведомо проходящими тестами → CI зелёный

## Примечания
Использовать pnpm если в проекте pnpm, иначе npm. Кэширование через actions/cache.')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P0-006"]="$URL"

echo ">> P0-007: [P0-007] Sentry интеграция"
URL=$(gh issue create --repo "$REPO" --title '[P0-007] Sentry интеграция' -l 'epic:EPIC-P0-INFRA' -l 'phase:P0' -l 'size:S' --body '**ID:** P0-007
**Epic:** EPIC-P0-INFRA
**Size:** S
**Phase:** P0

## Описание
Создать 2 проекта в Sentry (free tier): new-universe-backend, new-universe-tma. Подключить в код через @sentry/node и @sentry/react. DSN в .env.

## Acceptance criteria
1. Тестовая ошибка на бэкенде попадает в Sentry
2. Тестовая ошибка на фронте попадает в Sentry
3. В Sentry привязаны git releases

## Файлы
- `backend/src/lib/sentry.ts`
- `frontend/src/lib/sentry.ts`

## Зависимости
- P0-003
- P0-004

## Как проверить
GET /debug-sentry → видно ошибку в Sentry UI

## Примечания
Эндпоинт /debug-sentry убрать после тестирования.')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P0-007"]="$URL"

echo ">> P0-008: [P0-008] Структурированное логирование"
URL=$(gh issue create --repo "$REPO" --title '[P0-008] Структурированное логирование' -l 'epic:EPIC-P0-INFRA' -l 'phase:P0' -l 'size:S' --body '**ID:** P0-008
**Epic:** EPIC-P0-INFRA
**Size:** S
**Phase:** P0

## Описание
Все логи бэкенда — через Pino, в JSON. Поля: ts, level, msg, requestId, userId (если есть), feature.

## Acceptance criteria
1. Каждый HTTP-запрос логируется со своим requestId (генерируется через uuid v4)
2. Логи в dev — через pino-pretty, читаемые в терминале
3. Логи в проде — pure JSON, готовы для BetterStack/Logtail

## Файлы
- `backend/src/lib/logger.ts`
- `backend/src/middleware/request-id.ts`

## Зависимости
- P0-003

## Как проверить
Сделать запрос → в логах видно requestId
')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P0-008"]="$URL"

echo ">> P0-009: [P0-009] Vitest + первый smoke-тест"
URL=$(gh issue create --repo "$REPO" --title '[P0-009] Vitest + первый smoke-тест' -l 'epic:EPIC-P0-INFRA' -l 'phase:P0' -l 'size:S' --body '**ID:** P0-009
**Epic:** EPIC-P0-INFRA
**Size:** S
**Phase:** P0

## Описание
Подключить vitest. Написать smoke-тест для GET /health.

## Acceptance criteria
1. `npm test` запускает vitest и проходит
2. Тест проверяет, что /health возвращает 200 и {status:"ok"}

## Файлы
- `backend/vitest.config.ts`
- `backend/src/routes/health.test.ts`

## Зависимости
- P0-003

## Как проверить
`docker compose exec backend npm test` зелёный
')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P0-009"]="$URL"

echo ">> P0-010: [P0-010] Telegram-бот через @BotFather + dev webhook"
URL=$(gh issue create --repo "$REPO" --title '[P0-010] Telegram-бот через @BotFather + dev webhook' -l 'epic:EPIC-P0-INFRA' -l 'phase:P0' -l 'size:M' --body '**ID:** P0-010
**Epic:** EPIC-P0-INFRA
**Size:** M
**Phase:** P0

## Описание
Создать тестового бота через @BotFather (имя NewUniverseDevBot). Получить токен. Настроить dev-webhook через cloudflared tunnel. Документировать процесс в dev/README.md.

## Acceptance criteria
1. Бот существует в Telegram
2. TELEGRAM_BOT_TOKEN записан в личные заметки разработчика (НЕ в репо!)
3. Webhook URL настроен через @BotFather → /setwebhook
4. Тестовое сообщение боту → попадает в backend log

## Файлы
- `dev/TELEGRAM_SETUP.md`

## Зависимости
- P0-003

## Как проверить
Отправить /start боту → видно в логах backend

## Примечания
Описать в TELEGRAM_SETUP.md шаги: создание бота, получение токена, настройка туннеля. Токен хранить ТОЛЬКО в .env (gitignored).')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P0-010"]="$URL"

echo ">> P1-101: [P1-101] Таблица users"
URL=$(gh issue create --repo "$REPO" --title '[P1-101] Таблица users' -l 'epic:EPIC-P1-DB' -l 'phase:P1' -l 'size:S' --body '**ID:** P1-101
**Epic:** EPIC-P1-DB
**Size:** S
**Phase:** P1

## Описание
Создать таблицу users в schema.ts: id (uuid), tg_id (bigint unique), tg_username, tg_first_name, created_at, premium_until, power_score (default 0). Сгенерировать и применить миграцию.

## Acceptance criteria
1. Таблица users создана со всеми полями
2. Индекс по tg_id (unique)
3. Миграция в backend/src/db/migrations/

## Файлы
- `backend/src/db/schema/users.ts`
- `backend/src/db/migrations/0001_users.sql (auto-generated)`

## Зависимости
- P0-005

## Как проверить
`\d users` в psql показывает все поля

## Примечания
Использовать drizzle pgTable. Импортировать в src/db/schema.ts.')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-101"]="$URL"

echo ">> P1-102: [P1-102] Каталог ресурсов: таблица resources + сидер"
URL=$(gh issue create --repo "$REPO" --title '[P1-102] Каталог ресурсов: таблица resources + сидер' -l 'epic:EPIC-P1-DB' -l 'phase:P1' -l 'size:S' --body '**ID:** P1-102
**Epic:** EPIC-P1-DB
**Size:** S
**Phase:** P1

## Описание
Таблица resources: id (slug, primary key), name (json: ru/en), tier (1-4), symbol, base_regen_rate, default_storage_cap. Сидер заполняет 13 ресурсов (см. addendum + GDD).

## Acceptance criteria
1. Таблица resources заполнена 13 записями: water, iron, carbon, silicon, methane, copper, aluminum, titanium, ice, mercury, magnesium, lead, tritium
2. `npm run db:seed` идемпотентен (можно запускать повторно)
3. Каждая запись имеет ru/en название

## Файлы
- `backend/src/db/schema/resources.ts`
- `backend/src/db/seed/resources.ts`

## Зависимости
- P1-101

## Как проверить
`SELECT count(*) FROM resources` → 13

## Примечания
Tritium — новый ресурс (см. addendum §3.6). Tier 3 минор, нужен для прыжкового топлива.')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-102"]="$URL"

echo ">> P1-103: [P1-103] Планеты, planet_resources, richness"
URL=$(gh issue create --repo "$REPO" --title '[P1-103] Планеты, planet_resources, richness' -l 'epic:EPIC-P1-DB' -l 'phase:P1' -l 'size:M' --body '**ID:** P1-103
**Epic:** EPIC-P1-DB
**Size:** M
**Phase:** P1

## Описание
Таблицы: systems (id, owner_id nullable, is_home, sector_x/y/z, name, seed), planets (id, system_id, biome, size, slot_count, name), planet_resources (planet_id, resource_id, amount, last_update_at, regen_rate), richness (planet_id, resource_id, value 0..5).

## Acceptance criteria
1. Все 4 таблицы созданы
2. Внешние ключи: planets.system_id → systems.id, planet_resources/richness → planets/resources
3. Индексы: planets.system_id, planet_resources(planet_id, resource_id) unique

## Файлы
- `backend/src/db/schema/world.ts`
- `backend/src/db/migrations/...sql`

## Зависимости
- P1-102

## Как проверить
Миграция применена, `\d planets` показывает поля

## Примечания
is_home_system флаг будет использоваться для блокировки чужих обращений к домашней системе.')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-103"]="$URL"

echo ">> P1-104: [P1-104] building_types (catalog) + buildings (instances)"
URL=$(gh issue create --repo "$REPO" --title '[P1-104] building_types (catalog) + buildings (instances)' -l 'epic:EPIC-P1-DB' -l 'phase:P1' -l 'size:M' --body '**ID:** P1-104
**Epic:** EPIC-P1-DB
**Size:** M
**Phase:** P1

## Описание
building_types: id (slug), name (json), category, max_level, deps (jsonb массив зависимостей), base_cost (jsonb), base_time_sec, base_output (jsonb), energy_consumption.
buildings: id, planet_id, type_id, level, queue_action (build|upgrade|null), queue_completes_at.
Сидер заполняет 10 базовых типов из GDD §5.

## Acceptance criteria
1. Таблицы созданы
2. Сидер заполняет building_types: command_center, mine, drill, storage, smelter, spaceport, shipyard, lab, cryo_factory, solar_plant
3. Стоимости и времена соответствуют GDD

## Файлы
- `backend/src/db/schema/buildings.ts`
- `backend/src/db/seed/building-types.ts`

## Зависимости
- P1-103

## Как проверить
`SELECT slug FROM building_types ORDER BY slug` → 10 строк

## Примечания
cryo_factory — новое здание из addendum (для лёд⇄вода).')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-104"]="$URL"

echo ">> P1-105: [P1-105] ship_types + ships"
URL=$(gh issue create --repo "$REPO" --title '[P1-105] ship_types + ships' -l 'epic:EPIC-P1-DB' -l 'phase:P1' -l 'size:M' --body '**ID:** P1-105
**Epic:** EPIC-P1-DB
**Size:** M
**Phase:** P1

## Описание
ship_types: id (slug), name, role, hp, speed, cargo, dps, armor, fuel_consumption, build_time_sec, build_cost (jsonb), required_buildings, sensor_range.
ships: id, owner_id, type_id, location_planet_id (nullable), status (idle|moving|building), cargo_json, fuel.
Сидер заполняет 5 типов: scout, cargo_light, colonizer, recon_probe, jump_ship.

## Acceptance criteria
1. Таблицы созданы
2. Сидер: 5 ship_types (Scout, Cargo Light, Colonizer, Recon Probe, Jump Ship)
3. Поле sensor_range заполнено (Scout=30, Recon=60, Cargo=8 и т.д.)

## Файлы
- `backend/src/db/schema/ships.ts`
- `backend/src/db/seed/ship-types.ts`

## Зависимости
- P1-103

## Как проверить
`SELECT slug, sensor_range FROM ship_types`

## Примечания
Jump Ship — новый тип из addendum, требует Engines lvl 3 + Jump Drive.')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-105"]="$URL"

echo ">> P1-106: [P1-106] research, research_progress"
URL=$(gh issue create --repo "$REPO" --title '[P1-106] research, research_progress' -l 'epic:EPIC-P1-DB' -l 'phase:P1' -l 'size:S' --body '**ID:** P1-106
**Epic:** EPIC-P1-DB
**Size:** S
**Phase:** P1

## Описание
research_branches (catalog: mining, engineering, engines, weapons, sensors, logistics, jump_drive). research_progress (user_id, branch, level, completes_at).

## Acceptance criteria
1. Таблицы созданы
2. Сидер заполняет 7 веток (включая jump_drive из addendum)

## Файлы
- `backend/src/db/schema/research.ts`
- `backend/src/db/seed/research-branches.ts`

## Зависимости
- P1-101

## Как проверить
`SELECT * FROM research_branches`
')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-106"]="$URL"

echo ">> P1-107: [P1-107] expeditions"
URL=$(gh issue create --repo "$REPO" --title '[P1-107] expeditions' -l 'epic:EPIC-P1-DB' -l 'phase:P1' -l 'size:M' --body '**ID:** P1-107
**Epic:** EPIC-P1-DB
**Size:** M
**Phase:** P1

## Описание
expeditions: id, ship_id, type (scout|cargo|colonize|jump), origin_planet_id, target_x/y/z, target_planet_id (nullable), status (queued|in_flight|arrived|returning|completed|failed), eta, returned_at, result (jsonb).

## Acceptance criteria
1. Таблица создана
2. Индексы по eta + status (для быстрого poll-а воркером)

## Файлы
- `backend/src/db/schema/expeditions.ts`

## Зависимости
- P1-105

## Как проверить
Миграция применена
')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-107"]="$URL"

echo ">> P1-108: [P1-108] discovered_planets, discovered_systems (per-player)"
URL=$(gh issue create --repo "$REPO" --title '[P1-108] discovered_planets, discovered_systems (per-player)' -l 'epic:EPIC-P1-DB' -l 'phase:P1' -l 'size:S' --body '**ID:** P1-108
**Epic:** EPIC-P1-DB
**Size:** S
**Phase:** P1

## Описание
Таблицы для per-player видимости (см. addendum §3.4). discovered_planets (user_id, planet_id, discovered_at). discovered_systems (user_id, system_id, discovered_at). Уникальный индекс (user_id, planet_id) / (user_id, system_id).

## Acceptance criteria
1. Таблицы созданы
2. Индексы корректные

## Файлы
- `backend/src/db/schema/discovery.ts`

## Зависимости
- P1-103

## Как проверить
Миграция применена

## Примечания
Все API, возвращающие планеты/системы, должны фильтровать через JOIN с этими таблицами.')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-108"]="$URL"

echo ">> P1-120: [P1-120] Telegram initData валидация"
URL=$(gh issue create --repo "$REPO" --title '[P1-120] Telegram initData валидация' -l 'epic:EPIC-P1-AUTH' -l 'phase:P1' -l 'size:M' --body '**ID:** P1-120
**Epic:** EPIC-P1-AUTH
**Size:** M
**Phase:** P1

## Описание
Middleware, проверяющий заголовок X-Telegram-Init-Data: HMAC по boilerplate Telegram. Парсит user_id, username из строки. Если валидно — кладёт в request.user.

## Acceptance criteria
1. Корректный initData (от реального Telegram) → middleware пропускает
2. Истёкший initData (auth_date > 1 час) → 401
3. Подделанный hash → 401
4. Без заголовка → 401

## Файлы
- `backend/src/middleware/telegram-auth.ts`
- `backend/src/lib/telegram.ts`
- `backend/src/middleware/telegram-auth.test.ts`

## Зависимости
- P0-008

## Как проверить
Unit-тест проходит

## Примечания
Использовать алгоритм из официальной документации: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-120"]="$URL"

echo ">> P1-121: [P1-121] POST /auth/telegram → создание/получение пользователя"
URL=$(gh issue create --repo "$REPO" --title '[P1-121] POST /auth/telegram → создание/получение пользователя' -l 'epic:EPIC-P1-AUTH' -l 'phase:P1' -l 'size:M' --body '**ID:** P1-121
**Epic:** EPIC-P1-AUTH
**Size:** M
**Phase:** P1

## Описание
Эндпоинт принимает валидированный initData (через middleware). Если user с tg_id не существует — создаёт + триггерит P1-141 (генерация Home System). Возвращает JWT-сессию (httpOnly cookie + body).

## Acceptance criteria
1. Первый запрос с новым tg_id → создаёт user + home system
2. Второй запрос с тем же tg_id → возвращает existing user
3. Возвращает session token, который можно использовать в Authorization header

## Файлы
- `backend/src/features/auth/routes.ts`
- `backend/src/features/auth/service.ts`
- `backend/src/features/auth/auth.test.ts`

## Зависимости
- P1-120
- P1-141

## Как проверить
curl с тестовым initData → возвращает 200 + token

## Примечания
JWT secret из .env. Срок жизни 30 дней.')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-121"]="$URL"

echo ">> P1-122: [P1-122] GET /me → состояние игрока"
URL=$(gh issue create --repo "$REPO" --title '[P1-122] GET /me → состояние игрока' -l 'epic:EPIC-P1-AUTH' -l 'phase:P1' -l 'size:S' --body '**ID:** P1-122
**Epic:** EPIC-P1-AUTH
**Size:** S
**Phase:** P1

## Описание
Возвращает: текущий user, домашняя система, открытые планеты, корабли, очереди стройки, ресурсы (с актуальным lazy-compute), исследования.

## Acceptance criteria
1. Без авторизации → 401
2. С авторизацией → 200 с полным state в JSON
3. Время ответа ≤ 200 мс при нормальной нагрузке

## Файлы
- `backend/src/features/me/routes.ts`
- `backend/src/features/me/service.ts`

## Зависимости
- P1-121
- P1-130

## Как проверить
Интеграционный тест: создать user → GET /me → видеть Home System

## Примечания
Это основной "single source of truth" для frontend. Должен возвращать минимально необходимое.')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-122"]="$URL"

echo ">> P1-141: [P1-141] Генерация Home System"
URL=$(gh issue create --repo "$REPO" --title '[P1-141] Генерация Home System' -l 'epic:EPIC-P1-WORLD' -l 'phase:P1' -l 'size:L' --body '**ID:** P1-141
**Epic:** EPIC-P1-WORLD
**Size:** L
**Phase:** P1

## Описание
Сервис generateHomeSystem(userId): создаёт систему + 4-7 планет с детерминированным seed = hash(userId, server_secret). Гарантирует, что 1 планета имеет все 5 базовых ресурсов, 1 планета содержит Tritium с низким richness. Все планеты НЕ открыты (discovered_planets — пусто, кроме стартовой).

## Acceptance criteria
1. Вызов с одним userId всегда возвращает одну и ту же планетарную систему
2. 5 базовых ресурсов гарантированно присутствуют
3. 1 планета имеет Tritium с richness 0.3-0.8
4. Стартовая планета (CommandCenter lvl 1) добавлена в discovered_planets
5. Tier 3 (кроме Tritium) и Tier 4 ресурсы ОТСУТСТВУЮТ в Home System

## Файлы
- `backend/src/features/world/home-system-generator.ts`
- `backend/src/features/world/biomes.ts`
- `backend/src/features/world/home-system-generator.test.ts`

## Зависимости
- P1-103
- P1-102

## Как проверить
Unit-тест: дважды генерируем home system для userId=1 → результаты идентичны

## Примечания
Использовать seedrandom или собственный детерминированный PRNG. Биомы из GDD §4.2.')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-141"]="$URL"

echo ">> P1-142: [P1-142] Sectors — структура общего пула"
URL=$(gh issue create --repo "$REPO" --title '[P1-142] Sectors — структура общего пула' -l 'epic:EPIC-P1-WORLD' -l 'phase:P1' -l 'size:M' --body '**ID:** P1-142
**Epic:** EPIC-P1-WORLD
**Size:** M
**Phase:** P1

## Описание
Таблица sectors: id (composite x,y,z), seed, generated_at, system_count. Сервис getOrCreateSector(x,y,z): возвращает существующий или создаёт пустой. Используется при первом обращении из jump.

## Acceptance criteria
1. getOrCreateSector(0,0,0) → создаёт запись если нет
2. Повторный вызов возвращает existing
3. Seed детерминированный

## Файлы
- `backend/src/db/schema/sectors.ts`
- `backend/src/features/world/sectors.ts`

## Зависимости
- P1-103

## Как проверить
Unit-тест: getOrCreateSector(1,2,3) дважды → одна запись в БД

## Примечания
Размер сектора 500×500×500 (см. addendum §3.7).')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-142"]="$URL"

echo ">> P1-143: [P1-143] Lazy generation систем в секторе"
URL=$(gh issue create --repo "$REPO" --title '[P1-143] Lazy generation систем в секторе' -l 'epic:EPIC-P1-WORLD' -l 'phase:P1' -l 'size:L' --body '**ID:** P1-143
**Epic:** EPIC-P1-WORLD
**Size:** L
**Phase:** P1

## Описание
Сервис generateSystemsInSector(sector, target_count=5): создаёт недостающие системы рандомно в координатах сектора. Использует seed сектора. Не превышает 12 систем.

## Acceptance criteria
1. Если в секторе уже 5 систем — ничего не делает
2. Если 0 — генерирует 5 систем
3. Координаты систем не пересекаются (мин. дистанция 50 ед)
4. Биомы планет в системах распределены по весам из GDD

## Файлы
- `backend/src/features/world/sector-generator.ts`
- `backend/src/features/world/sector-generator.test.ts`

## Зависимости
- P1-142
- P1-141

## Как проверить
Тест: для пустого сектора генерируется 5 систем; повторный вызов не добавляет

## Примечания
Системы в общем пуле — owner_id=null, is_home_system=false.')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-143"]="$URL"

echo ">> P1-144: [P1-144] Visibility check service"
URL=$(gh issue create --repo "$REPO" --title '[P1-144] Visibility check service' -l 'epic:EPIC-P1-WORLD' -l 'phase:P1' -l 'size:M' --body '**ID:** P1-144
**Epic:** EPIC-P1-WORLD
**Size:** M
**Phase:** P1

## Описание
Сервис checkVisibility(ship): берёт текущую позицию корабля, ищет невидимые игроку планеты/системы в радиусе ship.sensor_range. Если найдены — добавляет в discovered_planets/discovered_systems и возвращает массив новых открытий (для пушей).

## Acceptance criteria
1. Если планета в радиусе и не открыта → попадает в discovered
2. Если уже открыта → не дублируется
3. Уважается home_system: чужой корабль не может "увидеть" чужую home system

## Файлы
- `backend/src/features/world/visibility.ts`
- `backend/src/features/world/visibility.test.ts`

## Зависимости
- P1-108
- P1-105

## Как проверить
Unit-тест: запустить корабль с sensor_range=30, поставить планету в 25 ед → она открывается

## Примечания
Радиус — евклидов. Используется в worker tick_expeditions.')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-144"]="$URL"

echo ">> P1-150: [P1-150] Resource accrual: lazy compute on read"
URL=$(gh issue create --repo "$REPO" --title '[P1-150] Resource accrual: lazy compute on read' -l 'epic:EPIC-P1-RES' -l 'phase:P1' -l 'size:M' --body '**ID:** P1-150
**Epic:** EPIC-P1-RES
**Size:** M
**Phase:** P1

## Описание
Сервис computeCurrentResources(planetId): для каждого resource — amount + rate × (now - last_update_at). Не пишет в БД, только возвращает значения. Учитывает cap склада (storage cap).

## Acceptance criteria
1. Если last_update = now-3600s, rate=10/h → amount += 10
2. Не превышает storage cap
3. Возвращает массив всех ресурсов планеты

## Файлы
- `backend/src/features/resources/accrual.ts`
- `backend/src/features/resources/accrual.test.ts`

## Зависимости
- P1-103

## Как проверить
Unit-тест с мок-временем

## Примечания
Это основной паттерн event-based симуляции. Описано в Stellar_Forge_GDD.docx §14.3.')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-150"]="$URL"

echo ">> P1-151: [P1-151] Resource transactions: spend/gain (атомарно)"
URL=$(gh issue create --repo "$REPO" --title '[P1-151] Resource transactions: spend/gain (атомарно)' -l 'epic:EPIC-P1-RES' -l 'phase:P1' -l 'size:M' --body '**ID:** P1-151
**Epic:** EPIC-P1-RES
**Size:** M
**Phase:** P1

## Описание
Сервис spendResources(planetId, costs[]) и gainResources(planetId, gains[]): транзакция, SELECT FOR UPDATE на planet_resources, обновляет last_update_at. Возвращает {success, balanceAfter} или {success:false, error:"not enough X"}.

## Acceptance criteria
1. Параллельные вызовы не приводят к отрицательным значениям
2. Если не хватает ресурса — транзакция откатывается, ничего не списано
3. last_update_at синхронизируется со списанием

## Файлы
- `backend/src/features/resources/transactions.ts`
- `backend/src/features/resources/transactions.test.ts`

## Зависимости
- P1-150

## Как проверить
Stress-тест: 100 параллельных списаний → итоговый баланс корректный

## Примечания
КРИТИЧЕСКАЯ ВЕЩЬ. Любая ошибка тут = дюп ресурсов. Должно быть >=80% покрытие тестами.')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-151"]="$URL"

echo ">> P1-152: [P1-152] POST /resources/convert — Лёд ⇄ Вода"
URL=$(gh issue create --repo "$REPO" --title '[P1-152] POST /resources/convert — Лёд ⇄ Вода' -l 'epic:EPIC-P1-RES' -l 'phase:P1' -l 'size:M' --body '**ID:** P1-152
**Epic:** EPIC-P1-RES
**Size:** M
**Phase:** P1

## Описание
Эндпоинт принимает {from: "ice"|"water", to, amount}. Проверяет наличие Cryogenic Factory или Smelter lvl 3+. Списывает ресурс, начисляет другой с учётом потерь (5% при воде→льду, 0% при льду→воде).

## Acceptance criteria
1. Без Cryogenic Factory → 400
2. С Cryo lvl 1 → конвертация работает
3. Лёд→Вода: 100 льда → 100 воды
4. Вода→Лёд: 100 воды → 95 льда
5. Энергия списывается

## Файлы
- `backend/src/features/resources/convert.ts`
- `backend/src/features/resources/convert.test.ts`

## Зависимости
- P1-151
- P1-160

## Как проверить
Integration-тест

## Примечания
См. addendum §2.1.')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-152"]="$URL"

echo ">> P1-160: [P1-160] POST /buildings/build — постройка нового здания"
URL=$(gh issue create --repo "$REPO" --title '[P1-160] POST /buildings/build — постройка нового здания' -l 'epic:EPIC-P1-BLD' -l 'phase:P1' -l 'size:M' --body '**ID:** P1-160
**Epic:** EPIC-P1-BLD
**Size:** M
**Phase:** P1

## Описание
Принимает {planetId, typeSlug, slot}. Проверяет: планета принадлежит игроку, есть свободный слот, выполнены deps, хватает ресурсов. Списывает ресурсы, создаёт buildings запись с queue_completes_at = now + base_time, ставит BullMQ job.

## Acceptance criteria
1. Если не хватает ресурсов → 400 с деталями
2. Если слот занят → 400
3. Если deps не выполнены → 400
4. Успех → возвращает building с queue_completes_at
5. Очередь стройки лимитирована 1 (без премиума)

## Файлы
- `backend/src/features/buildings/routes.ts`
- `backend/src/features/buildings/service.ts`
- `backend/src/features/buildings/service.test.ts`

## Зависимости
- P1-151
- P1-104

## Как проверить
Integration-тест полного flow

## Примечания
Все формулы стоимости из Stellar_Forge_GDD.docx §5.2.')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-160"]="$URL"

echo ">> P1-161: [P1-161] POST /buildings/{id}/upgrade — апгрейд здания"
URL=$(gh issue create --repo "$REPO" --title '[P1-161] POST /buildings/{id}/upgrade — апгрейд здания' -l 'epic:EPIC-P1-BLD' -l 'phase:P1' -l 'size:M' --body '**ID:** P1-161
**Epic:** EPIC-P1-BLD
**Size:** M
**Phase:** P1

## Описание
Аналогично build, но для existing building. Стоимость = base_cost × 1.6^(level-1). Время = base_time × 1.5^(level-1).

## Acceptance criteria
1. Не апгрейдит дальше max_level
2. Стоимость считается по формуле
3. queue_action = "upgrade", level не меняется до завершения

## Файлы
- `backend/src/features/buildings/upgrade.ts`
- `backend/src/features/buildings/upgrade.test.ts`

## Зависимости
- P1-160

## Как проверить
Integration-тест
')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-161"]="$URL"

echo ">> P1-162: [P1-162] Worker: tick_buildings"
URL=$(gh issue create --repo "$REPO" --title '[P1-162] Worker: tick_buildings' -l 'epic:EPIC-P1-BLD' -l 'phase:P1' -l 'size:M' --body '**ID:** P1-162
**Epic:** EPIC-P1-BLD
**Size:** M
**Phase:** P1

## Описание
BullMQ воркер, бежит каждые 30 секунд. Находит buildings, у которых queue_completes_at ≤ now. Применяет результат: для build — level=1, для upgrade — level+=1. Обновляет regen_rate ресурсов на этой планете (в planet_resources).

## Acceptance criteria
1. Здание завершается ровно по таймеру (±30 сек)
2. Скорость добычи на планете обновляется (если это шахта)
3. Уведомление кладётся в notifications таблицу

## Файлы
- `backend/src/workers/tick-buildings.ts`
- `backend/src/workers/tick-buildings.test.ts`

## Зависимости
- P1-161

## Как проверить
Integration-тест: построить здание с base_time=10s, подождать → level=1

## Примечания
Использовать BullMQ repeat-job.')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-162"]="$URL"

echo ">> P1-170: [P1-170] POST /ships/build — постройка корабля"
URL=$(gh issue create --repo "$REPO" --title '[P1-170] POST /ships/build — постройка корабля' -l 'epic:EPIC-P1-SHP' -l 'phase:P1' -l 'size:M' --body '**ID:** P1-170
**Epic:** EPIC-P1-SHP
**Size:** M
**Phase:** P1

## Описание
Принимает {planetId, typeSlug}. Проверяет: shipyard есть, deps выполнены, ресурсы хватает. Списывает, ставит в очередь верфи. Очередь лимитирована.

## Acceptance criteria
1. Без shipyard → 400
2. Слот верфи занят → 400
3. Успех → возвращает ship с status="building"

## Файлы
- `backend/src/features/ships/build.ts`
- `backend/src/features/ships/build.test.ts`

## Зависимости
- P1-151
- P1-105

## Как проверить
Integration-тест
')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-170"]="$URL"

echo ">> P1-171: [P1-171] Worker: tick_ships"
URL=$(gh issue create --repo "$REPO" --title '[P1-171] Worker: tick_ships' -l 'epic:EPIC-P1-SHP' -l 'phase:P1' -l 'size:M' --body '**ID:** P1-171
**Epic:** EPIC-P1-SHP
**Size:** M
**Phase:** P1

## Описание
BullMQ воркер. Завершает постройку кораблей. Меняет status: building → idle, location_planet_id = where_built.

## Acceptance criteria
1. Корабль готов в срок
2. Уведомление в notifications

## Файлы
- `backend/src/workers/tick-ships.ts`

## Зависимости
- P1-170

## Как проверить
Integration-тест
')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-171"]="$URL"

echo ">> P1-180: [P1-180] POST /expeditions — отправить корабль"
URL=$(gh issue create --repo "$REPO" --title '[P1-180] POST /expeditions — отправить корабль' -l 'epic:EPIC-P1-EXP' -l 'phase:P1' -l 'size:L' --body '**ID:** P1-180
**Epic:** EPIC-P1-EXP
**Size:** L
**Phase:** P1

## Описание
Принимает {shipId, targetX, targetY, targetZ, fuelLoaded, cargoLoaded}. Проверяет: корабль idle, принадлежит игроку, на стартовой планете есть достаточно топлива и груза. Создаёт expedition, ставит ship.status=moving, рассчитывает eta.

## Acceptance criteria
1. Корабль не idle → 400
2. Не хватает топлива → 400
3. eta = distance × 60 / speed × engine_factor
4. BullMQ job на eta запланирован

## Файлы
- `backend/src/features/expeditions/launch.ts`
- `backend/src/features/expeditions/launch.test.ts`

## Зависимости
- P1-170
- P1-151

## Как проверить
Integration-тест: запустить scout на 10 ед → видеть expedition с eta
')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-180"]="$URL"

echo ">> P1-181: [P1-181] Worker: tick_expeditions"
URL=$(gh issue create --repo "$REPO" --title '[P1-181] Worker: tick_expeditions' -l 'epic:EPIC-P1-EXP' -l 'phase:P1' -l 'size:L' --body '**ID:** P1-181
**Epic:** EPIC-P1-EXP
**Size:** L
**Phase:** P1

## Описание
BullMQ воркер каждые 30 сек. Для всех in_flight expeditions: рассчитывает текущую позицию (linear interp), вызывает checkVisibility, если eta достигнут — переводит в "arrived" и стартует возврат (если scout/probe). При возврате — apply результат (planet discovery, cargo unload).

## Acceptance criteria
1. Корабль "движется" во времени, видимость обновляется
2. По прибытии — discovered_planets обновляется (если visibility сработал)
3. Возвращается в стартовую планету (для scout/cargo-empty), eta удваивается

## Файлы
- `backend/src/workers/tick-expeditions.ts`
- `backend/src/workers/tick-expeditions.test.ts`

## Зависимости
- P1-180
- P1-144

## Как проверить
Integration-тест полного цикла scout → return

## Примечания
Самая сложная логика. Тестировать каждый кейс отдельно.')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-181"]="$URL"

echo ">> P1-182: [P1-182] POST /expeditions/jump — межсистемный прыжок"
URL=$(gh issue create --repo "$REPO" --title '[P1-182] POST /expeditions/jump — межсистемный прыжок' -l 'epic:EPIC-P1-EXP' -l 'phase:P1' -l 'size:M' --body '**ID:** P1-182
**Epic:** EPIC-P1-EXP
**Size:** M
**Phase:** P1

## Описание
Особый эндпоинт для Jump Ship. Принимает {shipId, targetSector{x,y,z}}. Проверяет: ship.type = jump_ship, есть Jump Fuel в баке, Jump Drive исследован lvl 1+. Lazy-генерит сектор, выбирает целевую систему. После прибытия — добавляет в discovered_systems.

## Acceptance criteria
1. Без Jump Drive → 400
2. Не Jump Ship → 400
3. Не хватает Jump Fuel → 400
4. Успех → корабль попадает в общий пул

## Файлы
- `backend/src/features/expeditions/jump.ts`

## Зависимости
- P1-180
- P1-143

## Как проверить
Integration-тест

## Примечания
См. addendum §3.5-§3.6.')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-182"]="$URL"

echo ">> P1-200: [P1-200] API client + auth flow"
URL=$(gh issue create --repo "$REPO" --title '[P1-200] API client + auth flow' -l 'epic:EPIC-P1-FE' -l 'phase:P1' -l 'size:M' --body '**ID:** P1-200
**Epic:** EPIC-P1-FE
**Size:** M
**Phase:** P1

## Описание
frontend/src/lib/api.ts: единый клиент с автоматической передачей session token из Telegram WebApp SDK. React Query для всех запросов. Auth flow: при загрузке → POST /auth/telegram → сохранить token → GET /me.

## Acceptance criteria
1. При первом запуске игрок авторизован автоматически
2. Token хранится в memory (НЕ localStorage)
3. Все запросы автоматически шлют Authorization header

## Файлы
- `frontend/src/lib/api.ts`
- `frontend/src/hooks/useAuth.ts`
- `frontend/src/hooks/useMe.ts`

## Зависимости
- P0-004
- P1-122

## Как проверить
Открыть TMA → видеть данные игрока

## Примечания
Использовать @tanstack/react-query.')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-200"]="$URL"

echo ">> P1-201: [P1-201] Главный экран: ресурсы + очередь стройки"
URL=$(gh issue create --repo "$REPO" --title '[P1-201] Главный экран: ресурсы + очередь стройки' -l 'epic:EPIC-P1-FE' -l 'phase:P1' -l 'size:L' --body '**ID:** P1-201
**Epic:** EPIC-P1-FE
**Size:** L
**Phase:** P1

## Описание
Основной экран TMA: верх — плашка с балансом ресурсов (с регенерацией в реальном времени через requestAnimationFrame), середина — текущая фокус-планета (схема со зданиями), низ — таб-бар: Planets, Ships, Map, Tech, Profile.

## Acceptance criteria
1. Ресурсы тикают в UI (анимированно увеличиваются)
2. Очередь стройки видна с countdown
3. Tap на здание → открывает деталь

## Файлы
- `frontend/src/pages/Home.tsx`
- `frontend/src/components/ResourceBar.tsx`
- `frontend/src/components/PlanetView.tsx`
- `frontend/src/components/BuildQueue.tsx`

## Зависимости
- P1-200

## Как проверить
UI matches описание

## Примечания
Тёмная тема, космический стиль. Tailwind + Lucide icons.')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-201"]="$URL"

echo ">> P1-202: [P1-202] Экран планеты: слоты и апгрейды"
URL=$(gh issue create --repo "$REPO" --title '[P1-202] Экран планеты: слоты и апгрейды' -l 'epic:EPIC-P1-FE' -l 'phase:P1' -l 'size:M' --body '**ID:** P1-202
**Epic:** EPIC-P1-FE
**Size:** M
**Phase:** P1

## Описание
Список зданий планеты + пустые слоты. Tap на слот → диалог выбора здания. Tap на existing → диалог апгрейда с показом стоимости.

## Acceptance criteria
1. Видны все здания + пустые слоты
2. Стоимость апгрейда видна заранее
3. После постройки/апгрейда — оптимистичный UI с rollback при ошибке

## Файлы
- `frontend/src/pages/PlanetDetail.tsx`
- `frontend/src/components/BuildingSlot.tsx`
- `frontend/src/components/UpgradeDialog.tsx`

## Зависимости
- P1-201
- P1-160
- P1-161

## Как проверить
Полный flow стройки шахты
')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-202"]="$URL"

echo ">> P1-203: [P1-203] Карта домашней системы"
URL=$(gh issue create --repo "$REPO" --title '[P1-203] Карта домашней системы' -l 'epic:EPIC-P1-FE' -l 'phase:P1' -l 'size:M' --body '**ID:** P1-203
**Epic:** EPIC-P1-FE
**Size:** M
**Phase:** P1

## Описание
Top-down карта Home System на PixiJS. Звезда в центре, планеты на орбитах, открытые — с именами и ресурсами, неоткрытые — "?". Маркеры кораблей с траекториями.

## Acceptance criteria
1. Карта рендерится 60fps на mid-tier мобильных
2. Pan + pinch zoom
3. Tap на планету → переход на экран планеты

## Файлы
- `frontend/src/pages/SystemMap.tsx`
- `frontend/src/components/pixi/SystemRenderer.tsx`

## Зависимости
- P1-201

## Как проверить
Открыть карту → видеть свою систему

## Примечания
PixiJS v8.')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-203"]="$URL"

echo ">> P1-204: [P1-204] Экран кораблей + запуск экспедиции"
URL=$(gh issue create --repo "$REPO" --title '[P1-204] Экран кораблей + запуск экспедиции' -l 'epic:EPIC-P1-FE' -l 'phase:P1' -l 'size:M' --body '**ID:** P1-204
**Epic:** EPIC-P1-FE
**Size:** M
**Phase:** P1

## Описание
Список кораблей с состоянием. Кнопка «Отправить» → диалог: выбор точки на мини-карте + загрузка топлива + ETA preview.

## Acceptance criteria
1. Видно все корабли
2. Можно запустить scout, видеть его на карте
3. ETA отсчитывается в реальном времени

## Файлы
- `frontend/src/pages/Ships.tsx`
- `frontend/src/components/ExpeditionDialog.tsx`

## Зависимости
- P1-203
- P1-180

## Как проверить
Запустить scout → видеть в полёте на карте
')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-204"]="$URL"

echo ">> P1-205: [P1-205] Экран исследований (tech tree)"
URL=$(gh issue create --repo "$REPO" --title '[P1-205] Экран исследований (tech tree)' -l 'epic:EPIC-P1-FE' -l 'phase:P1' -l 'size:M' --body '**ID:** P1-205
**Epic:** EPIC-P1-FE
**Size:** M
**Phase:** P1

## Описание
7 веток × 5 уровней. Tap на узел → диалог с деталями + кнопка start. Отображение прогресса.

## Acceptance criteria
1. Все ветки видны
2. Можно начать исследование если хватает ресурсов и lab lvl
3. Прогресс таймера в реальном времени

## Файлы
- `frontend/src/pages/Research.tsx`
- `frontend/src/components/TechTreeNode.tsx`

## Зависимости
- P1-200
- P1-106

## Как проверить
Start research → ждать → done
')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-205"]="$URL"

echo ">> P1-206: [P1-206] Onboarding tutorial"
URL=$(gh issue create --repo "$REPO" --title '[P1-206] Onboarding tutorial' -l 'epic:EPIC-P1-FE' -l 'phase:P1' -l 'size:M' --body '**ID:** P1-206
**Epic:** EPIC-P1-FE
**Size:** M
**Phase:** P1

## Описание
5 шагов: Welcome → Build first mine → Build storage → Build scout → Send first expedition. Skipable, но ресурсы за выполнение.

## Acceptance criteria
1. Запускается на первом входе нового user
2. Можно скипнуть и вернуться позже
3. Награда (200 Fe + 100 H₂O) за прохождение

## Файлы
- `frontend/src/components/Tutorial.tsx`
- `frontend/src/pages/onboarding/`

## Зависимости
- P1-201
- P1-202
- P1-204

## Как проверить
Создать нового user → пройти tutorial → получить награду
')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-206"]="$URL"

echo ">> P1-220: [P1-220] Telegram bot webhook + /start"
URL=$(gh issue create --repo "$REPO" --title '[P1-220] Telegram bot webhook + /start' -l 'epic:EPIC-P1-BOT' -l 'phase:P1' -l 'size:M' --body '**ID:** P1-220
**Epic:** EPIC-P1-BOT
**Size:** M
**Phase:** P1

## Описание
POST /tg/webhook принимает обновления от Telegram. Команда /start отвечает с inline-кнопкой "Открыть New Universe" → запуск Mini App.

## Acceptance criteria
1. Webhook настроен
2. /start работает
3. Кнопка открывает TMA

## Файлы
- `backend/src/features/bot/webhook.ts`
- `backend/src/features/bot/commands.ts`

## Зависимости
- P0-010

## Как проверить
В Telegram: /start → видеть кнопку
')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-220"]="$URL"

echo ">> P1-221: [P1-221] Push-уведомления о ключевых событиях"
URL=$(gh issue create --repo "$REPO" --title '[P1-221] Push-уведомления о ключевых событиях' -l 'epic:EPIC-P1-BOT' -l 'phase:P1' -l 'size:M' --body '**ID:** P1-221
**Epic:** EPIC-P1-BOT
**Size:** M
**Phase:** P1

## Описание
Сервис sendPush(userId, type, payload). Воркер раз в минуту берёт notifications из БД с pending=true и шлёт в Telegram. Для типов: building_done, ship_done, expedition_returned, research_done.

## Acceptance criteria
1. После завершения постройки → пуш приходит в Telegram
2. Notification помечается sent_at
3. Соблюдается лимит 20 сообщений/мин на user

## Файлы
- `backend/src/workers/notifications.ts`
- `backend/src/features/bot/push.ts`

## Зависимости
- P1-220
- P1-162

## Как проверить
Построить здание → дождаться → пуш в Telegram
')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-221"]="$URL"

echo ">> P1-240: [P1-240] Integration test: full first-day flow"
URL=$(gh issue create --repo "$REPO" --title '[P1-240] Integration test: full first-day flow' -l 'epic:EPIC-P1-QA' -l 'phase:P1' -l 'size:L' --body '**ID:** P1-240
**Epic:** EPIC-P1-QA
**Size:** L
**Phase:** P1

## Описание
Один большой E2E-тест: создать user → home system сгенерирована → построить шахту → апгрейднуть → построить scout → запустить → дождаться возврата → открыть планету.

## Acceptance criteria
1. Тест проходит за < 30 сек (с ускоренным временем)
2. Покрывает основные ошибочные пути

## Файлы
- `backend/tests/e2e/first-day.test.ts`

## Зависимости
- P1-181
- P1-162
- P1-171

## Как проверить
`npm run test:e2e` зелёный

## Примечания
Использовать testcontainers если нужен изолированный Postgres.')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-240"]="$URL"

echo ">> P1-241: [P1-241] Playwright E2E на frontend"
URL=$(gh issue create --repo "$REPO" --title '[P1-241] Playwright E2E на frontend' -l 'epic:EPIC-P1-QA' -l 'phase:P1' -l 'size:M' --body '**ID:** P1-241
**Epic:** EPIC-P1-QA
**Size:** M
**Phase:** P1

## Описание
Тест: открыть TMA с моком Telegram initData → пройти onboarding → построить шахту → проверить что ресурсы тикают.

## Acceptance criteria
1. Тест проходит

## Файлы
- `frontend/tests/e2e/onboarding.spec.ts`

## Зависимости
- P1-206

## Как проверить
`npx playwright test` зелёный
')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P1-241"]="$URL"

echo ">> P2-EPIC-COLONIZE: [P2-EPIC-COLONIZE] [Эпик] Колонизация и вторая планета"
URL=$(gh issue create --repo "$REPO" --title '[P2-EPIC-COLONIZE] [Эпик] Колонизация и вторая планета' -l 'epic:EPIC-P2-OUT' -l 'phase:P2' -l 'size:XL' --body '**ID:** P2-EPIC-COLONIZE
**Epic:** EPIC-P2-OUT
**Size:** XL
**Phase:** P2

## Описание
Колонизатор как корабль, развёртывание новой колонии в Common Pool, синхронизация ресурсов между планетами через Cargo.

## Acceptance criteria
1. К концу Phase 2 игрок может иметь 2-3 колонии и перевозить груз

## Файлы
- `будут расписаны при разбиении эпика на микротаски`

## Зависимости
- P1-181

## Как проверить
—

## Примечания
Разбить на ~10 микротасок при старте Phase 2.')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P2-EPIC-COLONIZE"]="$URL"

echo ">> P2-EPIC-MARKET-NPC: [P2-EPIC-MARKET-NPC] [Эпик] NPC-маркет (биржа)"
URL=$(gh issue create --repo "$REPO" --title '[P2-EPIC-MARKET-NPC] [Эпик] NPC-маркет (биржа)' -l 'epic:EPIC-P2-OUT' -l 'phase:P2' -l 'size:L' --body '**ID:** P2-EPIC-MARKET-NPC
**Epic:** EPIC-P2-OUT
**Size:** L
**Phase:** P2

## Описание
Игрок может выставлять и покупать ордера у NPC брокера в системе. Карго-перевозка автоматизированно.

## Acceptance criteria
1. Эконом-цикл: продать излишек одного ресурса за нужный

## Файлы
- `—`

## Зависимости
- P2-EPIC-COLONIZE

## Как проверить
—
')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P2-EPIC-MARKET-NPC"]="$URL"

echo ">> P2-EPIC-RESEARCH: [P2-EPIC-RESEARCH] [Эпик] Research lvl 1-3 для всех веток"
URL=$(gh issue create --repo "$REPO" --title '[P2-EPIC-RESEARCH] [Эпик] Research lvl 1-3 для всех веток' -l 'epic:EPIC-P2-OUT' -l 'phase:P2' -l 'size:L' --body '**ID:** P2-EPIC-RESEARCH
**Epic:** EPIC-P2-OUT
**Size:** L
**Phase:** P2

## Описание
Полная имплементация tech-веток до 3 уровня + UI прогресса.

## Acceptance criteria
1. Игрок может пройти любую ветку до lvl 3

## Файлы
- `—`

## Зависимости
- P1-205

## Как проверить
—
')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P2-EPIC-RESEARCH"]="$URL"

echo ">> P3-EPIC-MULTIPLAYER-MAP: [P3-EPIC-MULTIPLAYER-MAP] [Эпик] Multiplayer карта Common Pool"
URL=$(gh issue create --repo "$REPO" --title '[P3-EPIC-MULTIPLAYER-MAP] [Эпик] Multiplayer карта Common Pool' -l 'epic:EPIC-P3-OUT' -l 'phase:P3' -l 'size:XL' --body '**ID:** P3-EPIC-MULTIPLAYER-MAP
**Epic:** EPIC-P3-OUT
**Size:** XL
**Phase:** P3

## Описание
Видны другие игроки, их колонии, флоты. Глобальный поиск систем. Sector map UI.

## Acceptance criteria
1. Игрок видит соседей в Sector Map

## Файлы
- `—`

## Зависимости
- P1-182

## Как проверить
—
')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P3-EPIC-MULTIPLAYER-MAP"]="$URL"

echo ">> P3-EPIC-ALLIANCES: [P3-EPIC-ALLIANCES] [Эпик] Альянсы (кланы)"
URL=$(gh issue create --repo "$REPO" --title '[P3-EPIC-ALLIANCES] [Эпик] Альянсы (кланы)' -l 'epic:EPIC-P3-OUT' -l 'phase:P3' -l 'size:L' --body '**ID:** P3-EPIC-ALLIANCES
**Epic:** EPIC-P3-OUT
**Size:** L
**Phase:** P3

## Описание
Создание альянса, общий банк, чат, карта членов, объявления о войне.

## Acceptance criteria
1. Игроки могут объединяться в альянсы до 30 человек

## Файлы
- `—`

## Зависимости
- P3-EPIC-MULTIPLAYER-MAP

## Как проверить
—
')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P3-EPIC-ALLIANCES"]="$URL"

echo ">> P3-EPIC-MARKET-PVP: [P3-EPIC-MARKET-PVP] [Эпик] Маркет между игроками"
URL=$(gh issue create --repo "$REPO" --title '[P3-EPIC-MARKET-PVP] [Эпик] Маркет между игроками' -l 'epic:EPIC-P3-OUT' -l 'phase:P3' -l 'size:L' --body '**ID:** P3-EPIC-MARKET-PVP
**Epic:** EPIC-P3-OUT
**Size:** L
**Phase:** P3

## Описание
Биржа доступна между игроками с автоматической доставкой через NPC-карго.

## Acceptance criteria
1. Игроки могут торговать друг с другом

## Файлы
- `—`

## Зависимости
- P2-EPIC-MARKET-NPC

## Как проверить
—
')
echo "  $URL"
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$URL" >/dev/null
ISSUE_URL_BY_TASK_ID["P3-EPIC-MARKET-PVP"]="$URL"

echo ""
echo "=== ГОТОВО ==="
echo "Создано задач: 53"
echo "Все добавлены в проект $PROJECT_OWNER/$PROJECT_NUMBER"
echo ""
echo "Следующий шаг: открой проект и сгруппируй по label \"phase:*\" или \"epic:*\""