<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import {
    BG_PANEL, TEXT_COLOR, COLOR_STOPPED, COLOR_RUNNING, COLOR_PAUSED, OVERTIME_COLOR,
    RING_BG, RING_WIDTH, TIME_FONT_SIZE, SPIN_FONT_SIZE, CTRL_BTN_SPACING,
    TIMER,
  } from "../constants";
  import { TimerModel, type TimerState } from "./timer.svelte";

  let { soundOn = true }: { soundOn?: boolean } = $props();

  let state: TimerState = $state("stopped");
  let remainingMs: number = $state(0);
  let durationMs: number = $state(0);
  let inputMinutes: number = $state(5);

  let timer = $state(new TimerModel());
  let isFinished = $state(false);
  let beepInterval: ReturnType<typeof setInterval> | null = $state(null);
  let flashInterval: ReturnType<typeof setInterval> | null = $state(null);

  let progress = $derived(durationMs > 0 ? 1 - remainingMs / durationMs : 0);
  let ringColor = $derived(
    isFinished ? OVERTIME_COLOR
      : state === "running" ? COLOR_RUNNING
        : state === "paused" ? COLOR_PAUSED
          : COLOR_STOPPED
  );

  function formatTime(ms: number): string {
    const abs = Math.abs(ms);
    const totalSec = Math.floor(abs / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const sign = ms < 0 ? "-" : "";
    return `${sign}${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  let displayTime = $derived(
    isFinished
      ? formatTime(-remainingMs)
      : state === "stopped"
        ? formatTime(inputMinutes * 60000)
        : formatTime(remainingMs)
  );
  let timeColor = $derived(ringColor);
  let ringProgress = $derived(isFinished ? 1.0 : progress);

  // Button visibility
  let btnStartVisible = $derived(!isFinished && state === "stopped");
  let btnPauseVisible = $derived(!isFinished && state === "running");
  let btnResumeVisible = $derived(!isFinished && state === "paused");
  let btnStopVisible = $derived(state === "running" || state === "paused" || isFinished);
  let btnRestartVisible = $derived(state === "running" || state === "paused" || isFinished);

  // SVG ring geometry
  let ringSvgSize = 60;
  let ringCx = ringSvgSize / 2;
  let ringR = 25;
  let ringCircumference = 2 * Math.PI * ringR;
  let ringOffset = $derived(ringCircumference * (1 - ringProgress));

  function stopOvertime() {
    if (beepInterval !== null) { clearInterval(beepInterval); beepInterval = null; }
    if (flashInterval !== null) { clearInterval(flashInterval); flashInterval = null; }
  }

  function startOvertime() {
    stopOvertime();
    invoke("beep_system");
    invoke("flash_window");
    beepInterval = setInterval(() => { if (soundOn) invoke("beep_system"); }, TIMER.overtimeBeepIntervalMs);
    flashInterval = setInterval(() => invoke("flash_window"), TIMER.flashIntervalMs);
    isFinished = true;
  }

  function onStart() {
    if (inputMinutes <= 0) return;
    isFinished = false;
    stopOvertime();
    timer.setDuration(inputMinutes);
    timer.start();
  }

  function onPause() { timer.pause(); }
  function onResume() { timer.resume(); }

  function onStop() {
    isFinished = false;
    stopOvertime();
    timer.stop();
  }

  function onRestart() { onStop(); onStart(); }

  function onTick(rm: number, _em: number) {
    remainingMs = rm;
    durationMs = timer.durationMs;
  }

  function onStateChange(s: TimerState) { state = s; }
  function onFinished() { startOvertime(); }

  timer.on({ onTick, onStateChange, onFinished });

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
      disabled={state !== "stopped"}
      class="spinbox"
      style="font-size: {SPIN_FONT_SIZE}px; background: {BG_PANEL}; color: {TEXT_COLOR};"
      onkeydown={(e) => { if (e.key === "Enter") onRestart(); }}
    />
  </div>

  <div class="ring-container" style="width: {ringSvgSize}px; height: {ringSvgSize}px;">
    <svg class="ring" viewBox="0 0 {ringSvgSize} {ringSvgSize}">
      <circle cx={ringCx} cy={ringCx} r={ringR} fill="none" stroke={RING_BG}
        stroke-width={RING_WIDTH} />
      <circle cx={ringCx} cy={ringCx} r={ringR} fill="none"
        stroke={isFinished ? OVERTIME_COLOR : ringColor}
        stroke-width={RING_WIDTH}
        stroke-linecap="butt"
        stroke-dasharray={ringCircumference}
        stroke-dashoffset={ringOffset}
        style="transition: stroke-dashoffset 33ms linear, stroke 150ms ease;"
      />
    </svg>
    <span class="time" style="color: {timeColor}; font-size: {TIME_FONT_SIZE}px;">
      {displayTime}
    </span>
  </div>

  <div class="buttons" style="gap: {CTRL_BTN_SPACING}px;">
    <button class="ctrl-btn" class:visible={btnStartVisible} onclick={onStart}
      style="background: {BG_PANEL}; color: {TEXT_COLOR};">▶</button>
    <button class="ctrl-btn" class:visible={btnPauseVisible} onclick={onPause}
      style="background: {BG_PANEL}; color: {TEXT_COLOR};">⏸</button>
    <button class="ctrl-btn" class:visible={btnResumeVisible} onclick={onResume}
      style="background: {BG_PANEL}; color: {TEXT_COLOR};">⏯</button>
    <button class="ctrl-btn" class:visible={btnStopVisible} onclick={onStop}
      style="background: {BG_PANEL}; color: {TEXT_COLOR};">⏹</button>
    <button class="ctrl-btn" class:visible={btnRestartVisible} onclick={onRestart}
      style="background: {BG_PANEL}; color: {TEXT_COLOR};">🔁</button>
  </div>
</div>

<style>
  .timer-widget {
    padding: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
  }
  .spin-row { padding: 0; }
  .spinbox {
    width: auto;
    padding: 0;
    text-align: center;
    border: none;
    outline: none;
    font-family: "Segoe UI", sans-serif;
  }
  .spinbox:disabled { opacity: 0.5; }
  .spinbox::-webkit-inner-spin-button,
  .spinbox::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  .spinbox[type="number"] { -moz-appearance: textfield; }

  .ring-container {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .ring { position: absolute; width: 100%; height: 100%; top: 0; left: 0; }
  .time {
    position: relative;
    z-index: 1;
    font-weight: bold;
    font-family: "Segoe UI", sans-serif;
    user-select: none;
    line-height: 1;
  }

  .buttons { display: flex; padding: 0; }
  .ctrl-btn {
    border: 1px solid #444;
    border-radius: 0;
    padding: 0;
    font-size: 10px;
    font-family: "Segoe UI", sans-serif;
    cursor: pointer;
    line-height: 1;
    display: none;
    width: auto;
    height: auto;
  }
  .ctrl-btn.visible { display: inline-flex; align-items: center; justify-content: center; }
  .ctrl-btn:hover { background: #333 !important; }
</style>
