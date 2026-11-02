<script lang="ts">
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { LogicalSize } from "@tauri-apps/api/dpi";
  import { emitTo, listen } from "@tauri-apps/api/event";
  import TimerWidget from "./TimerWidget.svelte";
  import {
    BG_PANEL, BORDER_COLOR, WINDOW_WIDTH, WINDOW_HEIGHT,
  } from "../constants";
  import {
    setClickThrough, setOpacity, getModifierState, getCursorPos,
    applyDwm, getTimerInit, raiseWindow,
  } from "./ipc";
  import { HUB_LABEL, timerIdFromLabel } from "./windows";
  import {
    EVT_TIMER_SNAPSHOT, EVT_MUTE_ALL, EVT_PIN_ALL,
  } from "./events";
  import type { TimerSnapshot, TimerStateReport } from "./session";

  const win = getCurrentWindow();
  const id = timerIdFromLabel(win.label);
  const timerLabel = win.label;

  let soundOn = $state(true);
  let pinned = $state(false);
  let interactive = $state(false);
  let overtimeActive = $state(false);
  let initial = $state<TimerStateReport | null>(null);
  let timerReport = $state<TimerStateReport | null>(null);

  function reportSnapshot() {
    if (timerReport === null || id === null) return;
    const report = timerReport;
    win.outerPosition().then((p) => {
      const snapshot: TimerSnapshot = {
        id,
        durationMs: report.durationMs,
        remainingMs: report.remainingMs,
        state: report.state,
        soundOn,
        pinned,
        x: Math.round(p.x),
        y: Math.round(p.y),
        w: WINDOW_WIDTH,
        h: WINDOW_HEIGHT,
      };
      emitTo(HUB_LABEL, EVT_TIMER_SNAPSHOT, snapshot);
    }).catch((err) => {
      console.error("reportSnapshot error:", err);
    });
  }

  function toggleSound() {
    soundOn = !soundOn;
    reportSnapshot();
  }

  async function togglePin() {
    pinned = !pinned;
    await win.setAlwaysOnTop(overtimeActive ? true : pinned);
    reportSnapshot();
  }

  function handleOvertimeChange(expired: boolean) {
    overtimeActive = expired;
    if (expired) {
      win.setAlwaysOnTop(true);
      interactive = true;
      applyWindowInteraction(1.0, false).catch(() => {});
      raiseWindow();
    } else {
      win.setAlwaysOnTop(pinned);
    }
  }

  let lastOpacity: number | null = null;
  let lastClickThrough: boolean | null = null;

  async function applyWindowInteraction(opacity: number, clickThrough: boolean) {
    if (opacity === lastOpacity && clickThrough === lastClickThrough) return;
    lastOpacity = opacity;
    lastClickThrough = clickThrough;
    await setOpacity(opacity);
    await setClickThrough(clickThrough);
  }

  async function applyInteraction(ctrl: boolean, shift: boolean, over: boolean) {
    if (overtimeActive) {
      interactive = true;
      await applyWindowInteraction(1.0, false);
    } else if (shift && over) {
      interactive = false;
      await applyWindowInteraction(0.0, true);
    } else if (ctrl && over) {
      interactive = true;
      await applyWindowInteraction(1.0, false);
    } else {
      interactive = false;
      await applyWindowInteraction(0.5, true);
    }
  }

  let pollBusy = false;

  async function pollInteraction() {
    if (pollBusy) return;
    pollBusy = true;
    try {
      const [ctrl, shift] = await getModifierState();
      const [cx, cy] = await getCursorPos();
      const pos = await win.outerPosition();
      const size = await win.outerSize();
      const over = (
        cx >= pos.x && cx < pos.x + size.width &&
        cy >= pos.y && cy < pos.y + size.height
      );
      await applyInteraction(ctrl, shift, over);
    } catch (e) {
      console.error("pollInteraction error:", e);
    } finally {
      pollBusy = false;
    }
  }

  $effect(() => {
    win.setSize(new LogicalSize(WINDOW_WIDTH, WINDOW_HEIGHT));
    lastOpacity = 0.5;
    lastClickThrough = true;
    setClickThrough(true);
    setOpacity(0.5);
    applyDwm();
    getTimerInit().then((snap) => {
      if (snap) {
        soundOn = snap.soundOn;
        pinned = snap.pinned;
        initial = {
          durationMs: snap.durationMs,
          remainingMs: snap.remainingMs,
          state: snap.state,
        };
      }
    });
    const idp = setInterval(pollInteraction, 100);
    return () => clearInterval(idp);
  });

  $effect(() => {
    const unlistens: Array<Promise<() => void>> = [];
    unlistens.push(listen<boolean>(EVT_MUTE_ALL, (e) => {
      soundOn = !e.payload;
      reportSnapshot();
    }));
    unlistens.push(listen<boolean>(EVT_PIN_ALL, (e) => {
      pinned = e.payload;
      if (overtimeActive) {
        win.setAlwaysOnTop(true);
      }
      reportSnapshot();
    }));
    return () => {
      for (const p of unlistens) p.then((fn) => fn());
    };
  });

  $effect(() => {
    if (timerReport !== null) reportSnapshot();
  });

  $effect(() => {
    let unlisten: (() => void) | undefined;
    win.onMoved(() => { reportSnapshot(); }).then((fn) => { unlisten = fn; });
    return () => unlisten?.();
  });

  $effect(() => {
    const handler = () => { reportSnapshot(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  });

  $effect(() => {
    document.body.style.cursor = interactive ? "default" : "none";
  });
</script>

<div class="app" role="application">
  <div class="panel" style="background: {BG_PANEL}; border: 1px solid {BORDER_COLOR};">
    <div class="content">
      <div class="left">
        <TimerWidget
          {soundOn}
          {initial}
          {timerLabel}
          onOvertimeChange={handleOvertimeChange}
          onStateReport={(r) => { timerReport = r; }}
        />
      </div>
      <div class="right-col">
        <button
          class="side-btn"
          title="Close"
          onclick={() => win.close()}
        >✕</button>
        <button
          class="side-btn"
          class:active={soundOn}
          title="Sound"
          onclick={toggleSound}
        >{soundOn ? "🔊" : "🔇"}</button>
        <button
          class="side-btn"
          class:active={pinned}
          title="Always on top"
          onclick={togglePin}
        >📌</button>
        <div
          class="drag-strip"
          role="button"
          tabindex="0"
          aria-label="Drag window"
          onmousedown={(e) => {
            e.preventDefault();
            win.startDragging().catch((err) => {
              console.error("startDragging failed:", err);
            });
          }}
        ></div>
      </div>
    </div>
  </div>
</div>

<style>
  .app {
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .panel {
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  .content {
    display: flex;
    flex-direction: row;
    gap: 0;
    width: 100%;
    height: 100%;
  }
  .left {
    flex: 1;
    min-width: 0;
    height: 100%;
    overflow: hidden;
  }
  .right-col {
    display: flex;
    flex-direction: column;
    gap: 0;
    width: 16px;
    height: 100%;
    flex-shrink: 0;
  }
  .side-btn {
    width: 16px;
    height: 16px;
    border: none;
    background: #555555;
    color: #888888;
    font-size: 8px;
    font-family: "Segoe UI Symbol", sans-serif;
    cursor: pointer;
    padding: 0;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .side-btn:hover {
    background: #e74c3c;
    color: white;
  }
  .side-btn.active {
    background: #2a4a6a;
    color: #6aafef;
  }
  .drag-strip {
    flex: 1;
    width: 16px;
    background: #333333;
    cursor: grab;
    min-height: 14px;
  }
  .drag-strip:hover {
    background: #444444;
  }
</style>
