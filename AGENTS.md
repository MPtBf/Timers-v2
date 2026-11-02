# AGENTS.md — Timers-v2 Development Rules

## Project
Timers-v2 — minimalist Windows overlay timer built with **Tauri 2 + Svelte 5 + TypeScript**.
Port of the original PyQt6 project (was at `C:\Users\ediko\PycharmProjects\Timers`).

A **hub** window (normal, decorated) creates and manages multiple tiny transparent
always-on-top timer overlay windows. Each timer window shows a countdown with a progress ring.

**Логирование дел + календарь-дашборд (v2.0, реализовано)**: модель данных (SQLite
`activity.db` — таблица `blocks`: `id, name, start_ms, end_ms`), механика событий и фазы —
в `docs/activity-logging-spec.md`. План реализации — в
`docs/activity-logging-implementation-plan.md`, правила отчётов по блокам —
в `docs/activity-report-rules.md`. При доработке сначала читать спецификацию, потом план.
Ключевое: таймеров может быть несколько, но открытое дело в каждый момент — максимум одно на
всё приложение. Блок только один тип: таймер активен + дело введено. При остановке/AFK/выходе —
блок закрывается, дело завершается. Никаких `break`/`away`, никаких `activities` + `blocks`,
никаких `timer_label`. Оценки эффективности/пользы — планы на будущее, в v2.0 не реализуются.

## Tech Stack
- **Frontend**: Svelte 5 (runes only: `$state`, `$derived`, `$props`, `$effect`), TypeScript, Vanilla CSS
- **Backend**: Rust via Tauri (Win32 API for click-through, opacity, flash, beep, DWM shadow, tray)
- **Build**: Vite + `@sveltejs/vite-plugin-svelte`
- **Tests**: Vitest (jsdom). Run `npm run test`

## Architecture (actual, keep in sync)

```
src/
├── main.ts                     # Entry: mount(App, {target}) + MCP bridge (dev only)
├── app.css                     # Global reset styles
├── constants.ts                # ALL UI constants (colors, sizes, TIMER/SESSION timings)
├── App.svelte                  # Dispatcher: hub → Hub, timer-* → TimerOverlay, dashboard → Dashboard
└── lib/
    ├── timer.svelte.ts         # TimerModel — pure TS class, callbacks-based, restore()
    ├── TimerWidget.svelte      # Timer UI + deal name field + ActivityLogger integration + idle auto-pause
    ├── TimerOverlay.svelte     # Timer window chrome: polling, snapshot report, event listeners
    ├── Hub.svelte              # Hub UI: list, create, broadcast buttons, dashboard button, session coordinator
    ├── Dashboard.svelte        # Week calendar window: hour grid, blocks, create/edit/delete popup
    ├── session.ts              # TimerSnapshot/TimerStateReport types + JSON serialize/parse
    ├── activity.ts             # Block type + pure helpers (buildDayLane, layoutBlockInDay, blockColor, activityDebounce)
    ├── activity-logger.ts      # ActivityLogger — pure block-flow planner (LogOp[]), restore(), begin(), stop(), switchTo()
    ├── logger-runner.ts        # executeOps(ops, runner) + ipcLogRunner — maps LogOp → DB calls
    ├── idle-pause.ts           # shouldAutoPause pure predicate (idle threshold, overtime, state)
    ├── events.ts               # Event name constants (timer-snapshot, blocks-changed, activity-owner, …)
    ├── windows.ts              # Label helpers (hub / timer-* / dashboard, id parsing)
    ├── format.ts               # formatClockTime (MM:SS)
    ├── TimerDisplay.svelte     # UNUSED text component (TimerWidget has inline span)
    ├── CircularProgress.svelte # UNUSED SVG ring (TimerWidget has inline SVG)
    ├── ipc.ts                  # Typed wrappers around invoke() for the Rust commands
    ├── interaction.ts          # Pure logic: computeInteractionMode + getInteractionAction
    └── __tests__/              # timer, ipc, interaction, session, windows, activity, logger, runner, idle tests
src-tauri/
├── src/lib.rs                  # Rust commands + DWM + tray + session atomic write + multi-window + dashboard window
├── src/main.rs                 # Rust entry point
├── sounds/tick.wav             # Beep sound (embedded via include_bytes!, needs Rust rebuild)
├── tauri.conf.json             # main window = hub (300x380, decorated); timer/dashboard windows created at runtime
├── capabilities/default.json   # windows: ["hub", "timer-*", "dashboard"] (glob), window perms
└── Cargo.toml
```

> `TimerDisplay.svelte` and `CircularProgress.svelte` are legacy and NOT imported.
> Timer windows: label `timer-{id}`, 95×112, `decorations:false`, `transparent:true`,
> always-on-top only when `pinned` or overtime is active. Created from Rust via
> `create_timer_window`. Visible in taskbar and Alt-Tab (`skip_taskbar(false)`) so timers are
> reachable without the hub.
> **Dashboard window**: label `dashboard`, 960×600, `decorations:true`, `resizable:true`,
> `skip_taskbar:false`, centered. Created via `create_dashboard_window`; if it already exists it
> is shown and focused instead of duplicated. Queries the displayed week through `block_query`,
> re-fetches on the `blocks-changed` event, and edits rows via `block_open` / `block_update` /
> `block_delete` (Rust emits `blocks-changed` after every mutation). Opened from the hub header
> (📅 button).
> **Deal name / blocks**: the name field lives in `TimerWidget`. Typing debounces
> `ACTIVITY_DEBOUNCE_MS` and then `ActivityLogger.switchTo()` closes the open block and opens a
> new one; start/pause/resume/stop close or reopen it, AFK auto-pause closes it and resumes the
> same name on return. Only one window may log a deal at a time: the owner broadcasts
> `activity-owner { timerLabel, name }` and other timer windows lock their name input while
> `name` is non-null. Timer-window DB mutations flow through `ActivityLogger` + `logger-runner`
> (single source of truth); the dashboard writes rows directly.
> **Блоки**: таблица `blocks` (`id, name, start_ms, end_ms`) — только work, без `activity_id`,
> `kind`, `timer_label`. Открытых блоков максимум один глобально. Стоп/AFK/выход = закрыть блок.
> `reconcile()` при старте **удаляет** брошенные открытые блоки (не проставляет `end_ms`,
> иначе на календаре появится блок за ночь/день вылета).
> Спецификация: `docs/activity-logging-spec.md`. План: `docs/activity-logging-implementation-plan.md`.

## Multi-window / session model
- Hub is the source of truth for persistence; timer windows report state to it.
- **Snapshot flow**: each timer window emits `timer-snapshot` (id, duration, remaining,
  state, soundOn, pinned, x/y/w/h) to the hub: on every state change, on `onMoved`
  (drag end), throttled every `SESSION.snapshotIntervalMs` (5s) while running, and on
  `beforeunload`. Hub upserts into `timers` and debounce-writes `session.json`
  (`SESSION.saveDebounceMs`, 300ms).
- **Create/restore**: hub invokes `create_timer_window(snapshot)` (Rust stores it in a
  pending map); the new window's frontend calls `get_timer_init()` on mount and restores
  `TimerModel.restore(durationMs, remainingMs, state)`.
- **Persistence**: `app_config_dir()/session.json`, written atomically by `save_session`
  (write `session.json.tmp` → `fs::rename`). `load_session` returns `None` on missing/bad file.
- **Broadcast**: hide/show/pin iterate windows in Rust; `mute-all`/`pin-all` are events
  that each timer window listens to (updates its state + re-reports).
- **Close/quit**: hub X = hide (Rust intercepts CloseRequested on "hub"). Tray "Выход"
  emits `request-quit` → hub does final `save_session` → `quit_all` (destroy + exit).
  `quit_all` uses `destroy()` to bypass the hub hide-interception.
- **Single instance**: `tauri-plugin-single-instance` focuses the existing hub on relaunch.
- **Blocks**: the SQLite store is opened once in `setup()` (managed `BlocksDb`), migrated to
  schema v2 there and reconciled before the hub appears. Timer windows own block writes
  (`block_open` / `block_close` through `ActivityLogger`); the dashboard independently reads the
  displayed week and receives `blocks-changed` after every mutation from Rust.

## Rules (MUST follow)

### 1. No hardcoded values in components
- ALL colors, sizes, durations, font stacks → `src/constants.ts`
- Import and reference constants by name
- Do NOT use `{CONSTANTS.xyz}` inside `<style>` blocks (svelte-check CSS errors + unused-import
  false positives). Use inline `style` attributes and CSS custom properties (`--var`) on the
  root element instead (see `Hub.svelte`).
- (New code should follow this; some legacy inline values exist in `TimerWidget`/`TimerOverlay` styles.)

### 2. All state/effects use Svelte 5 runes
- `$state()` for reactive variables, `$derived()` for computed values
- `$props()` for component props, `$effect()` for side effects (incl. cleanup)
- Do NOT use `$:`, `onMount`, `onDestroy`, `createEventDispatcher`

### 3. TimerModel is a plain TypeScript class
- No Svelte dependencies; callbacks-based via `timer.on({...})`
- States: `"stopped" | "running" | "paused"`; `isOvertime` when `remainingMs < 0`
- Instantiated in `TimerWidget.svelte` via `$state(new TimerModel())`
- `setDuration`/`start` only work from `"stopped"` state
- `restore(durationMs, remainingMs, state)` restores a snapshot mid-flight; sets
  `_hasFinished = remainingMs <= 0` so `onFinished` won't re-fire for restored overtime.

### 4. Git commits
- Commit after each logical phase, conventional format: `type: message`
- Types: `init`, `feat`, `fix`, `refactor`, `docs`, `chore`
- One concern per commit

### 5. Tauri commands
- Rust commands must be added to `invoke_handler` in `lib.rs`
- Use `#[tauri::command]`; window-specific commands take `window: tauri::WebviewWindow`
- **Permissions**: window-mutating JS APIs (`startDragging`, `setSize`, `close`,
  `setAlwaysOnTop`) require explicit permissions in `capabilities/default.json`
  (`core:window:default` only covers read-only ops). Capability `windows` supports
  glob patterns (`["hub", "timer-*"]`).
- `include_bytes!` assets (e.g. `sounds/tick.wav`) need a Rust rebuild to change.

### 6. UI consistency
- Buttons: 18px (side column) / 18px tall control buttons, dark gray `#555555`
- Dark theme from `constants.ts` (panel `#222222`, border `#3a3a3a`)
- Spinbox is never disabled (value only applies on restart)
- Ring stroke transition: `33ms linear` (matches `TIMER.tickIntervalMs`)

## Commands
- `npm run dev` — Vite dev server only
- `npm run tauri dev` — Full Tauri dev (Vite + Rust); port 1420 (kill first if busy)
- `npm run build` — Build frontend only
- `npm run tauri build` — Production build with Rust
- `npm run test` — Vitest
- `npm run typecheck` — svelte-check + TS (see Gotchas)

## Interaction model (TimerOverlay polls every 100ms)
Rust provides `get_modifier_state` (Ctrl/Shift via `GetAsyncKeyState`) and
`get_cursor_pos` (`GetCursorPos`). The timer window compares cursor to
`outerPosition`/`outerSize`.

| Condition                 | Mode         | opacity | click-through |
| ------------------------- | ------------ | ------- | ------------- |
| default                   | `auto`       | 0.5     | on            |
| Ctrl + mouse over window  | `interactive`| 1.0     | off           |
| Shift + mouse over        | `hidden`     | 0.0     | on            |
| overtimeActive            | forced       | 1.0     | off           |

- Pure mode logic lives in `src/lib/interaction.ts` (opacity + clickThrough values).
- Overtime **overrides** all modes: `TimerOverlay.handleOvertimeChange(true)` raises the window
  to the top (`raise_window`, HWND_TOPMOST) + always-on-top + interactive + opacity 1.0 +
  click-through off; `false` reverts to `pinned` and normal polling. The window stays
  topmost/interactive/opaque until the timer is stopped.
- Drag strip works via `getCurrentWindow().startDragging()` on mousedown (needs
  `core:window:allow-start-dragging` permission and interactive mode = Ctrl held).

## Overtime behavior
- `TimerModel._hasFinished` fires once when remaining hits 0; remaining goes negative.
- `TimerWidget.startOvertime()`: beep each `TIMER.overtimeBeepIntervalMs` (1s, respects
  `soundOn` AND the AFK gate via `maybeBeep()`), flash each `TIMER.flashIntervalMs` (5s), then
  `onOvertimeChange?.(true)` → window raised to top, topmost, opaque, interactive.
- Display: `-M:SS` in red (`OVERTIME_COLOR` `#e74c3c`); ring pinned at 100%, red.
- On stop/restart: `onOvertimeChange?.(false)` → window reverts (pinned state + polling).
- Ring SVG (in `TimerWidget`): `viewBox="0 0 120 120"`, circles `cx=60 cy=60 r=85`,
  `stroke-width=54`, progress via `stroke-dasharray/offset = 2π·85`.

## Gotchas
- **svelte-check**: `npm run typecheck` currently reports **0 errors** and 6 warnings, all in
  `Dashboard.svelte` (`a11y_no_static_element_interactions` / `a11y_click_events_have_key_events`
  on clickable day cells, blocks and the popup backdrop). Vitest passes.
- **Window size**: timer windows created wider/taller than 95×112. Fixed by
  `win.setSize(new LogicalSize(95, 112))` in `TimerOverlay.svelte` `$effect`.
- **Sound**: `tick.wav` embedded via `include_bytes!` + `PlaySoundW(SND_MEMORY|SND_ASYNC)`.
  Replacing the file requires a Rust rebuild.
- **MCP plugin**: dev-only, socket `\\.\pipe\tmp\tauri-mcp.sock`. On Windows it needs a
  temporary patch to `client.js` in the npx cache (lost on cache clear).
- **Transparent window**: set `WS_EX_LAYERED` + `WS_EX_TRANSPARENT` (click-through) +
  `SetLayeredWindowAttributes`; `SetWindowPos` (None + `SWP_NOZORDER` + `SWP_FRAMECHANGED`) is
  called ONLY when the `WS_EX_TRANSPARENT` flag changes — never `HWND_TOP`, or the 100ms
  polling would keep raising timer windows above everything. DWM shadow removed per timer
  window via `apply_dwm` command on mount
  (`DWMWA_NCRENDERING_POLICY=2`, `DWMWA_ALLOW_NCPAINT=0`).
- **Z-order / taskbar activation**: Windows raises ALL visible windows of a process when one
  is activated from the taskbar/Alt-Tab. Timer focus does NOT lower the others — clicking a
  timer must not hide its neighbors (use Ctrl-held interaction mode to click).
- **`apply_window_style` must not touch z-order**: it calls `SetWindowPos(None, …
  SWP_NOZORDER | SWP_FRAMECHANGED)` only when the `WS_EX_TRANSPARENT` flag changes (nudge
  flag) and runs only on real opacity/click-through changes, never with `HWND_TOP`. A
  `HWND_TOP` here would raise every timer above everything every 100ms (pollInteraction).
  `raise_window` (HWND_TOPMOST) is the only deliberate z-order raise (overtime).
- **AFK mute**: `get_idle_time` (Rust, `GetLastInputInfo`+`GetTickCount`, `wrapping_sub`)
  returns ms since last system input. `TimerWidget.maybeBeep()` skips `beep_system` when
  idle ≥ `TIMER.afkMuteMs` (60s) — independent of the `soundOn` button. Re-arms automatically
  when the user returns.
- **`emit` is not strictly window-targeted in practice**: Tauri v2.11 delivers `emit` /
  `emitTo` payloads to listeners registered with `listen()` (target `Any`) in ALL windows —
  verified empirically (probe events targeted at timer-2 fired listeners in timer-3). So
  `TimerWidget` broadcasts `activity-owner` with `timerLabel` and ignores its own message, and
  any new cross-window payload must carry `timerLabel` and be filtered on the receiving side.
  `timer-snapshot` is hub-targeted but also broadcast-y. Global broadcasts (`mute-all`,
  `pin-all`), `blocks-changed` and `request-quit` are intentionally unfiltered.
- **Float snapshot values break restore**: `TimerModel` remainingMs/durationMs accumulate float
  drift (e.g. `269894.6999…`). Rust `TimerSnapshot` deserializes into `i64` and rejects floats
  (`invalid type: floating point …, expected i64`), so restoring a *running* timer silently
  fails and the hub wipes the session via the remove-on-error path. Always round in
  `TimerWidget.reportNow()` and defensively in `parseSession()`. Edit-files-while-running HMR
  also fires the destroy-cleanup `logger.stop()`, closing open blocks mid-test.
- **CSS style interpolation**: do NOT use `{CONSTANT}` inside `<style>` blocks — svelte-check
  reports CSS parse errors and unused-import false positives. Use inline `style` + CSS custom
  properties (`--var`) on the root element instead (see `Hub.svelte`).
