<script lang="ts">
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import Hub from "./lib/Hub.svelte";
  import TimerOverlay from "./lib/TimerOverlay.svelte";
  import Dashboard from "./lib/Dashboard.svelte";
  import { isTimerLabel, isDashboardLabel } from "./lib/windows";

  const label = getCurrentWindow().label;
</script>

{#if isTimerLabel(label)}
  <TimerOverlay />
{:else if isDashboardLabel(label)}
  <Dashboard />
{:else}
  <Hub />
{/if}
