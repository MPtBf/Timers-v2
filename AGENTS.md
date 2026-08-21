# AGENTS.md — Timers-v2 Development Rules

## Project
Timers-v2 — minimalist Windows overlay timer built with **Tauri 2 + Svelte 5 + TypeScript**.
Port of the original PyQt6 project (was at `C:\Users\ediko\PycharmProjects\Timers`).

A **hub** window (normal, decorated) creates and manages multiple tiny transparent
always-on-top timer overlay windows. Each timer window shows a countdown with a progress ring.

**Planned feature — логирование дел + дашборд-календарь**: полный дизайн, модель данных
(SQLite `activity.db`), механика событий и фазы в `docs/activity-logging-plan.md`. При
работе над этой фичей сначала читать тот документ. Ключевое: таймеров может быть несколько,
но открытое дело (work-блок/пауза) в каждый момент — максимум одно на всё приложение,
оценки 0–100 ставятся на дело по кнопке «Завершить дело», автопауза по idle вкл.

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
├── App.svelte                  # Dispatcher: hub → Hub, timer-* → TimerOverlay, task-*/finish-* → panels
└── lib/
    ├── timer.svelte.ts         # TimerModel — pure TS class, callbacks-based, restore()
    ├── TimerWidget.svelte      # Timer UI + ActivityLogger integration + idle auto-pause + external control
    ├── TimerOverlay.svelte     # Timer window chrome: polling, snapshot report, panel buttons, event listeners
    ├── Hub.svelte              # Hub UI: list, create, broadcast buttons, session coordinator
    ├── TaskPanel.svelte        # Presentational task form (category/name/tags/log/autopause/start/finish)
    ├── FinishPanel.svelte      # Presentational finish dialog (2 sliders 0–100 + save/cancel)
    ├── TaskPanelWindow.svelte  # task-* popup window: wires TaskPanel to DB + emits to timer
    ├── FinishPanelWindow.svelte# finish-* popup window: wires FinishPanel to timer via task-finish
    ├── session.ts              # TimerSnapshot/TimerStateReport types + JSON serialize/parse
    ├── activity.ts             # Activity/ActivityBlock/DayLane types + pure helpers (tags, ratingMetric, buildDayLane)
    ├── activity-logger.ts      # ActivityLogger — pure block-flow planner (LogOp[]), restore(), begin(), finish()
    ├── logger-runner.ts        # executeOps(ops, runner) + ipcLogRunner — maps LogOp → DB calls
    ├── timer-control.ts        # TimerControl + Start/Finish/Config/LogState payload types
    ├── idle-pause.ts           # shouldAutoPause pure predicate (idle threshold, overtime, state)
    ├── task-panel.ts           # computeTaskPrefill pure prefill logic for the task panel
    ├── events.ts               # Event name constants (timer-snapshot, task-start, task-finish, …)
    ├── windows.ts              # Label helpers (hub / timer-* / task-* / finish-*, id parsing)
    ├── format.ts               # formatClockTime (MM:SS)
    ├── TimerDisplay.svelte     # UNUSED text component (TimerWidget has inline span)
    ├── CircularProgress.svelte # UNUSED SVG ring (TimerWidget has inline SVG)
    ├── ipc.ts                  # Typed wrappers around invoke() for the Rust commands
    ├── interaction.ts          # Pure logic: computeInteractionMode + getInteractionAction
    └── __tests__/              # timer, ipc, interaction, session, windows, activity, logger, runner, idle, panel tests
src-tauri/
├── src/lib.rs                  # Rust commands + DWM + tray + session atomic write + multi-window + panel windows
├── src/main.rs                 # Rust entry point
├── sounds/tick.wav             # Beep sound (embedded via include_bytes!, needs Rust rebuild)
├── tauri.conf.json             # main window = hub (300x380, decorated); timer/panel windows created at runtime
├── capabilities/default.json   # windows: ["hub", "timer-*", "task-*", "finish-*"] (glob), window perms
└── Cargo.toml
```

> `TimerDisplay.svelte` and `CircularProgress.svelte` are legacy and NOT imported.
> Timer windows: label `timer-{id}`, 95×112, `decorations:false`, `transparent:true`,
> always-on-top only when `pinned` or overtime is active. Created from Rust via
> `create_timer_window`. Visible in taskbar and Alt-Tab (`skip_taskbar(false)`) so timers are
> reachable without the hub.
> **Panel windows**: label `task-{timerLabel}` / `finish-{timerLabel}`, 280×219 / 280×204
> (includes a 14px draggable top strip, `PANEL_DRAG_STRIP_HEIGHT`),
> `decorations:false`, `transparent:true`, `always_on_top:true`, `skip_taskbar:true`,
> positioned **above the timer, horizontally centered** (`panel_position`: centered over
> `timer-*`, clamped to the monitor; falls back below the timer when there's no room above).
> Created via `create_task_panel` / `create_finish_panel`; they fetch `PanelInit` through
> `get_panel_init` (pending map, same
> pattern as `get_timer_init`). Panels drive the timer window via Tauri events
> (`task-start`, `task-finish`, `task-config`, `request-finish`); ALL DB mutations flow
> through `TimerWidget`'s `ActivityLogger` + `logger-runner` (single source of truth).
> Each window is its own Svelte instance; `App.svelte` picks the view from `label`.

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
- **svelte-check false errors**: TypeScript ~6.0.3 misreads Svelte 5 runes
  (`Cannot use 'state' as a store`, etc.). 11 errors in `TimerWidget.svelte` are FALSE
  positives (variable named `state` + `$state` declarations); vitest passes.
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
- **`emit_to` is not strictly window-targeted in practice**: panel windows drive timers with
  `emitTo(timerLabel, …)`, but Tauri v2.11 delivers those events to listeners registered with
  `listen()` (target `Any`) in OTHER windows too — verified empirically (probe events targeted
  at timer-2 fired listeners in timer-3). Every panel→timer command payload must carry
  `timerLabel` and `TimerOverlay` must filter `e.payload.timerLabel !== win.label` before acting.
  Same applies to hub-targeted `timer-snapshot` (broadcast-y but arrives at hub). Global
  broadcasts (`mute-all`, `pin-all`) are intentionally unfiltered.
- **Float snapshot values break restore**: `TimerModel` remainingMs/durationMs accumulate float
  drift (e.g. `269894.6999…`). Rust `TimerSnapshot` deserializes into `i64` and rejects floats
  (`invalid type: floating point …, expected i64`), so restoring a *running* timer silently
  fails and the hub wipes the session via the remove-on-error path. Always round in
  `TimerWidget.reportNow()` and defensively in `parseSession()`. Edit-files-while-running HMR
  also fires the destroy-cleanup `logger.stop()`, closing open blocks mid-test.
- **CSS style interpolation**: do NOT use `{CONSTANT}` inside `<style>` blocks — svelte-check
  reports CSS parse errors and unused-import false positives. Use inline `style` + CSS custom
  properties (`--var`) on the root element instead (see `Hub.svelte`).
