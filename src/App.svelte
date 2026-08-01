<script lang="ts">
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import Hub from "./lib/Hub.svelte";
  import TimerOverlay from "./lib/TimerOverlay.svelte";
  import { isTimerLabel } from "./lib/windows";

  const label = getCurrentWindow().label;
</script>

{#if isTimerLabel(label)}
  <TimerOverlay />
{:else}
  <Hub />
{/if}
