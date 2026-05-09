# Phase 1.1 — Post-design fixes & MVP gap-filling

> Корректирующий эпик `EPIC-P1.1-FIX`, добавленный после внедрения дизайна
> **Cosmic Atlas** (см. `design-bundle/project/New Universe - Planet System.html`)
> и аудита уже сделанных лёгкими моделями задач P0/P1.

Эпик закрывает три категории работы:

1. **Внедрение нового дизайна** на все экраны TMA.
2. **Фиксы рассинхрона** между бэкендом и фронтендом, найденные в ходе аудита P1.
3. **Завершение задач**, отмеченных как done, но не покрывающих свои acceptance criteria, и двух задач, отложенных до редизайна.

Канонический список задач лежит в `tasks/tasks.json` под идентификаторами `P1.1-300 … P1.1-309`. Этот документ — высокоуровневая сводка для ревью.

---

## Категория 1 — Внедрение Cosmic Atlas

| ID | Размер | Что | Файлы |
|---|---|---|---|
| **P1.1-300** | M | Перевести Home, PlanetDetail, Research, Ships, SystemMap, BuildDialog, UpgradeDialog, BuildQueue, ResourceBar, BuildingSlot, PlanetView на новый визуальный язык. Создать общие атомы в `frontend/src/components/cosmic/`. | `frontend/src/index.css`, `frontend/index.html`, `frontend/src/components/cosmic/*`, `frontend/src/pages/*`, `frontend/src/components/{BuildDialog,UpgradeDialog,BuildQueue,BuildingSlot,PlanetView,ResourceBar}.tsx` |

**Already implemented in this PR.** Дизайн внедрён, `tsc --noEmit` и `eslint` проходят без новых ошибок. Что осталось — визуальный QA на устройстве и подключение Operator-HUD / Cartograph как опциональных тем (вынесено в P2).

---

## Категория 2 — Фиксы рассинхрона / багов P0/P1

Эти баги делают часть MVP-фичей нерабочими в реальной игре, даже если соответствующая задача формально закрыта.

### P1.1-301 · `research_lab` ↔ `lab` mismatch  ⚠️ блокирует исследования
- Бэкенд (`backend/src/features/research/data.ts`, `routes.ts`) ищет здание с `typeId === 'research_lab'`.
- Каталог зданий (`backend/src/db/seed/building-types.ts`) знает только `lab`.
- Следствие: проверка `labReq` всегда падает, ни одно исследование не запускается.

### P1.1-302 · `power_plant` placeholders во фронте
- `BuildingSlot.tsx` и старый `BuildDialog.tsx` рисовали ⚡ для `typeId === 'power_plant'`.
- Бэкенд имеет только `solar_plant`. Эмодзи-плейсхолдер никогда не отображался, но косвенно подтверждает, что фронтенд писали отдельно от каталога.
- Fix покрыт реализацией P1.1-300; задача оставлена для трекинга.

### P1.1-303 · `metal` / `crystal` / `deuterium` ресурсы не существуют  ⚠️ блокирует исследования
- `ResearchDefinition.cost` использует `metal`, `crystal`, `deuterium`.
- Каталог ресурсов знает `iron`, `silicon`, `tritium`, `water`, …, но не `metal`/`crystal`.
- Следствие: транзакционное списание `spend(...)` падает, исследование стартануть нельзя даже после фикса P1.1-301.

### P1.1-305 · ResourceBar accrual в неверной размерности
- Бэкенд хранит `regenRate` как «единиц/час» (см. `backend/src/features/resources/accrual.ts`, `timeDiffHours`).
- Старый фронтенд делал `currentAmount + regenRate * deltaSeconds` — рост в **3600× быстрее** реального.
- Capacity тоже была фиктивной (`cap = currentAmount`), поэтому fill-bar всегда показывал 100%.
- Деление `/3600` уже временно сделано в P1.1-300; полное исправление требует поднять реальный `storageCap` из `/me` и `/planets/{id}/resources`.

---

## Категория 3 — Acceptance gap

### P1.1-304 · Tech-tree всего 10 узлов вместо 35
- Acceptance P1-205: «7 веток × 5 уровней».
- Реально в `data.ts` 7 веток, но 6 из них — только level 1 (mining дополнительно имеет level 2).
- В UI это выглядит как «дерево из одной строки».

### P1.1-306 · Tap по зданию на Home не открывает деталь
- Acceptance P1-201: «Tap на здание → открывает деталь».
- `PlanetView` на Home делает `navigate('/planet/:id')` без указания слота. Деталь открывается, но контекстный диалог апгрейда — нет.

### P1.1-307 · Onboarding tutorial (P1-206) был отложен
- Это первая из двух задач, явно отложенных заказчиком до редизайна.
- Реализуется как overlay поверх Cosmic Atlas с 5 шагами и наградой 200 Fe + 100 H₂O.

### P1.1-308 · Playwright E2E (P1-241) — финализация
- Вторая отложенная задача. После редизайна нужно перевести E2E на новые `data-testid` и закрепить покрытие первого дня.

### P1.1-309 · Profile-таб
- Bottom-nav имеет 5 пунктов, но `/profile` не зарегистрирован. Пятый таб ведёт в 404.
- Минимальный экран профиля + регистрация в `App.tsx`.

---

## Зависимости и порядок

```
P1.1-301 ──┐
P1.1-303 ──┼─► P1.1-304 (наполнение tech-tree)
            │
P1.1-300 ──┼─► P1.1-306 (deep-link на слот)
            │
            └─► P1.1-309 (Profile-таб)

P1.1-305 — независимая работа на бэкенд+фронт
P1.1-307 — независимая работа на бэкенд+фронт+БД
P1.1-308 — после P1.1-300 и P1.1-307 (E2E проверяет туториал тоже)
```

## Рекомендуемая последовательность

1. **P1.1-301**, **P1.1-303** — мелкие, но блокирующие игру; дешевле всего.
2. **P1.1-304** — наполнить tech-tree (формула из задачи).
3. **P1.1-305** — починить размерность регена и подтянуть cap.
4. **P1.1-306**, **P1.1-309** — UX-полишинг.
5. **P1.1-307** — onboarding (требует БД-миграции).
6. **P1.1-308** — финализация E2E последним, чтобы закрыть весь P1+P1.1 единым прогоном.

## Метрика готовности фазы 1.1

Эпик считается завершённым, когда:

- `rg -n 'research_lab|metal|crystal|deuterium|power_plant' backend/src frontend/src` пуст (кроме комментариев/миграций).
- Все 35 ResearchDefinition присутствуют, тесты `research.test.ts` зелёные.
- Tap на любой слот на Home открывает соответствующий диалог в PlanetDetail.
- Новый игрок проходит туториал и получает бонус.
- Playwright E2E зелёный в CI.
- Визуальный pixel-spot-check Home/PlanetDetail/Research/Ships/SystemMap соответствует Cosmic Atlas.
