# AGENTS.md — Timers-v2 Development Rules

## Project
Timers-v2 — minimalist Windows overlay timer built with **Tauri 2 + Svelte 5 + TypeScript**.
Port of the original PyQt6 project (was at `C:\Users\ediko\PycharmProjects\Timers`).

A **hub** window (normal, decorated) creates and manages multiple tiny transparent
always-on-top timer overlay windows. Each timer window shows a countdown with a progress ring.

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
├── App.svelte                  # Dispatcher: window label "hub" → Hub, "timer-*" → TimerOverlay
└── lib/
    ├── timer.svelte.ts         # TimerModel — pure TS class, callbacks-based, restore()
    ├── TimerWidget.svelte      # Timer UI: spinbox + inline ring SVG + time + buttons + state report
    ├── TimerOverlay.svelte     # Timer window chrome: polling, snapshot report, mute/pin listeners
    ├── Hub.svelte              # Hub UI: list, create, broadcast buttons, session coordinator
    ├── session.ts              # TimerSnapshot/TimerStateReport types + JSON serialize/parse
    ├── events.ts               # Event name constants (timer-snapshot, mute-all, …)
    ├── windows.ts              # Label helpers (hub vs timer-*, id parsing)
    ├── format.ts               # formatClockTime (MM:SS)
    ├── TimerDisplay.svelte     # UNUSED text component (TimerWidget has inline span)
    ├── CircularProgress.svelte # UNUSED SVG ring (TimerWidget has inline SVG)
    ├── ipc.ts                  # Typed wrappers around invoke() for the Rust commands
    ├── interaction.ts          # Pure logic: computeInteractionMode + getInteractionAction
    └── __tests__/              # timer, ipc, interaction, session, windows tests
src-tauri/
├── src/lib.rs                  # Rust commands + DWM + tray + session atomic write + multi-window
├── src/main.rs                 # Rust entry point
├── sounds/tick.wav             # Beep sound (embedded via include_bytes!, needs Rust rebuild)
├── tauri.conf.json             # main window = hub (300x380, decorated); timer windows created at runtime
├── capabilities/default.json   # windows: ["hub", "timer-*"] (glob), window perms
└── Cargo.toml
```

> `TimerDisplay.svelte` and `CircularProgress.svelte` are legacy and NOT imported.
> Timer windows: label `timer-{id}`, 95×96, `decorations:false`, `transparent:true`,
> always-on-top only when `pinned` or overtime is active. Created from Rust via
> `create_timer_window`. Visible in taskbar and Alt-Tab (`skip_taskbar(false)`) so timers are
> reachable without the hub.
> Each timer window is its own Svelte instance; `App.svelte` picks the view from `label`.

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
  (`Cannot use 'state' as a store`, etc.). 10 errors in `TimerWidget.svelte` are FALSE
  positives (variable named `state` + `$state` declarations); vitest passes.
- **Window width**: timer windows created wider than 95×96. Fixed by
  `win.setSize(new LogicalSize(95, 96))` in `TimerOverlay.svelte` `$effect`.
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
  is activated from the taskbar/Alt-Tab. Fix: only the hub lowers all timers
  (`lower_timers_except("hub")`) via `SetWindowPos(HWND_BOTTOM)` on `Focused(true)`. Timer
  focus does NOT lower the others — clicking a timer must not hide its neighbors (use
  Ctrl-held interaction mode to click). Freshly created windows are protected by a 2s
  birth-time grace (`BirthTimes`, `BIRTH_GRACE_MS`).
- **`apply_window_style` must not touch z-order**: it calls `SetWindowPos(None, …
  SWP_NOZORDER | SWP_FRAMECHANGED)` only when the `WS_EX_TRANSPARENT` flag changes (nudge
  flag) and runs only on real opacity/click-through changes, never with `HWND_TOP`. A
  `HWND_TOP` here would raise every timer above everything every 100ms (pollInteraction).
  `raise_window` (HWND_TOPMOST) is the only deliberate z-order raise (overtime).
- **AFK mute**: `get_idle_time` (Rust, `GetLastInputInfo`+`GetTickCount`, `wrapping_sub`)
  returns ms since last system input. `TimerWidget.maybeBeep()` skips `beep_system` when
  idle ≥ `TIMER.afkMuteMs` (60s) — independent of the `soundOn` button. Re-arms automatically
  when the user returns.
- **CSS style interpolation**: do NOT use `{CONSTANT}` inside `<style>` blocks — svelte-check
  reports CSS parse errors and unused-import false positives. Use inline `style` + CSS custom
  properties (`--var`) on the root element instead (see `Hub.svelte`).
