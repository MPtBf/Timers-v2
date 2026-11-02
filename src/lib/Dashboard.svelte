<script lang="ts">
  import {
    BG_PANEL, BORDER_COLOR, TEXT_COLOR, TEXT_DIM, BTN_BG, BTN_HOVER,
    ACCENT_BG, ACCENT_FG, OVERTIME_COLOR, DASHBOARD,
  } from "../constants";
  import { blockQuery, blockDelete, blockUpdate, blockOpen } from "./ipc";
  import {
    blockColor,
    isValidBlockName,
    isValidBlockRange,
    layoutBlockInDay,
    type Block,
  } from "./activity";
  import { listen } from "@tauri-apps/api/event";
  import { EVT_BLOCKS_CHANGED } from "./events";

  const DAY_MS = 86400000;
  const HOUR_MS = 3600000;

  const DAY_ABBR = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

  function startOfWeek(date: Date): Date {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    return d;
  }

  function pad2(n: number): string {
    return n.toString().padStart(2, "0");
  }

  function formatDay(date: Date): string {
    return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)} ${DAY_ABBR[(date.getDay() + 6) % 7]}`;
  }

  function toTimeInput(ms: number): string {
    const d = new Date(ms);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function fromTimeInput(day: Date, value: string): number {
    const [h, m] = value.split(":").map(Number);
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, m || 0).getTime();
  }

  let weekStart = $state(startOfWeek(new Date()));
  let blocks = $state<Block[]>([]);

  let popup = $state<null | {
    mode: "create" | "edit";
    id: number | null;
    name: string;
    startMs: number;
    endMs: number;
  }>(null);

  let popupError = $state<string | null>(null);

  let days = $derived(
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    })
  );

  let rangeFrom = $derived(days[0].getTime());
  let rangeTo = $derived(days[6].getTime() + DAY_MS);

  let hourLabels = $derived(
    Array.from({ length: DASHBOARD.hourRows }, (_, i) => DASHBOARD.dayStartHour + i)
  );

  let today = $derived(startOfWeek(new Date()).getTime() === weekStart.getTime());

  function todayLabel(): string {
    const d = new Date();
    return `Сегодня: ${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`;
  }

  function weekLabel(): string {
    const from = days[0];
    const to = days[6];
    return `${pad2(from.getMonth() + 1)}.${pad2(from.getDate())} — ${pad2(to.getMonth() + 1)}.${pad2(to.getDate())}`;
  }

  function shiftWeek(delta: number) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + delta * 7);
    weekStart = d;
  }

  function goToday() {
    weekStart = startOfWeek(new Date());
  }

  function isToday(d: Date): boolean {
    const n = new Date();
    return (
      d.getFullYear() === n.getFullYear() &&
      d.getMonth() === n.getMonth() &&
      d.getDate() === n.getDate()
    );
  }

  function blocksForDay(day: Date): Block[] {
    const from = day.getTime();
    const to = from + DAY_MS;
    return blocks.filter((b) => {
      const end = b.endMs ?? from + DAY_MS;
      return b.startMs < to && end > from;
    });
  }

  function dayBounds(day: Date): { fromMs: number; toMs: number } {
    const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
    return {
      fromMs: dayStart + DASHBOARD.dayStartHour * HOUR_MS,
      toMs: dayStart + DAY_MS,
    };
  }

  function positionedBlocks(day: Date): Array<{ b: Block; layout: { topPct: number; heightPct: number } }> {
    const bounds = dayBounds(day);
    const out: Array<{ b: Block; layout: { topPct: number; heightPct: number } }> = [];
    for (const b of blocksForDay(day)) {
      const layout = layoutBlockInDay(b, bounds, Date.now());
      if (layout) out.push({ b, layout });
    }
    return out;
  }

  function refresh() {
    blockQuery(rangeFrom, rangeTo)
      .then((rows) => { blocks = rows; })
      .catch((err) => console.error("blockQuery error:", err));
  }

  function openCreate(day: Date, hour: number, minute = 0) {
    const startMs = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute).getTime();
    popup = {
      mode: "create",
      id: null,
      name: "",
      startMs,
      endMs: startMs + HOUR_MS,
    };
    popupError = null;
  }

  function openEdit(b: Block) {
    popup = {
      mode: "edit",
      id: b.id,
      name: b.name,
      startMs: b.startMs,
      endMs: b.endMs ?? b.startMs + HOUR_MS,
    };
    popupError = null;
  }

  function closePopup() {
    popup = null;
    popupError = null;
  }

  async function savePopup() {
    if (!popup) return;
    const name = popup.name.trim();
    if (!isValidBlockName(name)) {
      popupError = "Название не может быть пустым";
      return;
    }
    if (!isValidBlockRange(popup.startMs, popup.endMs)) {
      popupError = "Конец должен быть позже начала";
      return;
    }
    popupError = null;
    try {
      if (popup.mode === "edit" && popup.id !== null) {
        await blockUpdate(popup.id, name, popup.startMs, popup.endMs);
      } else {
        await blockOpen(name, popup.startMs, popup.endMs);
      }
    } catch (err) {
      popupError = String(err);
      return;
    }
    closePopup();
    refresh();
  }

  async function deleteBlock(id: number) {
    try {
      await blockDelete(id);
    } catch (err) {
      console.error("blockDelete error:", err);
    }
    refresh();
  }

  let unlisten: (() => void) | undefined = $state(undefined);

  $effect(() => {
    refresh();
  });

  $effect(() => {
    listen<void>(EVT_BLOCKS_CHANGED, () => refresh()).then((fn) => { unlisten = fn; });
    return () => unlisten?.();
  });

  function popupStartInput(): string {
    return popup ? toTimeInput(popup.startMs) : "00:00";
  }

  function popupEndInput(): string {
    return popup ? toTimeInput(popup.endMs) : "00:00";
  }

  function popupDay(): Date | null {
    return popup ? new Date(popup.startMs) : null;
  }

  function onPopupName(e: Event) {
    if (popup) popup.name = (e.currentTarget as HTMLInputElement).value;
  }

  function onPopupStart(e: Event) {
    if (!popup) return;
    const day = popupDay();
    if (!day) return;
    popup.startMs = fromTimeInput(day, (e.currentTarget as HTMLInputElement).value);
  }

  function onPopupEnd(e: Event) {
    if (!popup) return;
    const day = popupDay();
    if (!day) return;
    popup.endMs = fromTimeInput(day, (e.currentTarget as HTMLInputElement).value);
  }
</script>

<div class="dashboard" style="--bg: {BG_PANEL}; --border: {BORDER_COLOR}; --text: {TEXT_COLOR}; --dim: {TEXT_DIM}; --btn: {BTN_BG}; --btn-hover: {BTN_HOVER}; --accent-bg: {ACCENT_BG}; --accent-fg: {ACCENT_FG}; --today-bg: {DASHBOARD.todayHeaderBg}; --error: {OVERTIME_COLOR};">
  <header>
    <span class="today">{todayLabel()}</span>
    <span class="week">{weekLabel()}</span>
    <button onclick={() => shiftWeek(-1)} title="Предыдущая неделя">&lt;</button>
    <button onclick={() => shiftWeek(1)} title="Следующая неделя">&gt;</button>
    <button onclick={goToday} class:disabled={today}>Сегодня</button>
  </header>

  <div class="grid" style="grid-template-columns: {DASHBOARD.timeLabelWidth}px repeat(7, 1fr) {DASHBOARD.timeLabelWidth}px;">
    <div class="corner"></div>
    {#each days as d}
      <div class="day-header" class:today={isToday(d)}>{formatDay(d)}</div>
    {/each}
    <div class="corner"></div>

    <div class="time-col">
      {#each hourLabels as h}
        <div class="time-label">{h}</div>
      {/each}
    </div>
    {#each days as d}
      <div
        class="day-col"
        oncontextmenu={(e) => {
          e.preventDefault();
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const frac = (e.clientY - rect.top) / rect.height;
          const absMinutes = DASHBOARD.dayStartHour * 60 + frac * DASHBOARD.hourRows * 60;
          const hour = Math.floor(absMinutes / 60);
          const minute = Math.floor(absMinutes % 60);
          openCreate(d, hour, minute);
        }}
      >
        {#each positionedBlocks(d) as { b, layout }}
          <div
            class="block"
            style="background: {blockColor(b.name)}; top: {layout.topPct}%; height: {layout.heightPct}%;"
            title="{b.name}"
            oncontextmenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openEdit(b);
            }}
          >{b.name}</div>
        {/each}
      </div>
    {/each}
    <div class="time-col">
      {#each hourLabels as h}
        <div class="time-label">{h}</div>
      {/each}
    </div>
  </div>

  {#if popup}
    <div class="backdrop" onclick={closePopup}>
      <div class="popup" onclick={(e) => e.stopPropagation()} style="background: {BG_PANEL}; border: 1px solid {BORDER_COLOR};">
        <div class="popup-title">{popup.mode === "create" ? "Создать дело" : "Редактировать дело"}</div>
        <input class="field" type="text" placeholder="Название дела" value={popup.name} oninput={onPopupName} />
        <div class="time-fields">
          <label class="field-label">
            Начало
            <input class="field" type="time" value={popupStartInput()} oninput={onPopupStart} />
          </label>
          <label class="field-label">
            Конец
            <input class="field" type="time" value={popupEndInput()} oninput={onPopupEnd} />
          </label>
        </div>
        {#if popupError}
          <div class="error" style="color: {OVERTIME_COLOR};">{popupError}</div>
        {/if}
        <div class="actions">
          <button class="btn save" style="background: {ACCENT_BG}; color: {ACCENT_FG};" onclick={savePopup}>Сохранить</button>
          {#if popup.mode === "edit" && popup.id !== null}
            <button class="btn delete" style="background: {BTN_BG}; color: {OVERTIME_COLOR};" onclick={() => { deleteBlock(popup?.id ?? 0); closePopup(); }}>Удалить</button>
          {/if}
          <button class="btn" style="background: {BTN_BG}; color: {TEXT_COLOR};" onclick={closePopup}>Отмена</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .dashboard {
    width: 100vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    overflow: hidden;
    position: relative;
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .today {
    font-size: 12px;
    color: var(--accent-fg);
    font-weight: bold;
  }
  .week {
    font-size: 12px;
    flex: 1;
  }
  header button {
    background: var(--btn);
    color: var(--text);
    border: none;
    border-radius: 3px;
    padding: 3px 8px;
    font-size: 11px;
    cursor: pointer;
  }
  header button:hover {
    background: var(--btn-hover);
  }
  header button.disabled {
    opacity: 0.4;
    cursor: default;
  }
  .grid {
    flex: 1;
    display: grid;
    grid-template-rows: auto 1fr;
    min-height: 0;
  }
  .corner {
    background: var(--border);
  }
  .day-header {
    text-align: center;
    font-size: 11px;
    padding: 4px 0;
    border-bottom: 1px solid var(--border);
    border-left: 1px solid var(--border);
  }
  .day-header.today {
    background: var(--today-bg);
  }
  .time-col {
    display: flex;
    flex-direction: column;
  }
  .time-label {
    flex: 1;
    font-size: 9px;
    color: var(--dim);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .day-col {
    position: relative;
    border-left: 1px solid var(--border);
    background-image: repeating-linear-gradient(
      to bottom,
      var(--border) 0,
      var(--border) 1px,
      transparent 1px,
      transparent calc(100% / 18)
    );
    overflow: hidden;
  }
  .block {
    position: absolute;
    left: 1px;
    right: 1px;
    color: white;
    font-size: 9px;
    padding: 0 2px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    cursor: pointer;
  }
  .backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .popup {
    width: 280px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .popup-title {
    font-size: 13px;
    font-weight: bold;
  }
  .field {
    height: 22px;
    padding: 0 6px;
    font-size: 11px;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 0;
    outline: none;
    box-sizing: border-box;
    font-family: "Segoe UI", sans-serif;
  }
  .time-fields {
    display: flex;
    gap: 8px;
  }
  .field-label {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 10px;
    color: var(--dim);
  }
  .error {
    font-size: 10px;
  }
  .actions {
    display: flex;
    gap: 6px;
  }
  .btn {
    flex: 1;
    height: 24px;
    font-size: 11px;
    border: none;
    border-radius: 3px;
    cursor: pointer;
  }
</style>
