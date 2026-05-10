# Bulk-импорт задач в GitHub Project

Этот пакет создаёт 53 issue-в в твоём репозитории и добавляет их все
в твой GitHub Project https://github.com/users/anry88/projects/3.

## Что в пакете

| Файл | Назначение |
|---|---|
| `New_Universe_Microtasks.docx` | Читаемый документ со всеми задачами и промптами |
| `tasks.csv` | CSV для импорта в любую систему (Linear, Asana и т.п.) |
| `tasks.json` | Машиночитаемый формат + готовые per-task промпты |
| `ROADMAP_P2_P5.md` | Сверочный roadmap-документ для P2-P5 задач |
| `ROADMAP_COVERAGE_MATRIX.md` | Матрица покрытия фаз, completion gates и известных gaps |
| `roadmap_p2_p5_additions.json` | Источник добавленных P2-P5 epics/tasks |
| `merge_roadmap_p2_p5.mjs` | Генератор, который мерджит roadmap additions в `tasks.json`, CSV и docs |
| `import_to_github.sh` | Bash-скрипт для bulk-создания issues в GitHub |
| `import_to_github_idempotent.sh` | Безопасный повторный импорт: переиспользует существующие issues и не падает, если item уже есть в Project |
| `setup_github_project3_structure.sh` | Синхронизация Project fields/options и значений для всех задач; учитывает **закрытые GitHub issues** как источник правды для **Done**; см. `SETUP_ITEMS_ONLY` ниже |
| `setup_github_project3_views.sh` | Создание Project views для execution board и roadmap |
| `sync_project_phases_from_tasks.mjs` | Проставляет **Phase** по epic из `tasks.json` и **Status**, если он пустой: без зависимостей → Ready, иначе Backlog (как `setup_github_project3_structure.sh`) |
| `project_status.mjs` | Точечное движение задач по `Status`/`Verification` и автопромо разблокированных задач в `Ready` |
| `README_github_import.md` | Этот файл |

## Требования (запуск ЛОКАЛЬНО)

- macOS / Linux / WSL
- `gh` CLI: `brew install gh` или `sudo apt install gh`
- macOS: Bash 5 для исходного `import_to_github.sh` (`brew install bash` и запуск через `/opt/homebrew/bin/bash`)
- SSH-ключ, привязанный к GitHub аккаунту `anry88` (для git push в репозиторий, см. ниже)
- Существующий репозиторий `anry88/new-universe` (если ещё нет — создать пустой)
- Существующий проект https://github.com/users/anry88/projects/3

## Шаг 1: Авторизация gh

```bash
gh auth login
# выбрать GitHub.com → SSH → авторизоваться через браузер
gh auth status
# проверить, что есть scopes: repo, project, read:org
```

Если не хватает scopes:

```bash
gh auth refresh -s repo,project,read:org
```

## Шаг 2: Создать репозиторий (если ещё нет)

```bash
gh repo create anry88/new-universe --private --description "New Universe — Telegram Mini App game"
```

## Шаг 3: Запустить импорт

```bash
chmod +x import_to_github.sh
/opt/homebrew/bin/bash ./import_to_github.sh
```

Можно настроить через env-переменные:

```bash
REPO=anry88/new-universe \
PROJECT_OWNER=anry88 \
PROJECT_NUMBER=3 \
./import_to_github.sh
```

Если импорт уже запускался частично или есть риск дублей, используй безопасную версию:

```bash
chmod +x import_to_github_idempotent.sh
TASKS_JSON=tasks/tasks.json /opt/homebrew/bin/bash ./tasks/import_to_github_idempotent.sh
```

После импорта новых задач прогони синхронизацию полей Project (из корня репозитория):

```bash
node tasks/sync_project_phases_from_tasks.mjs
```

Иначе у карточек может быть пустой **Phase** (не попадут во фазовые вьюхи) и пустой **Status** (автоматизация `sync-ready` и доска работают некорректно). Полная перезапись всех полей по всем задачам — `tasks/setup_github_project3_structure.sh` (ещё и опции Phase в проекте подтягивает из `tasks.json`).

Если GitHub возвращает `GraphQL: API rate limit exceeded`, дождись сброса (`gh api rate_limit`) и запусти **только карточки** без мутаций опций полей:

```bash
SETUP_ITEMS_ONLY=1 bash tasks/setup_github_project3_structure.sh
```

Полный прогон (опции Phase/Epic и readme проекта) — без этой переменной, когда лимит GraphQL относительно полный (~5000).

**Восстановление доски после сброса статусов:** скрипт один раз запрашивает `gh issue list --state all` по репозиторию. Если заголовок issue совпадает с `[TASK_ID]…` и issue **закрыт**, карточке выставляются **Status = Done** и **Verification = Accepted**, даже если на проекте остались Backlog/Ready. Для **открытого** issue статус снова считается из `deps`: **Ready**, если в `tasks.json` нет зависимостей **или** каждая зависимость уже **Done** на доске либо её issue **закрыт** (как `node tasks/project_status.mjs sync-ready`); иначе **Backlog**. **Review / In Progress / Blocked** с доски сохраняются; устаревший **Done** при открытом issue не подтягивается. Если `gh issue list` недоступен, используется прежняя логика (борд + deps).

## Что произойдёт

1. Скрипт получит ID проекта через GraphQL.
2. Создаст labels: `epic:*`, `phase:P0`/`P1`/`P2`/`P3`, `size:S`/`M`/`L`/`XL`.
3. Для каждой задачи:
   - создаст GitHub Issue с заголовком `[ID] Название`
   - тело — описание + acceptance + файлы + зависимости
   - повесит labels
   - добавит в твой Project №3

Работает ~1-2 минуты для 53 задач.

## После импорта

В проекте получишь плоский список. Рекомендую:

1. Открой проект → Settings → Group by → `Labels` → выбери `phase:*` для группировки по фазам.
2. Создай view `Phase 0 (Setup)` с фильтром `label:"phase:P0"`.
3. Создай view `Phase 1 (Solo Core)` с фильтром `label:"phase:P1"`.
4. Создай status field: `Backlog → Ready → In Progress → Review → Done`.
5. Создай поле `Estimate` (Number) для отслеживания story points.

## Если что-то пошло не так

- **Скрипт падает с "Resource not accessible" или "unknown owner type"** — нет scope `project` или `read:org`. См. шаг 1.
- **"Project not found"** — неправильный `PROJECT_NUMBER`. Возьми из URL проекта.

## Движение статусов

Агенты должны использовать единый lifecycle:

- `Backlog`: задача ещё не готова из-за зависимостей или планирования.
- `Ready`: зависимости закрыты, задачу можно брать.
- `In Progress`: агент начал работу и создал ветку.
- `Review`: PR открыт и ждёт проверки/merge.
- `Blocked`: нужен секрет, доступ, решение, окружение или зависимость.
- `Done`: PR смержен, проверка принята, issue закрыт.

Ручные команды:

```bash
node tasks/project_status.mjs start P0-004 --branch task/P0-004-frontend-skeleton
node tasks/project_status.mjs task P0-004 --status "In Progress" --verification "Not run" --comment "Started in branch task/P0-004-frontend-skeleton."
node tasks/project_status.mjs task P0-004 --status "Review" --verification "Local pass" --comment "PR opened: <url>. Verification: <commands>."
node tasks/project_status.mjs task P0-004 --status "Blocked" --verification "Blocked" --comment "Blocked: provide <exact missing input>."
node tasks/project_status.mjs sync-ready
```

GitHub Action `.github/workflows/project-status.yml` двигает связанные задачи в `Review` при открытии PR, в `Done` после merge и прогоняет `sync-ready` после закрытия issue, чтобы зависимые задачи автоматически переходили в `Ready`. После **merge PR без** распознанного task id в заголовке/ветке/теле (ошибка `Closes`, только общий рефакторинг и т.п.) связанные карточки всё равно обрабатываются: скрипт вызывает `sync-ready`, чтобы разблокировать задачи по закрытым на GitHub зависимостям.

Ручной прогон только **sync-ready** (например после правки автоматизации): в репозитории **Actions → Project Status → Run workflow** (`workflow_dispatch`). Локально: `node tasks/project_status.mjs sync-ready` с теми же переменными `PROJECT_TOKEN` / `PROJECT_OWNER` / `PROJECT_NUMBER` / `REPO`, что и в workflow.

Список состояний issues для зависимостей собирается одним вызовом `gh issue list --limit 10000` — флаг `--page` у `gh issue list` не поддерживается; прежний постраничный цикл ломал скрипт при более чем 100 issues в репозитории.

После **merge PR** скрипт **всегда** вызывает `sync-ready` в `finally` (даже если в PR не нашли task id, карточки нет на Project или `updateTask` упал). Иначе зависимые задачи никогда не уходили из Backlog в Ready.

Строки доски для `sync-ready` читаются через **`gh project item-list`** (те же статусы, что в UI). Чтение только через GraphQL `fieldValues` давало обрезанный набор полей и неверный **Status**, из‑за этого условие «в Backlog» не выполнялось и **Promoted to Ready: 0**.

Скрипт перебирает **только** задачи из **`tasks/tasks.json`**. Если на GitHub Project есть карточки `[P2.1-405]` и т.д., а в закоммиченном `tasks.json` этих id нет (ветка отстаёт от полного плана), эти строки **игнорируются** — в логе CI будет меньше задач в JSON, чем строк на доске, и нужные фазы не продвинутся. Держи `tasks/tasks.json` в репозитории тем же составом, что импорт на доску.

Правило `sync-ready`: из **Backlog** (или из незаполненного статуса — см. `sync_project_phases_from_tasks.mjs`) в **Ready** переводятся задачи, у которых каждая зависимость считается выполненной: карточка зависимости на доске в **Done** **или** соответствующий GitHub issue **закрыт** (как у старых prerequisite вроде P1-161, если доска отстаёт). Задачи **без** `deps` в JSON также переводятся из Backlog в **Ready**. Для user-owned Project v2 нужен repository secret `PROJECT_TOKEN`: classic personal access token пользователя, который видит Project, со scopes `repo`, `project` и `read:org`. Не используй `GITHUB_TOKEN` или fine-grained token для этой автоматизации: они часто не имеют доступа к user-owned Project v2.

Если workflow падает на `gh project view 3 --owner anry88 --format json` с `unknown owner type`, `Could not resolve to a ProjectV2`, `Resource not accessible` или похожей ошибкой, почти всегда проблема в `PROJECT_TOKEN`: секрет отсутствует, токен создан не как classic PAT, не хватает scopes `repo`/`project`/`read:org`, токен истёк или создан пользователем без доступа к Project.
- **Дубликаты issue** — скрипт идемпотентным НЕ написан (для простоты). Если нужно перезапустить — закрой все ранее созданные через:
  ```bash
  gh issue list --repo anry88/new-universe --label 'phase:P0' --json number --jq '.[].number' | xargs -I{} gh issue close {} --repo anry88/new-universe
  ```

## Альтернатива: импорт CSV вручную

Если `gh` CLI не подходит — можно открыть `tasks.csv` в Excel/Numbers и:

1. Вставить колонки в форму создания issue вручную (медленно).
2. Использовать сторонний инструмент типа [github-csv-tools](https://github.com/gavinr/github-csv-tools).
3. Или импортировать в Linear/Asana/Trello — у них у всех есть CSV-импорт.

## Заметка для будущего

Когда будешь добавлять новые задачи — **редактируй `tasks.json`** (или его TS-экспорт), затем
прогоняй генератор заново. Так у тебя останется единый source of truth.
