<script lang="ts">
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { LogicalSize } from "@tauri-apps/api/dpi";
  import { emitTo } from "@tauri-apps/api/event";
  import TaskPanel from "./TaskPanel.svelte";
  import {
    TASK_PANEL_WIDTH, TASK_PANEL_HEIGHT,
  } from "../constants";
  import { getPanelInit, activitySuggestions, activityGetOpenBlock, activityUpsert } from "./ipc";
  import { panelTimerLabel } from "./windows";
  import { EVT_TASK_START, EVT_TASK_CONFIG, EVT_REQUEST_FINISH } from "./events";
  import { computeTaskPrefill } from "./task-panel";
  import type { ActivitySummary, Suggestions } from "./activity";

  const win = getCurrentWindow();
  const timerLabel = panelTimerLabel(win.label) ?? "";

  let minutes = $state(5);
  let category = $state("");
  let name = $state("");
  let tags = $state("");
  let logEnabled = $state(true);
  let autoPause = $state(true);
  let boundActivityId = $state<number | null>(null);
  let suggestions = $state<Suggestions | null>(null);

  let continueActivities = $derived(
    (suggestions?.activities ?? []).filter((a) => a.status === "finished")
  );
  let canFinish = $derived(boundActivityId !== null);

  function splitTags(text: string): string[] {
    return text.split(",").map((t) => t.trim()).filter(Boolean);
  }

  function onMinutes(v: number) { minutes = v; }

  function onCategory(v: string) {
    category = v;
    boundActivityId = null;
  }

  function onName(v: string) {
    name = v;
    boundActivityId = null;
  }

  function onTags(v: string) { tags = v; }

  function onLogEnabled(v: boolean) {
    logEnabled = v;
    emitTo(timerLabel, EVT_TASK_CONFIG, { logEnabled, autoPause }).catch(() => {});
  }

  function onAutoPause(v: boolean) {
    autoPause = v;
    emitTo(timerLabel, EVT_TASK_CONFIG, { logEnabled, autoPause }).catch(() => {});
  }

  function onContinue(id: number) {
    const act = suggestions?.activities.find((a) => a.id === id);
    if (!act) return;
    category = act.category;
    name = act.name;
    tags = "";
    boundActivityId = act.id;
    logEnabled = true;
  }

  async function onStart() {
    if (minutes <= 0) return;
    try {
      let activityId: number | null = null;
      if (logEnabled) {
        if (!name.trim()) return;
        if (boundActivityId === null) {
          activityId = await activityUpsert({
            id: null,
            name: name.trim(),
            category: category.trim() || "Без категории",
            tags: splitTags(tags),
            parentId: null,
            logEnabled: true,
            status: "active",
            efficiency: null,
            usefulness: null,
            startedMs: Date.now(),
            endedMs: null,
          });
        } else {
          activityId = boundActivityId;
        }
      }
      await emitTo(timerLabel, EVT_TASK_START, {
        minutes,
        activityId,
        activityName: logEnabled ? name.trim() : null,
        logEnabled,
        autoPause,
      });
    } catch (err) {
      console.error("task start error:", err);
    }
    win.close();
  }

  function onFinish() {
    emitTo(timerLabel, EVT_REQUEST_FINISH, {
      activityId: boundActivityId,
      activityName: name.trim() || null,
    }).catch((err) => console.error("request-finish emit error:", err));
    win.close();
  }

  $effect(() => {
    win.setSize(new LogicalSize(TASK_PANEL_WIDTH, TASK_PANEL_HEIGHT));
    getPanelInit().then((init) => {
      if (!init) return;
      if (init.logEnabled !== null) logEnabled = init.logEnabled;
      if (init.autoPause !== null) autoPause = init.autoPause;
      if (init.minutes !== null && init.minutes > 0) minutes = init.minutes;
    }).catch((err) => console.error("getPanelInit error:", err));
    activitySuggestions().then((s) => { suggestions = s; })
      .catch((err) => console.error("activitySuggestions error:", err));
    activityGetOpenBlock(timerLabel).then((row) => {
      const prefill = computeTaskPrefill(row, autoPause);
      category = prefill.category;
      name = prefill.name;
      tags = prefill.tags;
      logEnabled = prefill.logEnabled;
      autoPause = prefill.autoPause;
      boundActivityId = prefill.activityId;
    }).catch((err) => console.error("activityGetOpenBlock error:", err));
  });
</script>

<TaskPanel
  {minutes}
  {category}
  {name}
  {tags}
  {logEnabled}
  {autoPause}
  {suggestions}
  {continueActivities}
  {canFinish}
  onMinutes={onMinutes}
  onCategory={onCategory}
  onName={onName}
  onTags={onTags}
  onLogEnabled={onLogEnabled}
  onAutoPause={onAutoPause}
  onStart={onStart}
  onContinue={onContinue}
  onFinish={onFinish}
/>
