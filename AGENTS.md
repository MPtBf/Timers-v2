# AGENTS.md — Timers-v2 Development Rules

## Project
Timers-v2 — minimalist overlay timer built with **Tauri 2.0 + Svelte 5 + TypeScript**.

## Tech Stack
- **Frontend**: Svelte 5 (runes: `$state`, `$derived`, `$props`, `$effect`), TypeScript, Vanilla CSS
- **Backend**: Rust via Tauri (Win32 API for click-through, opacity, flash, beep)
- **Build**: Vite + `@sveltejs/vite-plugin-svelte`
- **Lint**: TypeScript strict (`noUnusedLocals`, `noUnusedParameters`)

## Architecture

```
src/
├── main.ts                     # Entry point
├── app.css                     # Global reset styles
├── constants.ts                # ALL UI constants (colors, sizes, timings, fonts)
├── App.svelte                  # Root component (overlay container)
├── lib/
│   ├── timer.svelte.ts         # TimerModel (pure logic, no UI)
│   ├── CircularProgress.svelte # SVG ring
│   ├── TimerDisplay.svelte     # Time text (MM:SS.ms / H:MM:SS)
│   ├── TimerWidget.svelte      # Composes ring + display + controls
│   └── controls/
│       ├── StartPauseButton.svelte
│       └── ResetButton.svelte
src-tauri/
├── src/lib.rs                  # Rust commands (click-through, opacity, flash, beep)
├── src/main.rs                 # Entry point
├── tauri.conf.json             # Frameless, transparent, always-on-top
└── Cargo.toml
```

## Rules (MUST follow)

### 1. No hardcoded values in components
- ALL colors, sizes, durations, font stacks → `src/constants.ts`
- Import and reference constants by name
- Exception: CSS inside `<style>` blocks can use `{CONSTANTS.xyz}` interpolation

### 2. All state/effects use Svelte 5 runes
- `$state()` for reactive variables
- `$derived()` for computed values
- `$props()` for component props
- `$effect()` for side effects (including cleanup)
- Do NOT use `$:`, `onMount`, `onDestroy`, `createEventDispatcher`

### 3. TimerModel is a plain TypeScript class
- No Svelte dependencies
- Callbacks-based (not events/store)
- Instantiated in `TimerWidget.svelte` via `$state(new TimerModel())`

### 4. Git commits
- Commit after each logical phase
- Conventional commit format: `type: message`
- Types: `init`, `feat`, `fix`, `refactor`, `docs`, `chore`
- Keep commits focused (one concern per commit)

### 5. Tauri commands
- Rust commands must be added to `invoke_handler` in `lib.rs`
- Use `#[tauri::command]` attribute
- Window-specific commands take `window: tauri::Window` as first arg

### 6. UI consistency
- All buttons same size (48x48), circular
- Same color scheme (dark theme from constants.ts)
- Minutes input only accepts numbers, disabled while running
- Ring stroke-dashoffset transition: `33ms linear` (matches tick interval)

## Commands
- `npm run dev` — Start Vite dev server only
- `npm run tauri dev` — Start full Tauri dev (Vite + Rust)
- `npm run build` — Build frontend only
- `npm run tauri build` — Production build with Rust
- `npm run typecheck` — Svelte + TS type checking

## Overtime behavior
- Remaining goes negative
- Display shows `-M:SS.ms` in red (`COLORS.overtime`)
- Beep every 1s via `beep_system()` Rust command
- Progress ring stays at 100%, color = `COLORS.ringOvertime`
- Flash window every 5s via `flash_window()` Rust command

## Click-through / interaction modes
- **Auto click-through**: mouse outside window, Ctrl not held → `WS_EX_TRANSPARENT`
- **Interactive**: mouse over window + Ctrl held → normal clicks
- **Shift + mouse over**: full transparency (opacity 0.0)
- **Always-on-top**: set in `tauri.conf.json`, not toggled in UI
