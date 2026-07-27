<script lang="ts">
  import type { TimerState } from "../timer.svelte";

  let { state = "stopped", onclick }: {
    state?: TimerState;
    onclick?: () => void;
  } = $props();

  let label = $derived(
    state === "running" ? "⏸" : state === "paused" ? "▶" : "▶"
  );
  let title = $derived(
    state === "running" ? "Pause" : state === "paused" ? "Resume" : "Start"
  );
</script>

<button class="btn" {title} {onclick} data-state={state}>
  {label}
</button>

<style>
  .btn {
    width: 48px;
    height: 48px;
    border: none;
    border-radius: 50%;
    background: #2a2a2a;
    color: #e0e0e0;
    font-size: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s ease;
  }
  .btn:hover {
    background: #333333;
  }
  .btn:active {
    transform: scale(0.95);
  }
</style>
