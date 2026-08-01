<script lang="ts">
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { listen } from "@tauri-apps/api/event";
  import {
    BG_PANEL, BORDER_COLOR, TEXT_COLOR, TEXT_DIM, BTN_BG, BTN_HOVER,
    ACCENT_BG, ACCENT_FG, COLOR_STOPPED, COLOR_RUNNING, COLOR_PAUSED,
    OVERTIME_COLOR, WINDOW_WIDTH, WINDOW_HEIGHT, SESSION,
  } from "../constants";
  import {
    createTimerWindow, saveSession, loadSession, quitAll,
    hideTimers, showTimers, setTimersAlwaysOnTop, muteAll, closeTimer, focusTimer,
  } from "./ipc";
  import { serializeSession, parseSession, type TimerSnapshot, type TimerState } from "./session";
  import { formatClockTime } from "./format";
  import { EVT_TIMER_SNAPSHOT, EVT_TIMER_CLOSED, EVT_REQUEST_QUIT } from "./events";

  let timers = $state<TimerSnapshot[]>([]);
  let saveTimer: ReturnType<typeof setTimeout> | undefined = $state(undefined);

  function saveNow(): Promise<void> {
    return saveSession(serializeSession(timers));
  }

  function scheduleSave() {
    if (saveTimer !== undefined) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      saveNow().catch((err) => console.error("saveSession error:", err));
    }, SESSION.saveDebounceMs);
  }

  function upsert(snap: TimerSnapshot) {
    const idx = timers.findIndex((t) => t.id === snap.id);
    timers = idx === -1
      ? [...timers, snap]
      : timers.map((t) => (t.id === snap.id ? snap : t));
    scheduleSave();
  }

  function remove(id: number) {
    timers = timers.filter((t) => t.id !== id);
    scheduleSave();
  }

  function nextId(): number {
    return timers.reduce((m, t) => Math.max(m, t.id), 0) + 1;
  }

  async function newTimer() {
    const pos = await getCurrentWindow().outerPosition();
    const count = timers.length;
    const snap: TimerSnapshot = {
      id: nextId(),
      durationMs: 5 * 60000,
      remainingMs: 5 * 60000,
      state: "stopped",
      soundOn: true,
      pinned: false,
      x: pos.x + SESSION.newTimerCascadeOffset + (count % 8) * SESSION.newTimerCascadeStep,
      y: pos.y + SESSION.newTimerCascadeOffset + (count % 8) * SESSION.newTimerCascadeStep,
      w: WINDOW_WIDTH,
      h: WINDOW_HEIGHT,
    };
    await createTimerWindow(snap);
    upsert(snap);
  }

  async function quit() {
    await saveNow();
    await quitAll();
  }

  function onHideAll() { hideTimers(); }
  function onShowAll() { showTimers(); }
  function onMuteAll() { muteAll(true); }
  function onUnmuteAll() { muteAll(false); }
  function onPinAll() { setTimersAlwaysOnTop(true); }
  function onUnpinAll() { setTimersAlwaysOnTop(false); }

  function stateColor(s: TimerState): string {
    return s === "running" ? COLOR_RUNNING : s === "paused" ? COLOR_PAUSED : COLOR_STOPPED;
  }

  $effect(() => {
    const unlistens: Array<Promise<() => void>> = [];
    unlistens.push(listen<TimerSnapshot>(EVT_TIMER_SNAPSHOT, (e) => upsert(e.payload)));
    unlistens.push(listen<number>(EVT_TIMER_CLOSED, (e) => remove(e.payload)));
    unlistens.push(listen<void>(EVT_REQUEST_QUIT, () => {
      saveNow().then(() => quitAll()).catch((err) => console.error("request-quit save error:", err));
    }));
    loadSession().then((text) => {
      if (!text) return;
      const snapshots = parseSession(text);
      if (!snapshots || snapshots.length === 0) return;
      timers = snapshots;
      for (const s of snapshots) {
        createTimerWindow(s).catch((err) => console.error("createTimerWindow error:", err));
      }
    });
    return () => {
      for (const p of unlistens) p.then((fn) => fn());
      if (saveTimer !== undefined) clearTimeout(saveTimer);
    };
  });
</script>

<div
  class="hub"
  style="--bg: {BG_PANEL}; --border: {BORDER_COLOR}; --text: {TEXT_COLOR}; --dim: {TEXT_DIM}; --btn: {BTN_BG}; --btn-hover: {BTN_HOVER}; --accent-bg: {ACCENT_BG}; --accent-fg: {ACCENT_FG}; --row-hover: #2a2a2a; --overtime: {OVERTIME_COLOR}; --quit-bg: #7a2a2a; --quit-hover: #8a3030;"
>
  <header>
    <h1>Timers</h1>
    <button class="new-btn" onclick={newTimer}>+ New</button>
  </header>

  <div class="toolbar">
    <button onclick={onHideAll}>Hide</button>
    <button onclick={onShowAll}>Show</button>
    <button onclick={onPinAll}>Pin</button>
    <button onclick={onUnpinAll}>Unpin</button>
    <button onclick={onMuteAll}>Mute</button>
    <button onclick={onUnmuteAll}>Unmute</button>
  </div>

  <ul class="list">
    {#each timers as t (t.id)}
      <li class="row-wrap">
        <button class="row" type="button" onclick={() => focusTimer(t.id)}>
          <span class="state-dot" style="background: {stateColor(t.state)};"></span>
          <span class="state-label" style="color: {t.state === "stopped" ? TEXT_DIM : stateColor(t.state)};">{t.state}</span>
          <span class="time">{formatClockTime(t.remainingMs)}</span>
          <span class="meta">{t.soundOn ? "🔊" : "🔇"} {t.pinned ? "📌" : ""}</span>
        </button>
        <button
          class="row-close"
          type="button"
          title="Close timer"
          onclick={() => closeTimer(t.id)}
        >✕</button>
      </li>
    {:else}
      <li class="empty">No timers yet</li>
    {/each}
  </ul>

  <footer>
    <button class="quit-btn" onclick={quit}>Quit all</button>
  </footer>
</div>

<style>
  .hub {
    width: 100vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  h1 {
    font-size: 13px;
    font-weight: bold;
  }
  .new-btn {
    background: var(--accent-bg);
    color: var(--accent-fg);
    border: none;
    border-radius: 3px;
    padding: 3px 8px;
    font-size: 11px;
    cursor: pointer;
  }
  .new-btn:hover {
    filter: brightness(1.2);
  }
  .toolbar {
    display: flex;
    gap: 4px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .toolbar button {
    flex: 1;
    min-width: 44px;
    background: var(--btn);
    color: var(--text);
    border: none;
    border-radius: 3px;
    padding: 4px 0;
    font-size: 10px;
    cursor: pointer;
  }
  .toolbar button:hover {
    background: var(--btn-hover);
  }
  .list {
    flex: 1;
    overflow-y: auto;
    list-style: none;
    padding: 4px;
    margin: 0;
  }
  .row-wrap {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 2px;
    border-radius: 3px;
  }
  .row-wrap:hover {
    background: var(--row-hover);
  }
  .row {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: var(--text);
    font-family: inherit;
    cursor: pointer;
    text-align: left;
  }
  .row:hover {
    background: var(--row-hover);
  }
  .state-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .state-label {
    font-size: 10px;
    width: 52px;
    flex-shrink: 0;
  }
  .time {
    font-size: 12px;
    font-weight: bold;
    font-variant-numeric: tabular-nums;
    flex: 1;
  }
  .meta {
    font-size: 9px;
    color: var(--dim);
  }
  .row-close {
    background: transparent;
    color: var(--dim);
    border: none;
    border-radius: 3px;
    width: 16px;
    height: 16px;
    font-size: 10px;
    cursor: pointer;
    flex-shrink: 0;
  }
  .row-close:hover {
    background: var(--overtime);
    color: white;
  }
  .empty {
    text-align: center;
    color: var(--dim);
    font-size: 11px;
    padding: 24px 0;
  }
  footer {
    padding: 6px 8px;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }
  .quit-btn {
    width: 100%;
    background: var(--quit-bg);
    color: white;
    border: none;
    border-radius: 3px;
    padding: 5px 0;
    font-size: 11px;
    cursor: pointer;
  }
  .quit-btn:hover {
    background: var(--quit-hover);
  }
</style>
