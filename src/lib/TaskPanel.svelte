<script lang="ts">
  import { BTN_BG, BTN_HOVER, BG_PANEL, BORDER_COLOR, TEXT_COLOR, TEXT_DIM, ACCENT_BG, ACCENT_FG } from "../constants";
  import type { ActivitySummary, Suggestions } from "./activity";

  let {
    minutes,
    category,
    name,
    tags,
    logEnabled,
    autoPause,
    suggestions,
    continueActivities,
    canFinish,
    onMinutes,
    onCategory,
    onName,
    onTags,
    onLogEnabled,
    onAutoPause,
    onStart,
    onContinue,
    onFinish,
  }: {
    minutes: number;
    category: string;
    name: string;
    tags: string;
    logEnabled: boolean;
    autoPause: boolean;
    suggestions: Suggestions | null;
    continueActivities: ActivitySummary[];
    canFinish: boolean;
    onMinutes: (v: number) => void;
    onCategory: (v: string) => void;
    onName: (v: string) => void;
    onTags: (v: string) => void;
    onLogEnabled: (v: boolean) => void;
    onAutoPause: (v: boolean) => void;
    onStart: () => void;
    onContinue: (id: number) => void;
    onFinish: () => void;
  } = $props();
</script>

<div class="task-panel" style="background: {BG_PANEL}; border: 1px solid {BORDER_COLOR};">
  <div class="row">
    <input
      class="spin"
      type="number"
      min="0.1"
      step="1"
      value={minutes}
      onchange={(e) => onMinutes(Number(e.currentTarget.value))}
      onkeydown={(e) => { if (e.key === "Enter") onStart(); }}
      style="background: {BG_PANEL}; color: {TEXT_COLOR}; border: 1px solid {BORDER_COLOR};"
    />
  </div>
  <div class="row">
    <input
      class="text"
      placeholder="Категория"
      value={category}
      list="task-cat-list"
      oninput={(e) => onCategory(e.currentTarget.value)}
      onkeydown={(e) => { if (e.key === "Enter") onStart(); }}
      style="background: {BG_PANEL}; color: {TEXT_COLOR}; border: 1px solid {BORDER_COLOR};"
    />
    <datalist id="task-cat-list">
      {#each suggestions?.categories ?? [] as c}
        <option value={c} />
      {/each}
    </datalist>
  </div>
  <div class="row">
    <input
      class="text"
      placeholder="Дело"
      value={name}
      list="task-name-list"
      oninput={(e) => onName(e.currentTarget.value)}
      onkeydown={(e) => { if (e.key === "Enter") onStart(); }}
      style="background: {BG_PANEL}; color: {TEXT_COLOR}; border: 1px solid {BORDER_COLOR};"
    />
    <datalist id="task-name-list">
      {#each suggestions?.activities ?? [] as a}
        <option value={a.name} />
      {/each}
    </datalist>
  </div>
  <div class="row">
    <input
      class="text"
      placeholder="Теги (через запятую)"
      value={tags}
      oninput={(e) => onTags(e.currentTarget.value)}
      style="background: {BG_PANEL}; color: {TEXT_COLOR}; border: 1px solid {BORDER_COLOR};"
    />
  </div>
  <div class="row checks">
    <label class="check" style="color: {TEXT_DIM};">
      <input type="checkbox" checked={logEnabled} onchange={(e) => onLogEnabled(e.currentTarget.checked)} />
      Логировать
    </label>
    <label class="check" style="color: {TEXT_DIM};">
      <input type="checkbox" checked={autoPause} onchange={(e) => onAutoPause(e.currentTarget.checked)} />
      Автопауза
    </label>
  </div>
  {#if continueActivities.length > 0}
    <div class="row">
      <select
        class="text continue"
        value="-1"
        onchange={(e) => {
          const id = Number(e.currentTarget.value);
          if (id > 0) onContinue(id);
          e.currentTarget.value = "-1";
        }}
        style="background: {BG_PANEL}; color: {TEXT_COLOR}; border: 1px solid {BORDER_COLOR};"
      >
        <option value="-1">Продолжить дело…</option>
        {#each continueActivities as a}
          <option value={a.id}>{a.category} / {a.name}</option>
        {/each}
      </select>
    </div>
  {/if}
  <div class="row actions">
    <button class="btn primary" onclick={onStart} style="background: {ACCENT_BG}; color: {ACCENT_FG}; border: none;">▶ Старт</button>
    {#if canFinish}
      <button class="btn" onclick={onFinish} style="background: {BTN_BG}; color: {TEXT_COLOR}; border: none;">✔ Завершить дело</button>
    {/if}
  </div>
</div>

<style>
  .task-panel {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
  }
  .row {
    display: flex;
    width: 100%;
  }
  .spin, .text {
    width: 100%;
    height: 20px;
    padding: 0 6px;
    font-size: 11px;
    font-family: "Segoe UI", sans-serif;
    outline: none;
    border-radius: 0;
    box-sizing: border-box;
    appearance: textfield;
    -moz-appearance: textfield;
  }
  .spin::-webkit-inner-spin-button,
  .spin::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  .checks {
    gap: 12px;
    align-items: center;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    font-family: "Segoe UI", sans-serif;
    cursor: pointer;
  }
  .continue {
    height: 22px;
  }
  .actions {
    gap: 6px;
    margin-top: 2px;
  }
  .btn {
    flex: 1;
    height: 22px;
    font-size: 11px;
    font-family: "Segoe UI", sans-serif;
    cursor: pointer;
    padding: 0;
    border-radius: 0;
  }
  .btn:hover { filter: brightness(1.2); }
</style>
