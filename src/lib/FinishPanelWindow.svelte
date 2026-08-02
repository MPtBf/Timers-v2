<script lang="ts">
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { LogicalSize } from "@tauri-apps/api/dpi";
  import { emitTo } from "@tauri-apps/api/event";
  import FinishPanel from "./FinishPanel.svelte";
  import {
    FINISH_PANEL_WIDTH, FINISH_PANEL_HEIGHT,
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

<FinishPanel
  {name}
  {efficiency}
  {usefulness}
  onEfficiency={(v) => { efficiency = v; }}
  onUsefulness={(v) => { usefulness = v; }}
  {onSave}
  {onCancel}
/>
