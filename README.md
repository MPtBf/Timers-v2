# Timers-v2

Минималистичный набор overlay-таймеров для Windows, работающих поверх любых приложений.
Написан на **Tauri 2 + Svelte 5 + TypeScript**. Является переносом оригинального
проекта на PyQt6 (`../Timers`) с сохранением внешнего вида и поведения.

## Как это работает

- **Хаб** (`hub`, обычное окно 300×380) создаёт и управляет таймерами, хранит сессию.
- **Окна-таймеры** (`timer-{id}`, 95×96, frameless, прозрачные) — маленькие
  always-on-top countdown'ы с прогресс-кольцом. Видны в панели задач и Alt-Tab.
- Закрытие хаба (✕) скрывает его; выход — через трей (или завершение процесса).

## Возможности

- **Оверлей поверх всего** — прозрачные окна поверх приложений.
- **Три режима взаимодействия** (таблица ниже) — окно прозрачно и клик-сквозь по умолчанию.
- **Овертайм** — при истечении таймер уходит в минус, окно поднимается наверх
  (HWND_TOPMOST), становится always-on-top и интерактивным, тик каждую секунду,
  вспышка каждые 5 секунд.
- **AFK-мьют** — при простое системы ≥ 60 с звук овертайма автоматически отключается
  (независимо от кнопки 🔊), возвращается при появлении активности.
- **Сессия** — все таймеры (включая идущие) автоматически восстанавливаются при запуске
  из `app_config_dir()/session.json`.
- **Панель таймера** — ввод минут, кнопки ▶ ⏸ ⏯ ⏹ 🔁, боковая колонка (✕ 🔊 📌 + drag-полоса).
- **Перетаскивание** — за drag-полосу справа (в интерактивном режиме, зажав Ctrl).
- **Скрытие из панели задач** нет — таймеры намеренно видны в taskbar/Alt-Tab, чтобы
  до них можно было добраться без хаба.

## Режимы взаимодействия

Окно-таймер опрашивается каждые 100 мс (положение курсора + состояние Ctrl/Shift через Win32).

| Условие                                   | Режим        | Прозрачность | Клики |
| ----------------------------------------- | ------------ | ------------ | ----- |
| Курсор вне окна / Ctrl не зажат            | `auto`       | 0.5          | сквозь |
| Курсор над окном + **Ctrl** зажат          | `interactive`| 1.0          | работают |
| Курсор над окном + **Shift** зажат         | `hidden`     | 0.0          | сквозь |
| Идёт овертайм (истёкший таймер)           | принудительно| 1.0          | работают |

> В овертайме окно также поднимается наверх и ставится **always-on-top**. После
> остановки таймера всё возвращается: always-on-top = состояние кнопки 📌, режим — обычный.

## Технологии

- **Frontend**: Svelte 5 (runes `$state`/`$derived`/`$props`/`$effect`), TypeScript, чистый CSS
- **Backend**: Rust + Tauri 2 (Win32 API: `WS_EX_TRANSPARENT`, `SetLayeredWindowAttributes`, `FlashWindowEx`, `PlaySoundW`, `SetWindowPos`, `GetAsyncKeyState`, `GetCursorPos`, `GetLastInputInfo`, DWM)
- **Сборка**: Vite + `@sveltejs/vite-plugin-svelte`
- **Тесты**: Vitest (`timer`, `ipc`, `interaction`, `session`, `windows`)

## Начало работы

Требования: Node.js ≥ 20, Rust toolchain, [Tauri prerequisites](https://tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri dev     # полный dev (Vite + Rust)
npm run dev           # только фронтенд в браузере
npm run tauri build   # production сборка
```

## Команды

| Команда                 | Описание                                   |
| ----------------------- | ------------------------------------------ |
| `npm run dev`           | Vite dev server (порт 1420)                |
| `npm run tauri dev`     | Полный dev: Vite + Rust + окно             |
| `npm run build`         | Сборка фронтенда только                    |
| `npm run tauri build`   | Production сборка с Rust                   |
| `npm run test`          | Vitest                                     |
| `npm run typecheck`     | svelte-check + TS                          |

## Структура проекта

```
src/
├── main.ts               # Точка входа: mount(App) + MCP-мост (dev only)
├── app.css               # Глобальные стили
├── constants.ts          # ВСЕ UI-константы и тайминги
├── App.svelte            # Диспетчер: label "hub" → Hub, "timer-*" → TimerOverlay
└── lib/
    ├── timer.svelte.ts   # TimerModel — чистая TS-логика таймера (колбэки), restore()
    ├── TimerWidget.svelte# Спинбокс + кольцо + время + кнопки; beep/flash/AFK овертайма
    ├── TimerOverlay.svelte# Chrome окна-таймера: опрос взаимодействия, снэпшоты, mute/pin
    ├── Hub.svelte        # Хаб: список, создание, broadcast, координатор сессии
    ├── session.ts        # TimerSnapshot/TimerStateReport + JSON serialize/parse
    ├── events.ts         # Имена событий (timer-snapshot, mute-all, …)
    ├── windows.ts        # Label-хелперы (hub vs timer-*, id parsing)
    ├── ipc.ts            # Типизированные обёртки над invoke()
    ├── interaction.ts    # Чистая логика режимов взаимодействия
    ├── TimerDisplay.svelte       # НЕ ИСПОЛЬЗУЕТСЯ (легаси)
    ├── CircularProgress.svelte   # НЕ ИСПОЛЬЗУЕТСЯ (легаси)
    └── __tests__/        # Юнит-тесты
src-tauri/
├── src/lib.rs            # Rust-команды + Win32 + трей + session (atomic write) + multi-window
├── src/main.rs           # Точка входа Rust
├── sounds/tick.wav       # Звук тика (встраивается include_bytes!)
├── tauri.conf.json       # Главное окно = hub (300x380, decorated); таймеры создаются на лету
└── capabilities/default.json  # Разрешения окон/команд (windows: ["hub", "timer-*"])
```

## Архитектура

- **Сессия**: хаб — источник истины. Окна-таймеры шлют снэпшоты
  (`timer-snapshot`: id, duration, remaining, state, soundOn, pinned, x/y/w/h)
  при каждом изменении, по drag-end, каждые 5 с и на beforeunload. Хаб дебаунс-пишет
  `session.json` (atomic: `.tmp` → `fs::rename`). Плохой/отсутствующий файл → `None`.
- **Создание/восстановление**: хаб вызывает `create_timer_window(snapshot)` (Rust кладёт
  снэпшот в pending-map); новое окно на mount берёт его через `get_timer_init()`
  и делает `TimerModel.restore(...)`. Ошибка создания → запись удаляется (защита от фантомов).
- **Broadcast**: hide/show/pin итерируют окна в Rust; `mute-all`/`pin-all` — события,
  которые слушают все таймеры (обновляют состояние и пере-репортят).
- **Выход**: трей «Выход» → `request-quit` → хаб сохраняет сессию → `quit_all`
  (destroy всех окон + `app.exit(0)`; destroy обходит hide-перехват хаба).
- **Single-instance**: повторный запуск фокусирует существующий хаб.

## Известные особенности (см. также AGENTS.md)

- **TypeScript 6.0.3 + svelte-check**: `npm run typecheck` показывает 10 ложных ошибок
  на runes в `TimerWidget.svelte` (`Cannot use 'state' as a store` и т.п.). Это не реальные
  баги — vitest проходит.
- **Z-order**: Windows поднимает все видимые окна процесса при активации одного из них.
  Клик по таймеру соседей не прячет.
- **Размер окна**: конфиг 95×96 иногда игнорируется окном — принудительно выставляется
  `win.setSize(new LogicalSize(95, 96))` в `TimerOverlay.svelte`.
- **Звук**: `tick.wav` встраивается в бинарник через `include_bytes!`. Замена файла
  требует пересборки Rust (HMR не подхватит).
- **MCP-плагин**: подключается только в debug (`main.ts`). Для работы на Windows патчится
  `client.js` в кеше npx (временный фикс, теряется при очистке кеша).

## Овертайм

- Остаток времени уходит в минус, отображается `-M:SS` красным (`OVERTIME_COLOR`).
- Кольцо остаётся на 100%, краснеет (`#e74c3c`).
- Звук: тик каждую секунду из `tick.wav` (если 🔊 включён и система не в AFK ≥ 60 с).
- Вспышка окна каждые 5 секунд (`flash_window`).
- Окно поднимается наверх (`HWND_TOPMOST`), always-on-top + интерактивное, пока идёт овертайм.
