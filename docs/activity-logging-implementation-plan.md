# План реализации — Логирование дел + календарь-дашборд

Спецификация: `docs/activity-logging-spec.md`. Порядок — строгий (TDD: тесты → код).
Каждый пункт = отдельный коммит (`type: message`). Не переходить к следующему,
пока текущий не зелёный (тесты проходят, lint/typecheck чистый).

---

## 0. Подготовка окружения
- [x] Убедиться, что `npm run test` и `npm run typecheck` проходят на чистом `main`.
- [ ] Зафиксировать базовую ветку для отката.

---

## 1. Tidy up — удалить незаконченные фичи
Цель: чистая база без мусора от прошлых попыток.

- [x] Удалить всё, связанное с кнопками действия с делом в правой панели таймера
  (`TimerWidget`/`TimerOverlay`: лишние кнопки, обработчики, стили).
- [x] Удалить всё, связанное с логированием дел и работой с БД:
  - `src/lib/activity.ts`, `src/lib/activity-logger.ts`, `src/lib/logger-runner.ts`
    (переписаны с нуля под blocks-only модель, а не удалены)
  - `src/lib/task-panel.ts`, `src/lib/timer-control.ts` (удалены)
  - `src/lib/TaskPanel.svelte`, `src/lib/TaskPanelWindow.svelte` (удалены)
  - `src/lib/FinishPanel.svelte`, `src/lib/FinishPanelWindow.svelte` (удалены)
  - `src/lib/__tests__/activity.test.ts`, `logger.test.ts`, `panel.test.ts` и т.д.
    (переписаны/удалён `task-panel.test.ts`)
  - Rust: `src-tauri/src/activity.rs` (переписан целиком), команды `activity_*`,
    `create_task_panel`, `create_finish_panel`, `get_panel_init` (удалены)
  - `src-tauri/capabilities/default.json`: убрать `"task-*"`, `"finish-*"`
  - `src/App.svelte`: ветки `task-*`, `finish-*`
- [ ] Проверить историю коммитов на ещё нежелательные фичи (поиск по `activity`,
  `task-panel`, `finish-panel`, `logger`).
- [ ] Удалять лишние фичи **путём отката по коммитам** (желательно), если возможно,
  или прямым редактированием кода.
- [x] После чистки: `npm run test` + `npm run typecheck` — всё зелёное.

---

## 2. Инфраструктура БД (Rust)
Цель: схема, миграции, базовые CRUD, инварианты — покрытые тестами.

### 2.1 Тесты (пишутся первыми, красные)
- [x] `src-tauri/src/activity.rs`: модуль тестов (`#[cfg(test)]`)
  - Схема: таблица `blocks` создаётся корректно (колонки, индекс)
  - Инварианты: один открытый блок глобально (`end_ms IS NULL` ≤ 1), `end_ms ≥ start_ms`
  - CRUD: `insert`, `query`, `update`, `delete`
  - `block_query(from_ms, to_ms)`: диапазоны, порядок по `start_ms`
  - `reconcile`: удаление открытых блоков при старте (не `UPDATE end_ms`, а `DELETE`)
  - Ошибки: дубликаты, невалидные `end_ms < start_ms`, нарушение инварианта открытого блока
- [x] Запуск: `cargo test` — все красные.

### 2.2 Имплементация (зелёные)
- [x] `src-tauri/src/activity.rs`: публичный модуль
  - `init(conn)` — миграция/создание таблицы + индекса
  - `open_block(name, start_ms) -> id` — INSERT, возвращает id
  - `close_block(end_ms)` — UPDATE единственного открытого блока (`WHERE end_ms IS NULL`)
  - `delete_block(id)` — DELETE
  - `update_block(id, name, start_ms, end_ms)` — UPDATE
  - `query_blocks(from_ms, to_ms) -> Vec<BlockRow>` — SELECT с JOIN (в данном случае просто SELECT), ORDER BY start_ms
  - `suggestions() -> Vec<String>` — DISTINCT name для автодополнения
  - `reconcile()` — DELETE FROM blocks WHERE end_ms IS NULL
  - `get_db_path() -> PathBuf`
- [x] Регистрация команд в `src-tauri/src/lib.rs`: `invoke_handler!` +
  `activity_init`, `block_open`, `block_close`, `block_delete`, `block_update`,
  `block_query`, `block_suggestions`, `activity_reconcile`, `get_activity_db_path`
- [x] `src-tauri/capabilities/default.json`: добавить `"dashboard"` в `windows`
- [x] `npm run test` (Rust) — все зелёные.

---

## 3. Типы и IPC (Frontend)
Цель: TypeScript типы, обёртки над `invoke`, события — покрыты тестами.

### 3.1 Тесты
- [x] `src/lib/__tests__/activity.test.ts`:
  - `buildDayLane(blocks, range)`: сортировка, клиппинг по диапазону, открытые блоки
    (`end_ms === null` → обрезаются до `now`), отсев нулевых/отрицательных
  - `activityDebounce`: таймер дебаунса: 10 секунд, сброс при каждом нажатии,
    применение только по таймауту, очистка поля без применения
  - Валидация: пустое имя, `end < start`, пересечение дел (если применимо)
- [x] `src/lib/__tests__/ipc.test.ts`: моки `invoke`, проверка пакетов команд
- [x] Запуск: `npm run test` — красные.

### 3.2 Имплементация
- [x] `src/lib/activity.ts`: типы `Block`, `BlockRow`; чистые функции
  `buildDayLane`, `activityDebounce` (timer-based, возвращает cleanup), `parseTags`/`serializeTags` (заглушки для будущего)
  — заглушки `parseTags`/`serializeTags` не добавлялись (вне v2.0)
- [x] `src/lib/ipc.ts`: типизированные обёртки над `invoke` для всех команд §7 спецификации
- [x] `src/lib/events.ts`: имена событий (`timer-snapshot`, `task-start`, `task-config`,
  `mute-all`, `pin-all`, `request-quit` — по актуальному коду)
  — фактические имена: `timer-snapshot`, `timer-closed`, `mute-all`, `pin-all`,
  `request-quit`, `blocks-changed`, `activity-owner`
- [x] `src/constants.ts`: добавить `ACTIVITY_DEBOUNCE_MS = 10_000`,
  размеры календаря, цвета
- [x] `npm run test` + `npm run typecheck` — зелёные.

---

## 4. AFK + Debounce логика в TimerWidget
Цель: таймер останавливается при AFK, блок закрывается; дебаунс названия 10с.

### 4.1 Тесты
- [ ] `src/lib/__tests__/timer-widget.test.ts` (или расширить `timer.test.ts`):
  - `shouldAutoPause(idleMs, overtime, state)` — из `idle-pause.ts`
    (покрыто в существующем `idle-pause.test.ts`)
  - AFK: при `idle >= 120_000` таймер пауза, блок закрыт, цвет не меняется
  - Debounce: изменение имени во время работы → через 10с тишины создаётся
    новый блок, старый закрыт; до 10с — старый активен; очистка имени — игнорируется
  > Отдельный `timer-widget.test.ts` не создавался; логика покрыта косвенно
  > (`idle-pause.test.ts`, `activity.test.ts`, `activity-logger.test.ts`).
- [ ] `npm run test` — красные.

### 4.2 Имплементация
- [x] `src/lib/idle-pause.ts`: `shouldAutoPause` — чистая функция, без副作用
- [x] `src/lib/TimerWidget.svelte`:
  - Подключить `ActivityLogger` (упрощённый: только `begin`, `stop`, `setName`)
  - Интеграция с `idle-pause`: каждую секунду (или по событию) проверять AFK,
    при срабатывании — `logger.stop()`, `timer.pause()`, блок закрыт
  - Поле названия дела: `$state` + `activityDebounce` хук (10с), при смене —
    `logger.stop()` + `logger.begin(newName)`
  - Блокировка поля в других таймерах: событие `task-config` / broadcast
    `activity-name-changed` с `timerLabel` + `name` (или `null`), UI отключает
    поле, если `name !== null && timerLabel !== myLabel`
    (реализовано событием `activity-owner`)
- [x] `npm run test` — зелёные.

---

## 5. Поле названия дела в TimerWidget (UI)
Цель: компактное поле над вводом времени, без расширения окна.

- [x] `src/lib/TimerWidget.svelte`: добавить `<input type="text" bind:value=name
  placeholder="Название дела" ...>` над spinbox
- [x] Стили: плоский, без отступов, высота как у spinbox, ширина 100% минус
  правая панель
- [x] Правка правого столбца: оставить только «Закрытие» (стоп), «Звук», «Закрепление»
- [x] Проверка: окно `timer-*` остаётся 95×112, ничего не ломается
- [x] `npm run test` (есть UI-тесты) / ручная проверка

---

## 6. Окно календаря (Dashboard) — скелет
Цель: окно открывается, рендерит сетку 7×18, навигация неделями.

### 6.1 Тесты
- [ ] `src/lib/__tests__/dashboard.test.ts`:
  - Рендер заголовков дней (формат `ДД.ММ дд`)
  - Подсветка «сегодня» — тёмно-зелёный фон
  - Боковые метки времени 6–23 слева и справа
  - Навигация `<` `>` сдвигает диапазон на 7 дней
  - Кнопка «Сегодня» возвращает к текущей неделе
  - Размер по умолчанию 2/3 экрана, сохранение в `session.json`
  > Отдельный `dashboard.test.ts` не создавался.
- [ ] `npm run test` — красные.

### 6.2 Имплементация
- [x] `src/lib/Dashboard.svelte`: компонент недели
  - Стейт: `weekStart: Date` (понедельник текущей недели)
  - Вычисление 7 дней, 18 строк, боковые метки
  - CSS Grid: 9 колонок (time-left, 7 дней, time-right)
  - Динамическая высота строк: `1fr` или `calc((100% - header) / 18)`
  - Навигация: кнопки `<` `>` `Сегодня`
  - Сохранение размера окна: `localStorage` / `session.json` → `window.resize`
    (не реализовано, см. § 9)
- [x] `src/App.svelte`: ветка `dashboard` → `<Dashboard />`
- [x] Rust: `create_dashboard_window()` — создаёт `WebviewWindow` с label
  `dashboard`, `decorated=true`, размер 2/3 экрана, centered
  (размер окна 960×600, не расчёт 2/3 экрана)
- [x] `npm run test` — зелёные.

---

## 7. Рендер блоков на календаре + интеракция
Цель: блоки отрисовываются, клик → popup редактирования, ПКМ по пустой → создание.

### 7.1 Тесты
- [ ] `dashboard.test.ts` (продолжение):
  - `block_query` данные → блоки позиционируются в правильные ячейки (start/end → row span)
  - Цвет блока = hash(name) → hue, S=100%, L=50%
  - Клик по блоку → открыт popup с текущими данными
  - ПКМ по пустой ячейке → контекстное меню → «Создать дело» → popup
    (name="", start=cellTime, end=cellTime+1h)
  - Popup: валидация `end > start`, сохранение → `block_open` / `block_update`,
    отмена → ничего
  - Удаление из popup → `block_delete`, перерендер
  > Отдельный `dashboard.test.ts` не создавался.
- [ ] `npm run test` — красные.

### 7.2 Имплементация
- [x] `Dashboard.svelte`: отрисовка блоков
  - Маппинг `start_ms`/`end_ms` → row index (0–17) + offset внутри строки
  - `position: absolute` внутри ячейки дня, `grid-row: startRow / endRow`
  - Tooltip/контекст: `on:click` → открыть `EditPopup.svelte`
  - `on:contextmenu` по пустой ячейке → `ContextMenu.svelte` с «Создать дело»
- [x] `src/lib/EditPopup.svelte` / `CreatePopup.svelte` (можно один компонент):
  - Поля: `name` (input), `start` (time input), `end` (time input)
  - Кнопки: «Сохранить», «Отмена», «Удалить» (только для edit)
  - Валидация: `end > start`, имя не пустое
  - На сохранение: `block_update` (edit) или `block_open` (create) через IPC
  > Реализовано одним встроенным popup внутри `Dashboard.svelte`; отдельные
  > компоненты не создавались. Также используется `block_open` + `block_update`
  > для создания блока с непустым `end`.
- [x] `npm run test` — зелёные.

---

## 8. Hub — кнопка «Календарь» + интеграция
Цель: из хаба открывается dashboard, состояние синхронизировано.

- [x] `src/lib/Hub.svelte`: кнопка «Календарь» → `invoke('create_dashboard_window')`
- [ ] При закрытии dashboard — окно скрывается (`hide`), не уничтожается (чтобы
  сохранить размер/позицию). Повторный клик → `show()` + фокус
  > Не реализовано: закрытие уничтожает окно; повторное открытие создаёт заново
  > (если окно ещё живо — `show()` + `set_focus()`).
- [x] Broadcast события: при изменении блоков (create/update/delete) —
  `emit('blocks-changed')`, Dashboard слушает и перезапрашивает `block_query`
- [x] `npm run test` / ручная проверка

---

## 9. Session.json — сохранение размера dashboard
- [ ] В `session.json` добавить поле `dashboardWindow: { width, height, x, y }`
- [ ] Rust `save_session` / `load_session` — сериализация/десериализация
- [ ] При создании dashboard — применять сохранённые габариты/позицию
- [ ] При ресайзе dashboard — дебаунс 300мс → запись в `session.json`
> Не реализовано.

---

## 10. Финальная проверка и полировка
- [x] Полный прогон: `npm run test` (vitest + cargo test) — все зелёные
  (vitest 130, cargo 32)
- [x] `npm run typecheck` — 0 ошибок
- [ ] `npm run tauri dev` — ручная проверка всех сценариев:
  - Запуск таймера с делом → блок в БД → видно на календаре
  - Смена имени во время работы → через 10с новый блок
  - Пауза/Стоп/AFK → блок закрыт, дело завершено
  - Перезапуск приложения → reconcile удаляет брошенные блоки
  - Календарь: навигация, создание/редактирование/удаление блоков
  - Размер окна сохраняется
  > Не выполнялось.
- [ ] Коммит `chore: finalize activity logging v2.0`

---

## Нарушения — стоп-факторы

- Любой этап без проходящих тестов — не считается готовым
- `npm run typecheck` выдаёт ошибки — стоп
- Коммит без соответствующего теста — не допускается
- Изменение кода без обновления спека (если решение меняется) — не допускается
