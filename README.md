# New Universe

New Universe — это многопользовательская космическая стратегия в формате Telegram Mini App. Проект объединяет элементы управления ресурсами, строительства космических станций и тактических сражений в реальном времени. Игроки могут исследовать бесконечную вселенную, добывать ценные материалы и вступать в альянсы для достижения господства в космосе.

## Документация

Подробная информация о дизайне и механике игры находится в разделе GDD:
- [Stellar Forge GDD](docs/Stellar_Forge_GDD.pdf)
- [New Universe GDD Addendum v1.1](docs/New_Universe_GDD_Addendum_v1.1.pdf)

Все проектные документы и спецификации доступны в папке [docs/](docs/).

---

## Локальная разработка

Окружение для разработки в Docker. Поднимает Postgres, Redis, бэкенд (Fastify), воркер очередей (BullMQ) и фронтенд (Vite + React + Telegram Mini App SDK) одной командой.

### Требования

- Docker Desktop (Mac/Windows) или Docker Engine + Compose plugin (Linux), версия ≥ 24
- ~4 GB свободного RAM
- Свободные порты: 3000, 5173, 5432, 6379 (плюс 8080/8081 для devtools)

### Быстрый старт

```bash
# 1. Скопировать конфиг
cp .env.example .env

# 2. (опционально) Получить токен тестового бота у @BotFather и вписать в .env
#    TELEGRAM_BOT_TOKEN=...

# 3. Поднять стек
docker compose up -d
```

### Куда что доступно

| Сервис | URL | Логин/пароль |
|---|---|---|
| Frontend (TMA dev) | http://localhost:5173 | — |
| Backend API | http://localhost:3000 | — |
| Postgres | localhost:5432 | nu / devpassword |
| Redis | localhost:6379 | — |
| Adminer (Postgres GUI) | http://localhost:8080 | postgres / nu / devpassword / new_universe |
| Redis Commander (Redis GUI) | http://localhost:8081 | — |

UI-инструменты `adminer` и `redis-commander` находятся в профиле `devtools` и не поднимаются автоматически. Запустить только их:

```bash
docker compose --profile devtools up -d adminer redis-commander
```

### Часто используемые команды

```bash
# Логи
docker compose logs -f backend
docker compose logs -f worker
docker compose logs -f frontend

# Перезапуск одного сервиса
docker compose restart backend

# Полная остановка + удаление данных
docker compose down -v
```

Подробные инструкции по разработке доступны в [dev/README.md](dev/README.md).
