<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import {
    COLOR_STOPPED, COLOR_RUNNING, COLOR_PAUSED, OVERTIME_COLOR,
    RING_BG, RING_FG, CTRL_BTN_SPACING, TIMER, SESSION,
  } from "../constants";
  import { TimerModel, type TimerState } from "./timer.svelte";
  import { formatClockTime } from "./format";
  import type { TimerStateReport } from "./session";

  let { soundOn = true, onOvertimeChange, initial = null, onStateReport }: {
    soundOn?: boolean;
    onOvertimeChange?: (expired: boolean) => void;
    initial?: TimerStateReport | null;
    onStateReport?: (report: TimerStateReport) => void;
  } = $props();

  let state: TimerState = $state("stopped");
  let remainingMs: number = $state(0);
  let durationMs: number = $state(0);
  let inputMinutes: number = $state(5);

  let timer = $state(new TimerModel());
  let isFinished = $state(false);
  let beepInterval: ReturnType<typeof setInterval> | null = $state(null);
  let flashInterval: ReturnType<typeof setInterval> | null = $state(null);
  let lastReport: number = $state(0);

  let progress = $derived(durationMs > 0 ? 1 - remainingMs / durationMs : 0);
  let timeColor = $derived(
    isFinished ? OVERTIME_COLOR
      : state === "running" ? COLOR_RUNNING
        : state === "paused" ? COLOR_PAUSED
          : COLOR_STOPPED
  );
  let ringProgressColor = $derived(
    isFinished ? OVERTIME_COLOR
      : state === "paused" ? COLOR_PAUSED
        : RING_FG
  );
  let ringProgress = $derived(isFinished ? 1.0 : progress);

  let displayTime = $derived(
    isFinished
      ? formatClockTime(-remainingMs)
      : state === "stopped"
        ? formatClockTime(durationMs > 0 ? durationMs : inputMinutes * 60000)
        : formatClockTime(remainingMs)
  );

  let btnStartVisible = $derived(!isFinished && state === "stopped");
  let btnPauseVisible = $derived(!isFinished && state === "running");
  let btnResumeVisible = $derived(!isFinished && state === "paused");
  let btnStopVisible = $derived(state === "running" || state === "paused" || isFinished);
  let btnRestartVisible = $derived(state === "running" || state === "paused" || isFinished);

  function reportNow() {
    lastReport = performance.now();
    onStateReport?.({ durationMs: timer.durationMs, remainingMs, state });
  }

  function stopOvertime() {
    if (beepInterval !== null) { clearInterval(beepInterval); beepInterval = null; }
    if (flashInterval !== null) { clearInterval(flashInterval); flashInterval = null; }
  }

  function startOvertime() {
    stopOvertime();
    if (soundOn) invoke("beep_system");
    invoke("flash_window");
    beepInterval = setInterval(() => { if (soundOn) invoke("beep_system"); }, TIMER.overtimeBeepIntervalMs);
    flashInterval = setInterval(() => invoke("flash_window"), TIMER.flashIntervalMs);
    isFinished = true;
    onOvertimeChange?.(true);
    reportNow();
  }

  function onStart() {
    if (inputMinutes <= 0) return;
    isFinished = false;
    stopOvertime();
    onOvertimeChange?.(false);
    timer.setDuration(inputMinutes);
    timer.start();
    reportNow();
  }

  function onPause() {
    timer.pause();
    reportNow();
  }

  function onResume() {
    timer.resume();
    reportNow();
  }

  function onStop() {
    isFinished = false;
    stopOvertime();
    onOvertimeChange?.(false);
    timer.stop();
    reportNow();
  }

  function onRestart() { onStop(); onStart(); }

  function onTick(rm: number, _em: number) {
    remainingMs = rm;
    durationMs = timer.durationMs;
    if (performance.now() - lastReport >= SESSION.snapshotIntervalMs) reportNow();
  }

  function onStateChange(s: TimerState) { state = s; }
  function onFinished() { startOvertime(); }

  timer.on({ onTick, onStateChange, onFinished });

  let restored = false;
  $effect(() => {
    if (initial && !restored) {
      restored = true;
      inputMinutes = Number((initial.durationMs / 60000).toFixed(1));
      isFinished = initial.remainingMs <= 0;
      timer.restore(initial.durationMs, initial.remainingMs, initial.state);
      if (isFinished) startOvertime();
      reportNow();
    }
  });

  $effect(() => {
    return () => { stopOvertime(); timer.destroy(); };
  });
</script>

<div class="timer-widget">
  <div class="spin-row">
    <input
      type="number"
      min="0.1"
      step="1"
      bind:value={inputMinutes}
      class="spinbox"
      onkeydown={(e) => { if (e.key === "Enter") onRestart(); }}
    />
  </div>

  <div class="ring-container">
      <svg class="ring" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="85" fill="none" stroke={RING_BG} stroke-width="54" />
      <circle cx="60" cy="60" r="85" fill="none"
        stroke={ringProgressColor}
        stroke-width="54"
        stroke-linecap="butt"
        stroke-dasharray={2 * Math.PI * 85}
        stroke-dashoffset={2 * Math.PI * 85 * (1 - ringProgress)}
        style="transition: stroke-dashoffset 33ms linear, stroke 150ms ease;"
      />
    </svg>
    <span class="time" style="color: {timeColor};">{displayTime}</span>
  </div>

  <div class="buttons" style="gap: {CTRL_BTN_SPACING}px;">
    <button class="ctrl-btn" class:visible={btnStartVisible} onclick={onStart}>▶</button>
    <button class="ctrl-btn" class:visible={btnPauseVisible} onclick={onPause}>⏸</button>
    <button class="ctrl-btn" class:visible={btnResumeVisible} onclick={onResume}>⏯</button>
    <button class="ctrl-btn" class:visible={btnStopVisible} onclick={onStop}>⏹</button>
    <button class="ctrl-btn" class:visible={btnRestartVisible} onclick={onRestart}>🔁</button>
  </div>
</div>

<style>
  .timer-widget {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    width: 100%;
    height: 100%;
  }
  .spin-row {
    width: 100%;
    flex-shrink: 0;
    padding: 0;
    margin: -1px 0 0 0;
    line-height: 0;
  }
  .spinbox {
    width: 100%;
    height: 18px;
    padding: 0 4px;
    margin: 0;
    font-size: 10px;
    text-align: center;
    background: #1a1a1a;
    color: #e0e0e0;
    border: 1px solid #444;
    border-top: none;
    border-radius: 0;
    outline: none;
    box-sizing: border-box;
    font-family: "Segoe UI", sans-serif;
    appearance: textfield;
    -moz-appearance: textfield;
  }
  .spinbox::-webkit-inner-spin-button,
  .spinbox::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  .spinbox:disabled { opacity: 0.5; }

  .ring-container {
    position: relative;
    width: 100%;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
  }
  .ring { position: absolute; width: 100%; height: 100%; top: 0; left: 0; z-index: 0; }
  .time {
    position: relative;
    z-index: 10;
    font-size: 18px;
    font-weight: bold;
    font-family: "Segoe UI", sans-serif;
    user-select: none;
    line-height: 1;
  }

  .buttons { display: flex; width: 100%; flex-shrink: 0; }
  .ctrl-btn {
    flex: 1;
    height: 18px;
    background: #555555;
    color: #e0e0e0;
    border: none;
    border-radius: 0;
    padding: 0;
    font-size: 10px;
    font-family: "Segoe UI", sans-serif;
    cursor: pointer;
    line-height: 1;
    display: none;
    align-items: center;
    justify-content: center;
  }
  .ctrl-btn.visible { display: flex; }
  .ctrl-btn:hover { background: #777777; }
</style>
