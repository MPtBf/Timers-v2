<script lang="ts">
  import { COLORS, TIMER } from "../constants";
  import { TimerModel, type TimerState } from "./timer.svelte";
  import CircularProgress from "./CircularProgress.svelte";
  import TimerDisplay from "./TimerDisplay.svelte";
  import StartPauseButton from "./controls/StartPauseButton.svelte";
  import ResetButton from "./controls/ResetButton.svelte";

  let state: TimerState = $state("stopped");
  let remainingMs: number = $state(0);
  let durationMs: number = $state(0);
  let inputMinutes: number = $state(5);
  let beepEnabled: boolean = $state(true);

  let timer = $state(new TimerModel());

  let progress = $derived(durationMs > 0 ? 1 - remainingMs / durationMs : 0);
  let isOvertime = $derived(remainingMs < 0);
  let displayTime = $derived(timer.formattedTime);
  let ringColor = $derived(
    isOvertime
      ? COLORS.ringOvertime
      : state === "running"
        ? COLORS.ringRunning
        : state === "paused"
          ? COLORS.ringPaused
          : COLORS.ringStopped
  );
  let inputBorderColor = $derived(
    isOvertime
      ? COLORS.overtime
      : state === "running"
        ? COLORS.accentRunning
        : state === "paused"
          ? COLORS.accentPaused
          : COLORS.accentStopped
  );
  let canStart = $derived(state === "stopped" && inputMinutes > 0);

  function onStartPause() {
    if (state === "stopped") {
      if (inputMinutes <= 0) return;
      timer.setDuration(inputMinutes);
      timer.start();
    } else if (state === "running") {
      timer.pause();
    } else if (state === "paused") {
      timer.resume();
    }
  }

  function onReset() {
    timer.stop();
  }

  function onFinished() {
    state = timer.state;
  }

  function onTick(rm: number, _em: number) {
    remainingMs = rm;
    durationMs = timer.durationMs;
  }

  function onStateChange(s: TimerState) {
    state = s;
  }

  timer.on({
    onTick,
    onStateChange,
    onFinished,
  });

  $effect(() => {
    return () => {
      timer.destroy();
    };
  });
</script>

<div class="widget">
  <div class="ring-container">
    <CircularProgress {progress} color={ringColor} />
    <div class="time-overlay">
      <TimerDisplay time={displayTime} isOvertime={isOvertime} />
    </div>
  </div>

  <div class="controls">
    <div class="input-row">
      <input
        type="number"
        min="0.1"
        step="1"
        bind:value={inputMinutes}
        disabled={state !== "stopped"}
        class="minutes-input"
        style="border-color: {inputBorderColor};"
      />
      <span class="unit">min</span>
    </div>

    <div class="buttons">
      <StartPauseButton {state} onclick={onStartPause} />
      <ResetButton onclick={onReset} />
    </div>
  </div>
</div>

<style>
  .widget {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 16px;
    background: #1f1f1f;
    border-radius: 12px;
  }

  .ring-container {
    position: relative;
    width: 160px;
    height: 160px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .time-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    width: 100%;
  }

  .input-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .minutes-input {
    width: 64px;
    padding: 4px 8px;
    font-size: 16px;
    text-align: center;
    background: #1a1a1a;
    color: #e0e0e0;
    border: 2px solid;
    border-radius: 6px;
    outline: none;
  }
  .minutes-input:disabled {
    opacity: 0.5;
  }
  .minutes-input::-webkit-inner-spin-button,
  .minutes-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .minutes-input[type="number"] {
    -moz-appearance: textfield;
  }

  .unit {
    font-size: 14px;
    color: #888888;
    user-select: none;
  }

  .buttons {
    display: flex;
    gap: 12px;
  }
</style>
