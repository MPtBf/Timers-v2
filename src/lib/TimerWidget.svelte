<script lang="ts">
  import { emit, listen } from "@tauri-apps/api/event";
  import {
    COLOR_STOPPED, COLOR_RUNNING, COLOR_PAUSED, OVERTIME_COLOR,
    RING_BG, RING_FG, CTRL_BTN_SPACING, TIMER, SESSION, AUTO_PAUSE_IDLE_MS,
    ACTIVITY_DEBOUNCE_MS, TASK_NAME_COLOR,
  } from "../constants";
  import { TimerModel, type TimerState } from "./timer.svelte";
  import { formatClockTime } from "./format";
  import { getIdleTime, beepSystem, flashWindow } from "./ipc";
  import type { TimerStateReport } from "./session";
  import { ActivityLogger, type LogOp } from "./activity-logger";
  import { executeOps, ipcLogRunner } from "./logger-runner";
  import { shouldAutoPause } from "./idle-pause";
  import { activityDebounce, isValidBlockName } from "./activity";
  import { EVT_ACTIVITY_OWNER } from "./events";

  let { soundOn = true, onOvertimeChange, initial = null, onStateReport, timerLabel }: {
    soundOn?: boolean;
    onOvertimeChange?: (expired: boolean) => void;
    initial?: TimerStateReport | null;
    onStateReport?: (report: TimerStateReport) => void;
    timerLabel: string;
  } = $props();

  let timerState: TimerState = $state<TimerState>("stopped");
  let remainingMs: number = $state<number>(0);
  let durationMs: number = $state<number>(0);
  let inputMinutes: number = $state<number>(5);
  let name: string = $state<string>("");
  let nameLocked: boolean = $state<boolean>(false);

  let timer = $state(new TimerModel());
  let logger = new ActivityLogger();
  let isFinished = $state<boolean>(false);
  let afkPaused = $state<boolean>(false);
  let beepInterval: ReturnType<typeof setInterval> | null = $state<ReturnType<typeof setInterval> | null>(null);
  let flashInterval: ReturnType<typeof setInterval> | null = $state<ReturnType<typeof setInterval> | null>(null);
  let lastReport: number = $state<number>(0);
  let nameDebouncer = $state(activityDebounce(() => applyNameDebounce(), ACTIVITY_DEBOUNCE_MS));

  let progress = $derived(durationMs > 0 ? 1 - remainingMs / durationMs : 0);
  let timeColor = $derived(
    isFinished ? OVERTIME_COLOR
      : timerState === "running" ? COLOR_RUNNING
        : timerState === "paused" ? COLOR_PAUSED
          : COLOR_STOPPED
  );
  let ringProgressColor = $derived(
    isFinished ? OVERTIME_COLOR
      : timerState === "paused" ? COLOR_PAUSED
        : RING_FG
  );
  let ringProgress = $derived(isFinished ? 1.0 : progress);

  let displayTime = $derived(
    isFinished
      ? formatClockTime(-remainingMs)
      : timerState === "stopped"
        ? formatClockTime(durationMs > 0 ? durationMs : inputMinutes * 60000)
        : formatClockTime(remainingMs)
  );

  let btnStartVisible = $derived(!isFinished && timerState === "stopped");
  let btnPauseVisible = $derived(!isFinished && timerState === "running");
  let btnResumeVisible = $derived(!isFinished && timerState === "paused");
  let btnStopVisible = $derived(timerState === "running" || timerState === "paused" || isFinished);
  let btnRestartVisible = $derived(timerState === "running" || timerState === "paused" || isFinished);

  function runOps(ops: LogOp[]) {
    executeOps(ops, ipcLogRunner).catch((err) => {
      console.error("activity log error:", err);
    });
  }

  function reportNow() {
    lastReport = performance.now();
    onStateReport?.({
      durationMs: Math.round(timer.durationMs),
      remainingMs: Math.round(remainingMs),
      state: timerState,
    });
  }

  function broadcastOwner(activeName: string | null) {
    emit(EVT_ACTIVITY_OWNER, { timerLabel, name: activeName })
      .catch((err) => console.error("activity-owner emit error:", err));
  }

  function stopOvertime() {
    if (beepInterval !== null) { clearInterval(beepInterval); beepInterval = null; }
    if (flashInterval !== null) { clearInterval(flashInterval); flashInterval = null; }
  }

  let beepBusy = false;
  function maybeBeep() {
    if (!soundOn || beepBusy) return;
    beepBusy = true;
    getIdleTime().then((idleMs) => {
      if (idleMs < TIMER.afkMuteMs) beepSystem();
    }).catch(() => {}).finally(() => { beepBusy = false; });
  }

  function startOvertime() {
    stopOvertime();
    maybeBeep();
    flashWindow();
    beepInterval = setInterval(maybeBeep, TIMER.overtimeBeepIntervalMs);
    flashInterval = setInterval(() => flashWindow(), TIMER.flashIntervalMs);
    isFinished = true;
    onOvertimeChange?.(true);
    reportNow();
  }

  function beginBlock(activeName: string, startMs: number) {
    const ops = logger.begin(activeName, startMs);
    if (ops.length) runOps(ops);
  }

  function closeBlock(endMs: number) {
    const ops = logger.stop(endMs);
    if (ops.length) runOps(ops);
  }

  function onStart() {
    if (inputMinutes <= 0) return;
    isFinished = false;
    afkPaused = false;
    stopOvertime();
    onOvertimeChange?.(false);
    beginBlock(name, Date.now());
    timer.setDuration(inputMinutes);
    timer.start();
    reportNow();
  }

  function onPause() {
    timer.pause();
    closeBlock(Date.now());
    broadcastOwner(null);
    reportNow();
  }

  function onResume() {
    timer.resume();
    if (isValidBlockName(name)) {
      beginBlock(name, Date.now());
      broadcastOwner(name.trim());
    }
    reportNow();
  }

  function onStop() {
    isFinished = false;
    afkPaused = false;
    stopOvertime();
    onOvertimeChange?.(false);
    timer.stop();
    closeBlock(Date.now());
    broadcastOwner(null);
    reportNow();
  }

  function onIdlePause() {
    timer.pause();
    closeBlock(Date.now());
    broadcastOwner(null);
    afkPaused = true;
    reportNow();
  }

  function onIdleReturn() {
    afkPaused = false;
    timer.resume();
    if (isValidBlockName(name)) {
      beginBlock(name, Date.now());
      broadcastOwner(name.trim());
    }
    reportNow();
  }

  function applyNameDebounce() {
    if (!isValidBlockName(name)) return;
    const ops = logger.switchTo(name, Date.now());
    if (ops.length) runOps(ops);
    broadcastOwner(name.trim());
  }

  function onNameInput() {
    if (timerState === "stopped" || isFinished) return;
    if (name.trim() === "") {
      nameDebouncer.cancel();
      closeBlock(Date.now());
      broadcastOwner(null);
      return;
    }
    nameDebouncer.push();
  }

  function onRestart() { onStop(); onStart(); }

  function onTick(rm: number, _em: number) {
    remainingMs = rm;
    durationMs = timer.durationMs;
    if (performance.now() - lastReport >= SESSION.snapshotIntervalMs) reportNow();
  }

  function onStateChange(s: TimerState) { timerState = s; }
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

  let idleBusy = false;
  $effect(() => {
    const idp = setInterval(() => {
      if (isFinished || idleBusy) return;
      idleBusy = true;
      getIdleTime().then((idleMs) => {
        if (afkPaused) {
          if (idleMs < AUTO_PAUSE_IDLE_MS) onIdleReturn();
        } else if (shouldAutoPause({ state: timerState, autoPause: true, idleMs, thresholdMs: AUTO_PAUSE_IDLE_MS, overtime: isFinished })) {
          onIdlePause();
        }
      }).catch(() => {}).finally(() => { idleBusy = false; });
    }, 1000);
    return () => clearInterval(idp);
  });

  $effect(() => {
    const unlistens: Array<Promise<() => void>> = [];
    unlistens.push(listen<{ timerLabel: string; name: string | null }>(EVT_ACTIVITY_OWNER, (e) => {
      if (e.payload.timerLabel === timerLabel) return;
      nameLocked = e.payload.name !== null;
    }));
    return () => {
      for (const p of unlistens) p.then((fn) => fn());
    };
  });

  $effect(() => {
    const handler = () => {
      closeBlock(Date.now());
      broadcastOwner(null);
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  });

  $effect(() => {
    return () => {
      stopOvertime();
      nameDebouncer.cancel();
      timer.destroy();
      closeBlock(Date.now());
      broadcastOwner(null);
    };
  });
</script>

<div class="timer-widget">
  <div class="name-row">
    <input
      type="text"
      placeholder="Название дела"
      bind:value={name}
      oninput={onNameInput}
      disabled={nameLocked}
      class="namebox"
      style="color: {TASK_NAME_COLOR};"
    />
  </div>

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
  .name-row {
    width: 100%;
    flex-shrink: 0;
    line-height: 0;
  }
  .namebox {
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
  }
  .namebox:disabled { opacity: 0.4; }
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
