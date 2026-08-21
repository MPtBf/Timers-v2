<script lang="ts">
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { LogicalSize } from "@tauri-apps/api/dpi";
  import { emitTo } from "@tauri-apps/api/event";
  import FinishPanel from "./FinishPanel.svelte";
  import {
    FINISH_PANEL_WIDTH, FINISH_PANEL_HEIGHT, PANEL_DRAG_STRIP_HEIGHT, PANEL_STRIP_BG, PANEL_STRIP_HOVER,
  } from "../constants";
  import { getPanelInit } from "./ipc";
  import { panelTimerLabel } from "./windows";
  import { EVT_TASK_FINISH } from "./events";

  const win = getCurrentWindow();
  const timerLabel = panelTimerLabel(win.label) ?? "";

  let name = $state("");
  let efficiency = $state(50);
  let usefulness = $state(50);
  let activityId = $state<number | null>(null);

  function onSave() {
    if (activityId === null) return;
    emitTo(timerLabel, EVT_TASK_FINISH, {
      timerLabel,
      activityId,
      efficiency,
      usefulness,
      endedMs: Date.now(),
    }).catch((err) => console.error("task-finish emit error:", err));
    win.close();
  }

  function onCancel() {
    win.close();
  }

  $effect(() => {
    win.setSize(new LogicalSize(FINISH_PANEL_WIDTH, FINISH_PANEL_HEIGHT));
    getPanelInit().then((init) => {
      if (!init) return;
      if (init.timerLabel !== timerLabel) return;
      activityId = init.activityId;
      name = init.activityName ?? "";
    }).catch((err) => console.error("getPanelInit error:", err));
  });
</script>

<div class="panel-root" style="--strip-h: {PANEL_DRAG_STRIP_HEIGHT}px; --strip-bg: {PANEL_STRIP_BG}; --strip-hover: {PANEL_STRIP_HOVER};">
  <div
    class="drag-strip"
    role="button"
    tabindex="0"
    aria-label="Drag panel"
    onmousedown={(e) => {
      e.preventDefault();
      win.startDragging().catch((err) => console.error("startDragging failed:", err));
    }}
  ></div>
  <div class="panel-body">
    <FinishPanel
      {name}
      {efficiency}
      {usefulness}
      onEfficiency={(v) => { efficiency = v; }}
      onUsefulness={(v) => { usefulness = v; }}
      {onSave}
      {onCancel}
    />
  </div>
</div>

<style>
  .panel-root {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
  }
  .drag-strip {
    flex-shrink: 0;
    height: var(--strip-h);
    background: var(--strip-bg);
    cursor: grab;
  }
  .drag-strip:hover {
    background: var(--strip-hover);
  }
  .panel-body {
    flex: 1;
    min-height: 0;
  }
</style>
