# New Universe

New Universe — это многопользовательская космическая стратегия в формате Telegram Mini App. Проект объединяет элементы управления ресурсами, строительства космических станций и тактических сражений в реальном времени. Игроки могут исследовать бесконечную вселенную, добывать ценные материалы и вступать в альянсы для достижения господства в космосе.

## Документация

Подробная информация о дизайне и механике игры находится в разделе GDD:
- [Stellar Forge GDD](docs/Stellar_Forge_GDD.pdf)
- [New Universe GDD Addendum v1.1](docs/New_Universe_GDD_Addendum_v1.1.pdf)
- [Infrastructure Costs](docs/Stellar_Forge_Infra_Costs.pdf)
- [Production Environment Plan](docs/production/environment.md)
- [Production Observability](docs/production/observability.md)
- [Production Release Workflow](docs/production/release-workflow.md)
- [Architecture Diagrams](docs/Stellar_Forge_Diagrams.html)
- [Launch Security Checklist](docs/security/launch-checklist.md)
- [Economy Exploit Review](docs/security/economy-exploits.md)
- [Product Analytics Event Taxonomy](docs/analytics/events.md)
- [Changelog](CHANGELOG.md)

Все проектные документы и спецификации доступны в папке [docs/](docs/).

Брендовые ассеты для внешних поверхностей лежат в `frontend/public/brand/`:
`new-universe-logo.svg` используется как favicon Mini App, а `new-universe-logo-512.png`
подходит для аватара Telegram-бота.

---

## Локальная разработка

Окружение для разработки в Docker. Core-стек поднимает Postgres, Redis и бэкенд (Fastify). Воркер очередей и фронтенд вынесены в отдельные Compose profiles до завершения их скелетных задач.

### Требования

- Docker Desktop (Mac/Windows) или Docker Engine + Compose plugin (Linux), версия ≥ 24
- ~4 GB свободного RAM
- Свободные порты: 3000, 5432, 6379 (плюс 5173 для frontend и 8080/8081 для devtools)

### Быстрый старт

```bash
# 1. Скопировать конфиг
cp .env.example .env

# 2. Получить токен тестового бота у @BotFather и вписать в .env
#    TELEGRAM_BOT_TOKEN=...

# 3. Поднять core-стек
docker compose up -d
```

Если токена Telegram ещё нет, можно поднять только инфраструктуру:

```bash
docker compose up -d postgres redis
```

### Куда что доступно

| Сервис | URL | Логин/пароль |
|---|---|---|
| Frontend (TMA dev, profile `frontend`) | http://localhost:5173 | — |
| Backend API | http://localhost:3000 | — |
| Postgres | localhost:5432 | nu / devpassword |
| Redis | localhost:6379 | — |
| Adminer (Postgres GUI) | http://localhost:8080 | postgres / nu / devpassword / new_universe |
| Redis Commander (Redis GUI) | http://localhost:8081 | — |

Worker теперь поднимается вместе с `docker compose up -d`. Frontend по-прежнему опционален и включается отдельным профилем:

```bash
docker compose --profile frontend up -d frontend
```

UI-инструменты `adminer` и `redis-commander` находятся в профиле `devtools` и не поднимаются автоматически. Запустить только их:

```bash
docker compose --profile devtools up -d adminer redis-commander
```

### Часто используемые команды

```bash
# Логи core-стека
docker compose logs -f backend

# Перезапуск одного сервиса
docker compose restart backend

# Полная остановка + удаление данных
docker compose down -v
```

Проектные задачи и дополнительные материалы находятся в [tasks/](tasks/) и [docs/](docs/). Production-инфраструктура для начального почти бесплатного запуска описана в [docs/production/environment.md](docs/production/environment.md), [docs/production/release-workflow.md](docs/production/release-workflow.md) и [infra/production/README.md](infra/production/README.md).

Перед production-запуском пройдите [security launch checklist](docs/security/launch-checklist.md): он фиксирует обязательные секреты, Telegram webhook secret, rate limits и GitHub security stage.
