<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import TimerWidget from "./lib/TimerWidget.svelte";
  import {
    BG_PANEL, BORDER_COLOR, SIDE_BTN_SIZE, SIDE_BTN_FONT_SIZE, DRAG_STRIP_WIDTH,
  } from "./constants";

  let ctrlHeld = $state(false);
  let shiftHeld = $state(false);
  let mouseOver = $state(false);

  function updateClickThrough() {
    if (shiftHeld && mouseOver) {
      invoke("set_opacity", { opacity: 0.0 });
      invoke("set_click_through", { enabled: true });
    } else if (ctrlHeld && mouseOver) {
      invoke("set_opacity", { opacity: 1.0 });
      invoke("set_click_through", { enabled: false });
    } else {
      invoke("set_opacity", { opacity: 0.5 });
      invoke("set_click_through", { enabled: true });
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Control") { ctrlHeld = true; updateClickThrough(); }
    if (e.key === "Shift") { shiftHeld = true; updateClickThrough(); }
  }

  function onKeyUp(e: KeyboardEvent) {
    if (e.key === "Control") { ctrlHeld = false; updateClickThrough(); }
    if (e.key === "Shift") { shiftHeld = false; updateClickThrough(); }
  }

  function onMouseEnter() { mouseOver = true; updateClickThrough(); }
  function onMouseLeave() { mouseOver = false; updateClickThrough(); }

  $effect(() => {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  });

  $effect(() => {
    invoke("set_click_through", { enabled: true });
    invoke("set_opacity", { opacity: 0.5 });
  });

  let soundOn = $state(true);
  let pinned = $state(false);

  function toggleSound() { soundOn = !soundOn; }

  async function togglePin() {
    pinned = !pinned;
    await getCurrentWindow().setAlwaysOnTop(pinned);
  }

  function closeApp() { getCurrentWindow().close(); }
</script>

<div class="app" role="application" onmouseenter={onMouseEnter} onmouseleave={onMouseLeave}>
  <div class="panel" style="background: {BG_PANEL}; border: 1px solid {BORDER_COLOR};">
    <div class="content">
      <div class="left">
        <TimerWidget {soundOn} />
      </div>
      <div class="right-col"
        style="width: {SIDE_BTN_SIZE + DRAG_STRIP_WIDTH}px;"
      >
        <button
          class="side-btn"
          style="width: {SIDE_BTN_SIZE}px; height: {SIDE_BTN_SIZE}px; font-size: {SIDE_BTN_FONT_SIZE}px;"
          title="Close"
          onclick={closeApp}
        >✕</button>
        <button
          class="side-btn"
          style="width: {SIDE_BTN_SIZE}px; height: {SIDE_BTN_SIZE}px; font-size: {SIDE_BTN_FONT_SIZE}px;"
          title="Sound"
          onclick={toggleSound}
        >{soundOn ? "🔊" : "🔇"}</button>
        <button
          class="side-btn"
          class:pinned
          style="width: {SIDE_BTN_SIZE}px; height: {SIDE_BTN_SIZE}px; font-size: {SIDE_BTN_FONT_SIZE}px;"
          title="Always on top"
          onclick={togglePin}
        >📌</button>
        <div class="drag-strip" style="width: {DRAG_STRIP_WIDTH}px;" data-tauri-drag-region></div>
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
  .content {
    display: flex;
    flex-direction: row;
    gap: 0;
  }
  .left {
    flex: 0 0 auto;
  }
  .right-col {
    display: flex;
    flex-direction: column;
    gap: 0;
    flex: 0 0 auto;
  }
  .side-btn {
    border: none;
    background: #555555;
    color: #888888;
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
  .side-btn.pinned {
    background: #2a4a6a;
    color: #6aafef;
  }
  .drag-strip {
    flex: 1;
    background: #333333;
    cursor: grab;
    min-height: 14px;
  }
  .drag-strip:hover {
    background: #444444;
  }
</style>
