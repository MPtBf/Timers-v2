<script lang="ts">
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import Hub from "./lib/Hub.svelte";
  import TimerOverlay from "./lib/TimerOverlay.svelte";
  import TaskPanelWindow from "./lib/TaskPanelWindow.svelte";
  import FinishPanelWindow from "./lib/FinishPanelWindow.svelte";
  import { isTimerLabel, isTaskPanelLabel, isFinishPanelLabel } from "./lib/windows";

  const label = getCurrentWindow().label;
</script>

{#if isTimerLabel(label)}
  <TimerOverlay />
{:else if isTaskPanelLabel(label)}
  <TaskPanelWindow />
{:else if isFinishPanelLabel(label)}
  <FinishPanelWindow />
{:else}
  <Hub />
{/if}
