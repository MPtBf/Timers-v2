<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
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

  let timer = $state(new TimerModel());
  let beepInterval: ReturnType<typeof setInterval> | null = $state(null);
  let flashInterval: ReturnType<typeof setInterval> | null = $state(null);

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

  function stopOvertime() {
    if (beepInterval !== null) {
      clearInterval(beepInterval);
      beepInterval = null;
    }
    if (flashInterval !== null) {
      clearInterval(flashInterval);
      flashInterval = null;
    }
  }

  function startOvertime() {
    stopOvertime();
    invoke("beep_system");
    invoke("flash_window");
    beepInterval = setInterval(() => invoke("beep_system"), TIMER.overtimeBeepIntervalMs);
    flashInterval = setInterval(() => invoke("flash_window"), TIMER.flashIntervalMs);
  }

  function onStartPause() {
    if (state === "stopped") {
      if (inputMinutes <= 0) return;
      stopOvertime();
      timer.setDuration(inputMinutes);
      timer.start();
    } else if (state === "running") {
      timer.pause();
    } else if (state === "paused") {
      timer.resume();
    }
  }

  function onReset() {
    stopOvertime();
    timer.stop();
  }

  function onFinished() {
    state = timer.state;
    startOvertime();
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
      stopOvertime();
      timer.destroy();
    };
  });
</script>

<div class="widget">
  <div class="drag-strip" data-tauri-drag-region></div>

  <div class="content">
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
</div>

<style>
  .widget {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: #1f1f1f;
    border-radius: 12px;
    overflow: hidden;
  }

  .drag-strip {
    width: 100%;
    height: 6px;
    background: #333333;
    cursor: grab;
    flex-shrink: 0;
  }

  .content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 16px 24px 20px;
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
