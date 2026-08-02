<script lang="ts">
  import {
    COLOR_STOPPED, COLOR_RUNNING, COLOR_PAUSED, OVERTIME_COLOR,
    RING_BG, RING_FG, CTRL_BTN_SPACING, TIMER, SESSION, AUTO_PAUSE_IDLE_MS,
  } from "../constants";
  import { TimerModel, type TimerState } from "./timer.svelte";
  import { formatClockTime } from "./format";
  import { getIdleTime, beepSystem, flashWindow, activityGetOpenBlock } from "./ipc";
  import type { TimerStateReport } from "./session";
  import { ActivityLogger, type LogOp } from "./activity-logger";
  import { executeOps, ipcLogRunner } from "./logger-runner";
  import { shouldAutoPause } from "./idle-pause";
  import type {
    TimerControl, LogState, StartCommand, FinishCommand, ConfigCommand,
  } from "./timer-control";
  import { createTimerControl } from "./timer-control";

  let { soundOn = true, onOvertimeChange, initial = null, onStateReport, timerLabel, ctrl = createTimerControl(), onLogState }: {
    soundOn?: boolean;
    onOvertimeChange?: (expired: boolean) => void;
    initial?: TimerStateReport | null;
    onStateReport?: (report: TimerStateReport) => void;
    timerLabel: string;
    ctrl?: TimerControl;
    onLogState?: (state: LogState) => void;
  } = $props();

  let state: TimerState = $state("stopped");
  let remainingMs: number = $state(0);
  let durationMs: number = $state(0);
  let inputMinutes: number = $state(5);
  let autoPause: boolean = $state(true);

  let timer = $state(new TimerModel());
  // svelte-ignore state_referenced_locally
  let logger = new ActivityLogger(timerLabel);
  let lastActivityName: string | null = null;
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

  function runOps(ops: LogOp[]) {
    executeOps(ops, ipcLogRunner).catch((err) => {
      console.error("activity log error:", err);
    });
  }

  function reportNow() {
    lastReport = performance.now();
    onStateReport?.({
      durationMs: timer.durationMs,
      remainingMs,
      state,
      activityId: logger.activityId ?? null,
    });
    onLogState?.({
      logEnabled: logger.logEnabled,
      autoPause,
      activityId: logger.activityId ?? null,
      activityName: lastActivityName,
    });
  }

  function stopOvertime() {
    if (beepInterval !== null) { clearInterval(beepInterval); beepInterval = null; }
    if (flashInterval !== null) { clearInterval(flashInterval); flashInterval = null; }
  }

  function maybeBeep() {
    if (!soundOn) return;
    getIdleTime().then((idleMs) => {
      if (idleMs < TIMER.afkMuteMs) beepSystem();
    });
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

  function onStart() {
    if (inputMinutes <= 0) return;
    isFinished = false;
    stopOvertime();
    onOvertimeChange?.(false);
    logger.setLogEnabled(false);
    const ops = logger.begin(null, Date.now());
    if (ops.length) runOps(ops);
    lastActivityName = null;
    timer.setDuration(inputMinutes);
    timer.start();
    reportNow();
  }

  function onPause() {
    timer.pause();
    const ops = logger.pause(Date.now());
    if (ops.length) runOps(ops);
    reportNow();
  }

  function onResume() {
    timer.resume();
    const ops = logger.resume(Date.now());
    if (ops.length) runOps(ops);
    reportNow();
  }

  function onStop() {
    isFinished = false;
    stopOvertime();
    onOvertimeChange?.(false);
    timer.stop();
    const ops = logger.stop(Date.now());
    if (ops.length) runOps(ops);
    reportNow();
  }

  function onIdlePause() {
    timer.pause();
    const ops = logger.pause(Date.now(), "away");
    if (ops.length) runOps(ops);
    reportNow();
  }

  function startExternal(cmd: StartCommand) {
    if (cmd.minutes <= 0) return;
    isFinished = false;
    stopOvertime();
    onOvertimeChange?.(false);
    logger.setLogEnabled(cmd.logEnabled);
    autoPause = cmd.autoPause;
    inputMinutes = cmd.minutes;
    const ops = logger.begin(cmd.activityId, Date.now());
    if (ops.length) runOps(ops);
    lastActivityName = cmd.activityName;
    timer.setDuration(cmd.minutes);
    timer.start();
    reportNow();
  }

  function finishExternal(cmd: FinishCommand) {
    const ops = logger.finish(cmd.efficiency, cmd.usefulness, cmd.endedMs);
    if (ops.length) runOps(ops);
    lastActivityName = null;
    isFinished = false;
    stopOvertime();
    onOvertimeChange?.(false);
    timer.stop();
    reportNow();
  }

  function applyConfig(cmd: ConfigCommand) {
    autoPause = cmd.autoPause;
    if (cmd.logEnabled !== logger.logEnabled) {
      if (!cmd.logEnabled && logger.hasOpenBlock) {
        const ops = logger.stop(Date.now());
        if (ops.length) runOps(ops);
      }
      logger.setLogEnabled(cmd.logEnabled);
    }
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
    let cancelled = false;
    activityGetOpenBlock(timerLabel).then((row) => {
      if (cancelled) return;
      if (row && row.activityId !== null) {
        logger.restore(row.activityId, row.kind);
        lastActivityName = row.activityName;
      } else if (row) {
        logger.restore(initial?.activityId ?? null, row.kind);
        lastActivityName = row.activityName ?? null;
      } else if (initial?.activityId != null) {
        logger.restore(initial.activityId, null);
        lastActivityName = null;
      }
      reportNow();
    }).catch((err) => {
      console.error("getOpenBlock restore error:", err);
      if (initial?.activityId != null) {
        logger.restore(initial.activityId, null);
        lastActivityName = null;
        reportNow();
      }
    });
    return () => { cancelled = true; };
  });

  $effect(() => {
    const idp = setInterval(() => {
      if (state !== "running" || !autoPause || isFinished) return;
      getIdleTime().then((idleMs) => {
        if (shouldAutoPause({ state, autoPause, idleMs, thresholdMs: AUTO_PAUSE_IDLE_MS, overtime: isFinished })) {
          onIdlePause();
        }
      }).catch(() => {});
    }, 1000);
    return () => clearInterval(idp);
  });

  $effect(() => {
    const startCmd = ctrl.start;
    if (startCmd) {
      ctrl.start = null;
      startExternal(startCmd);
    }
  });

  $effect(() => {
    const finishCmd = ctrl.finish;
    if (finishCmd) {
      ctrl.finish = null;
      finishExternal(finishCmd);
    }
  });

  $effect(() => {
    const configCmd = ctrl.config;
    if (configCmd) {
      ctrl.config = null;
      applyConfig(configCmd);
    }
  });

  $effect(() => {
    const handler = () => {
      const ops = logger.stop(Date.now());
      if (ops.length) runOps(ops);
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  });

  $effect(() => {
    return () => {
      stopOvertime();
      timer.destroy();
      const ops = logger.stop(Date.now());
      if (ops.length) runOps(ops);
    };
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
