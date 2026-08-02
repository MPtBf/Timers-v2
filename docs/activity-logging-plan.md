# Логирование дел + дашборд-календарь — дизайн и план

Постоянный справочник по фиче «логирование дел и оценка дня». Обновлять при изменении
решений. Краткая шпаргалка — в `AGENTS.md`.

## 1. Зафиксированные решения

| Решение | Значение |
|---|---|
| Шкала оценок | 0–100, два слайдера: **эффективность** и **польза** |
| Где ставятся оценки | на **дело** (Activity), один раз, по кнопке «Завершить дело» |
| Хранение | SQLite `activity.db` в `app_config_dir()` (рядом с `session.json`) |
| Автопауза при idle | включена по умолчанию, переключатель на таймере |
| Брейки/паузы на календаре | показывать серым |
| Число таймеров (v1) | **один** за раз. Кнопка создания второго недоступна |
| Рендер дашборда | единая лента дня (без наложений — их не бывает в v1) |
| Где живёт дашборд | окно `dashboard` в том же приложении Timers-v2 (НЕ отдельный проект/API) |
| Прозрачность блока | переключатель режима: эффективность / польза / среднее `(eff+use)/2` |
| Автопауза: порог idle | `AUTO_PAUSE_IDLE_MS = 120000` (2 мин), настраивается |

## 2. Суть (простая формулировка)

Дневник дня = полоса, размеченная по часам. Логирование = правила, когда рисовать
прямоугольник. Прямоугольники рисуются **в момент события**, а не в конце дня.

- «Дело» (Activity) — смысловая единица: имя + категория + теги. Может состоять из
  нескольких разорванных кусков времени (паузы, продолжения, срыв дедлайна).
- «Кусок» (Block) — отрезок времени на календаре. Или дело (`work`), или отсутствие
  дела (`break` — ручная пауза, `away` — автопауза по idle).
- Оценки ставятся один раз на всё дело и применяются ко всем его кускам.

## 3. Модель данных (SQLite, схема v1)

```sql
CREATE TABLE activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',             -- JSON array (для гранулярного анализа)
  parent_id INTEGER NULL,                      -- иерархия дел (ФАЗА 4, только схема)
  log_enabled INTEGER NOT NULL DEFAULT 1,      -- выкл = помидорки, ничего не пишем
  status TEXT NOT NULL DEFAULT 'active',       -- active | finished
  efficiency INTEGER NULL,                     -- 0–100, ставится при «Завершить дело»
  usefulness INTEGER NULL,                     -- 0–100, ставится при «Завершить дело»
  started_ms INTEGER NOT NULL,
  ended_ms INTEGER NULL
);

CREATE TABLE blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NULL,                    -- NULL = перерыв
  kind TEXT NOT NULL,                          -- work | break | away
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NULL,                         -- NULL = открыт (таймер идёт)
  timer_label TEXT NOT NULL                    -- владелец открытого блока (restore)
);
CREATE INDEX idx_blocks_start ON blocks(start_ms);
```

### Правила непротиворечивости (v1)
- В любой момент времени открыт **максимум один** work-блок (т.к. один таймер).
- Открытый блок — это `blocks WHERE timer_label = <label> AND end_ms IS NULL`.
- Окно оперирует только строками со своей меткой.
- `reconcile()` при старте приложения: закрыть брошенные открытые блоки (стенд ≥ N мин).

## 4. Механика событий (единственный таймер)

| Событие | Что пишется в БД |
|---|---|
| Старт таймера | ensure Activity (создать или «продолжить дело» из истории) → `INSERT work`, `end_ms=NULL` |
| Пауза | закрыть открытый work (`end_ms=now`) → `INSERT break`, `end_ms=NULL` |
| Резюме | закрыть break → `INSERT work`, `end_ms=NULL` |
| Стоп / закрытие окна / beforeunload | закрыть открытый блок. Дело **не** завершается, оценки не спрашиваются |
| Срыв дедлайна | таймер уходит в минус, БД не трогается; новый таймер → «продолжить дело» → тот же `activity_id` |
| Кнопка «Завершить дело» | закрыть открытые блоки, диалог 2×слайдера 0–100 → `activity_finish(id, eff, use)`, `status=finished` |
| Автопауза по idle | `getIdleTime() > AUTO_PAUSE_IDLE_MS` → как ручная пауза, но блок `away` |
| `log_enabled=false` | блоки не пишутся вообще, таймер работает как чистый |

## 5. Дашборд (единая лента дня)

- Окно `dashboard`, обычное (decorated), открывается из hub. Ветка в `App.svelte`.
- Запрос всех блоков за день, сортировка по `start_ms`.
- Цвет блока = категория (детерминированный hash → hue).
- Прозрачность ∝ выбранная метрика: переключатель «эффективность / польза / среднее
  `(eff+use)/2`». Блок без оценок (дело не завершено) — полная непрозрачность (нейтрально).
- Серые блоки `break`/`away` рисуются всегда (в v1 наложений нет).
- Клик по блоку → редактирование (имя/категория/теги/оценки/время), удаление → CRUD.
- Навигация по дням.

## 6. Фазы реализации

1. **Данные** — rusqlite (bundled), схема, миграция через `schema_version`, Rust-команды
   (см. ниже), TS-типы в `src/lib/activity.ts`, vitest-тесты.
2. **Окно таймера** — поля категория/дело/теги с автодополнением, чекбокс «логировать»,
   кнопка «продолжить дело», поток блоков, «Завершить дело» + слайдеры, автопауза по
   idle, restore по `timer_label` (привязка к делу + его имя/категория в полях),
   орфан-очистка.
   **Реализовано**: панели — отдельные всплывающие окна `task-*` / `finish-*` (см. §7);
   поток блоков идёт через `ActivityLogger.begin/pause/resume/stop/finish` +
   `logger-runner.executeOps`; авто-пауза по idle — `away`-блок, порог
   `AUTO_PAUSE_IDLE_MS`; restore — `activityGetOpenBlock(timerLabel)` на mount + снэпшот
   `activityId` как запасной вариант для остановленного, но не завершённого дела.
   Осталось: финальный прогон в приложении, «один таймер за раз» в hub.
3. **Дашборд** — окно, лента дня, цвета/прозрачность, навигация, редактирование.
4. **Будущее** (только заложено в схеме, НЕ реализовывать в v1):
   - `parent_id`: главное дело + подэтапы (несколько таймеров, вложенные полосы).
   - LLM-оценка дня (кнопка в дашборде; данные уже структурированы; backend не нужен).

## 7. Rust-команды (все через единый `Mutex<Connection>` в managed state)

Регистрировать в `invoke_handler` в `src-tauri/src/lib.rs`.

- `activity_init` (setup/миграция) — вызывать при старте приложения
- `activity_upsert(activity)` — создать/обновить дело
- `activity_open_block(timer_label, activity_id, kind, start_ms)`
- `activity_close_block(timer_label, end_ms)` — закрыть открытый блок по метке
- `activity_finish(activity_id, efficiency, usefulness, ended_ms)`
- `activity_update(...)` / `activity_delete_block(id)` / `activity_delete_activity(id)` — ручное редактирование
- `activity_query(from_ms, to_ms)` → блоки JOIN activities
- `activity_suggestions()` → история категорий/дел для автодополнения
- `activity_reconcile()` → закрытие брошенных открытых блоков
- `get_activity_db_path()` → путь для внешних инструментов/SQL-агентов
- `create_dashboard_window()` → окно дашборда
- `create_task_panel(timer_label, log_enabled, auto_pause, minutes)` → всплывающее окно
  задачи `task-{timerLabel}` рядом с таймером (`PANEL_GAP`)
- `create_finish_panel(timer_label, activity_id, activity_name)` → окно оценок
  `finish-{timerLabel}` (слайдеры 0–100)
- `get_panel_init()` → `PanelInit { timerLabel, logEnabled, autoPause, activityId,
  activityName, minutes }` (pending-карта, как `get_timer_init`)

## 8. Затрагиваемые файлы

- `src-tauri/Cargo.toml` — + `rusqlite` (features `bundled`)
- `src-tauri/src/lib.rs` — команды, state, `create_dashboard_window`, `create_task_panel`,
  `create_finish_panel`, `get_panel_init`
- `src-tauri/capabilities/default.json` — добавить `"dashboard"`, `"task-*"`, `"finish-*"`
  в `windows`
- `src/constants.ts` — `AUTO_PAUSE_IDLE_MS`, размеры дашборда/панелей, цвета брейков,
  маппинг оценка→opacity
- `src/lib/activity.ts` (+ `__tests__`) — типы по образцу `session.ts`
- `src/lib/ipc.ts`, `src/lib/events.ts` — обёртки invoke / новые события
- `src/App.svelte` — ветки `task-*` / `finish-*` / `dashboard`
- `src/lib/TimerWidget.svelte` — ActivityLogger (begin/start/pause/resume/stop/finish),
  external control (`timer-control.ts`), автопауза по idle (`idle-pause.ts`),
  restore по `timer_label` (`getOpenBlock`) + снапшот-`activityId`
- `src/lib/TaskPanelWindow.svelte` / `FinishPanelWindow.svelte` — окна-панели (280×205 /
  280×190), драйвят таймер событиями `task-start` / `task-finish` / `task-config` /
  `request-finish`
- `src/lib/logger-runner.ts` — `executeOps` (LogOp → БД, DI для тестов)
- `src/lib/timer-control.ts`, `src/lib/task-panel.ts` — payload-типы и чистый prefill
- `src/lib/Hub.svelte` — кнопка «Дашборд», блокировка второго таймера
- `src/lib/Dashboard.svelte` — новый компонент

## 9. Тесты

TDD: тесты пишутся до кода (edge-кейсы), затем код подгоняется под них.

- vitest: `src/lib/__tests__/activity.test.ts` — `parseTags`/`serializeTags`,
  `ratingMetric` (режимы eff/use/среднее), `buildDayLane` (сортировка, клиппинг,
  открытые блоки, отсев нулевых). Реализация — `src/lib/activity.ts`.
- Rust: `src-tauri/src/activity.rs` (`cargo test`, in-memory SQLite) — схема/миграция,
  инварианты блоков (один открытый на label, kind↔activity_id, end≥start), CRUD,
  `activity_query` (join, диапазоны, порядок), `reconcile`, валидация оценок.
  Команды `windows`-крейта по-прежнему не тестируются (runtime-зависимы).

## 10. Ограничения v1 (осознанные)

- Только один таймер за раз; кнопка создания второго недоступна. Модель БД это не
  запрещает (`timer_label`), но UI/дашборд рассчитаны на один.
- Наложений блоков в ленте не бывает; алгоритм стекинга не нужен.
- Иерархия дел и LLM — не реализуются, но схема к ним готова без миграций.
- При возврате к нескольким таймерам (future) принят рендер «единая лента с дедупом»:
  серый break скрывается, если в это время работал другой таймер; точное наложение двух
  work-блоков — стекинг в слоте. В v1 не требуется.
