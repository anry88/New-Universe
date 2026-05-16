# Changelog

All notable changes to New Universe will be documented in this file.

## [Unreleased]

### Fixed
- `issue #372`: окно с постройкой/апгрейдом на домашнем экране больше не открывается повторно после перехода во вкладку «ресурсы» и обратно — `PlanetDetail` теперь съедает `?slot=` ровно один раз и сразу очищает параметр из URL, чтобы последующие рефетчи `/me` не реоткрывали диалог. Дополнительно ужесточён фильтр `useColonies`, чтобы планетарный рейл/Колонии показывали только планеты с явным `isColonized === true`, и любые open-but-unsettled планеты домашней системы больше не появлялись на home-экране.
- `issue #390`: карточки кораблей на экране флота свернуты до иконки, названия и одной строки статус/ETA; HP/топливо/прыжковое топливо/щиты, прогресс сборки и кнопки `Send Mission`/`Refuel` раскрываются по тапу на карточку. Описание корабля, `Combat Role` и `Attack State` сняты с фронта флота как мета-информация, чтобы экран не перегружался.
- `issue #389`: военные корабли (combat/shield/missile) и дозаправщик теперь летят к выбранной планете в один конец и пришвартовываются на целевом космопорте вместо возврата как разведчик; топливо считается по одиночному маршруту, а уведомление `expedition_arrived` сообщает игроку о прибытии. Карта системы теперь рендерит сами корабли вдоль маршрута, а не только трейл — для летящих корпусов используется originPlanetId экспедиции как точка отсчёта вместо очищаемого `locationPlanetId`.

### Added
- `issue #391`: вместо отдельной памятки «Nuclear Payload Protocol» в военной верфи добавлен поздний `nuclear_carrier` — ракетный корабль на Weapons V и Military Shipyard L6, который через `missilePayload` ядерно бьёт по средним/тяжёлым вражеским корпусам и одновременно через orbital `damageProfile` бомбит вражеские здания и командные центры. Виджет `CombatShipMenu` удалён, а связанные `combat.nuclear.*` локали освобождены — идентичность ядерного удара теперь полностью внутри карточки корабля.
- `issue #373`: добавлена клиентская предпроверка для строительства, апгрейда, демонтажа и покупки ресурсов за алмазы. BuildDialog/UpgradeDialog блокируют действие до отправки, если на планете уже идёт стройка (`building_blocked_queue_full`) или не хватает ресурсов (`building_blocked_insufficient_resources`). Снос блокируется, если у здания активная очередь или у `spaceport` есть пришвартованные корабли/зарезервированные слоты. ResourceDiamondPurchaseDialog скрывает кнопку и поясняет нехватку алмазов, если котировка превышает баланс.
- `issue #373`: верфь предотвращает запросы `/ships/build`, которые сервер всё равно отклонит — `resolveShipBuildBlockedReason` теперь добавляет блокеры `queueFull` (на планете уже строится корабль) и `spaceportCapacityFull` (слоты посадки заняты пришвартованными кораблями и активными бронями экспедиций) с локализованными RU/EN сообщениями.
- `issue #370`: добавлен общий Cosmic Atlas resolver иконок ресурсов с покрытием всех gameplay-ресурсов, чтобы UI больше не показывал `Fe`, `Si`, `MA` и другие текстовые аббревиатуры вместо иконок.
- `P3-COM-010`: добавлены абстрактные правила ядерного payload-протокола, Weapons V gate, поздние advanced/Common Pool costs, cooldown, серверные проверки видимости/владения/нейтралов/protected-home/поселённых целей, shield-first damage resolution и локализованный warning-блок в верфи.
- `P3-COM-013` (issue #355): добавлен late-tier `atomic_reactor` с Energy IV gate, one-per-planet limit, abstract sealed-cell energy recipes на advanced Common Pool resources, backend production/audit/sector tests, Cosmic Atlas icon/labels и balance-sim mirror.
- `P3-COM-009` (issue #351): добавлены малый/средний/большой щитовые корабли с RU/EN метаданными, Cosmic Atlas иконками, advanced build costs, Energy gates, shield HP/radius/recharge/downtime hooks, серверной механикой покрытия/перекрытия/пробития/восстановления и UI-строкой статуса щита.
- `P3-COM-008` (issue #350): добавлены средние/тяжёлые линии истребителей, бомбардировщиков и лазерных кораблей, а также ракетные носители с абстрактными missile payload rules, Common Pool материалами, Weapons/Military Shipyard gates, RU/EN описаниями, Cosmic Atlas иконками и audit/combat покрытием.
- `P3-EPIC-COMBAT` (issue #342): combat-эпик разбит на исполняемые задачи `P3-COM-001…013`; стартовые боевые корабли используют home-available ресурсы, а advanced ветки вынесены на Common Pool ресурсы, редкие/радиоактивные материалы и atomic reactor energy.
- `P2.3-509` (issue #340): добавлена отдельная задача на ребаланс общих планет, удаление тёмной материи из активного каталога и покрытие всех добываемых ресурсов генерацией биомов.
- `P2.2-018` (issue #329): добавлен общий backend-диспетчер посадочных слотов `spaceport`, учитывающий докованные/строящиеся корабли, активные посадки к целевой планете и слоты возврата для return-trip рейсов.
- `P2.2-019` (issue #337): добавлена отдельная задача для единого optimistic UX очередей исследований, построек и кораблей.
- `P2.2-017` (issue #328): добавлен общий слой локализованных entity-labels для ресурсов, зданий и кораблей, используемый backend-ошибками и frontend fallback-текстами.
- `P2.2-016` (issue #327): добавлен общий Cosmic Atlas mapper иконок кораблей для карты, флота, верфи, запуска экспедиций и грузового диалога.
- Добавлены задачи в план по работе с кораблями и запуском:
  - `P2.2-016` (issue #327): «Стилизация иконок кораблей».
  - `P2.2-017` (issue #328): «Очистка мета-информации и локализация имен».
  - `P2.2-018` (issue #329): «Лимит космодрома и бронирование посадочных мест».
- Сформирована явная цепочка зависимостей задач: `P2.2-016 -> P2.2-017 -> P2.2-018`.

### Changed
- `issue #370`: пользовательские названия starter military resources обновлены с `Military Alloy` / `Military Composite` на реальные материалы Silver Steel / C/SiC Composite в seed catalog, shared entity labels, recipes и RU/EN локалях.
- `P3-EPIC-COMBAT` (issue #342): refuel transfer now validates and updates both ships under row locks, preventing concurrent refuel requests from overdrawing a refueler or overfilling a target tank.
- `P3-EPIC-COMBAT` (issue #342): colonization limits, cooldowns, and `/me` summaries now exclude only the seeded home capital, so a fresh player can still spend the first expansion colony slot after home-system generation creates the capital colony row.
- Normalized Drizzle migration journal timestamps so later migrations are not skipped by an older future-dated entry; staging should be recreated cleanly while the game is still pre-production.
- Jump Gate discovery/map behavior now keeps a player's first opened public system free of foreign colonies or docked ships, exposes mined-resource deposits for discovered public planets, shows Home in the system selector, draws hidden destination orbits from total planet count, and places docked ship markers directly on planet sprites.
- Jump Gate colonizer launches no longer apply the local colony-distance gate; known destination + discovered target planet are enough for range, and the launch dialog now selects jump-colonization targets by tapping planets on the destination map instead of choosing from planet chips.
- Селектор «Сектор» на системной карте показывает домашнюю систему и, после random Jump Gate discovery, список известных публичных систем; выбранная публичная система открывается как закрытая карта со звездой, порталом и скрытыми орбитами. Jump Gate scout-маршруты теперь выбирают точку в открытой системе и считают топливо по маршруту планета старта -> домашний портал -> портал назначения -> выбранная точка, плюс отдельный расход Jump Fuel.
- `silicon_carbide` больше не является добываемым месторождением шахты или редким metallic-депозитом; ресурс производится дорогим рецептом `fabrication_bay` из `silicon`, `carbon` и `steel`, чтобы прогресс не блокировался отсутствием SiC в стартовой системе.
- Лёд добавлен в список ресурсов, добываемых шахтой; англоязычное имя здания обновлено с `Metals Mine` на `Mine`, а сообщения о подходящих месторождениях теперь говорят про твёрдые минералы.
- Колонизационный лимит расширен до базового 1 слота + 5 слотов за каждый уровень «Логистики»; UI теперь предупреждает о cooldown перед отправкой колонизатора и о текущем лимите перед строительством нового колонизатора.
- `P2.3-509` (issue #340): общие системы теперь получают 6–9 планет, 9-планетные системы гарантируют anomalous-вариант, а non-energy планеты создают `richness`/zero-regen stockpile rows по размеру и редкости ресурсов.
- `P2.3-509` (issue #340): аномальные common-планеты разделены на antimatter/rare-metal, toxic, metallic и energy; энергетические планеты не имеют месторождений, но не требуют операционной энергии для построек и производств.
- `P2.3-509` (issue #340): домашняя система получила дополнительные common deposit slots на стартовых планетах; активный каталог оставляет `antimatter` и больше не сидит отдельный ресурс тёмной материи.
- `P2.2-018` (issue #329): обычные целевые посадки и строительство кораблей теперь требуют свободный слот `spaceport`; return-trip scout рейсы держат слот исходной планеты до возвращения, а one-way colonizer/recon_probe освобождают исходный слот после отправки.
- `P2.2-018` (issue #329): демонтаж `spaceport` блокируется, если на планете есть размещённые корабли или зарезервированные посадочные места.
- `P2.2-019` (issue #337): старт строительства/апгрейда и постройки кораблей приведен к optimistic-паттерну исследований; здания и корабли сразу показывают таймер/progress/rush, а серверный ответ заменяет временные id точными queue metadata.
- `P2.2-019` (issue #337): строящийся корабль больше не отображается как idle при отставании `/ships/queue`; rush для кораблей вынесен в нижний `QueueStrip`, как у зданий и исследований.
- `P2.2-017` (issue #328): блокировки строительства, верфи и запуска экспедиций теперь возвращают человекочитаемые RU/EN названия сущностей вместо raw slug/id; из игровых описаний убраны технические фрагменты вроде `size proxy` и server-copy.
- `P2.2-016` (issue #327): активный каталог использует `recon_probe` / «Разведывательный зонд» без миграции; random Jump Gate discovery теперь расходует этот одноразовый зонд, а обычные scout/colonizer/cargo_light остаются для маршрутов в уже известные системы.
- Подготовлены отдельные GitHub-issues и добавлены в Project для последующего исполнения без смешивания с текущими задачами других агентов.
- `P2.2-014` (issue #322): `POST /buildings/build` и `POST /buildings/upgrade` больше не создают Redis/BullMQ Queue/connection в request lifecycle; optional BullMQ enqueue вынесен в общий producer, а completion остаётся в `tick-buildings`.
- `P2.2-015` (issue #323): перебалансирована стартовая система игрока до 8 планет с одной ледяной планетой, фиксированными слотами стартовых месторождений, новыми газами/драгметаллами и обновлёнными ролями добывающих зданий.
- `issue #365`: исправлен `POST /buildings/resource` — добавлена синхронизация ресурсных рядов планеты перед пересчётом `regenRate`, чтобы сохранение запасов в `planet_resources` не ломалось при смене целевого добываемого ресурса.

### Docs
- Added Phase 3 combat regression evidence notes, including focused verification commands and guidance that combat migrations apply through `db:migrate`/`db:seed` without requiring a database drop.
- Добавлено правило для агентов: игровые тексты не должны содержать task-id, raw slug/id, внутренние названия полей, технические пояснения реализации или агентскую метаинформацию.
- Зафиксированы правила для агентов по ведению `CHANGELOG.md`: когда добавлять записи, как работать с `Unreleased`, как сохранять записи других агентов и какие данные нельзя заносить в журнал.
- Зафиксировано правило локального deploy fallback: `scripts/deploy-local.sh` нужно запускать из чистого `env -i` окружения с явным deploy env-файлом, чтобы локальные Docker/build переменные не утекали в staging/production.

## [2026-05-14]

### Added
- Обновлён `tasks/tasks.json` и добавлены новые задачи `P2.2-016`, `P2.2-017`, `P2.2-018`.
- Создана отдельная ветка для задач по кораблям/диспетчеризации: `task/P2.2-016-ship-metadata`.

### Docs
- Зафиксирован changelog-реестр для будущего ведения изменений.
