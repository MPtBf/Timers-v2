<script lang="ts">
  import { BG_PANEL, BORDER_COLOR, TEXT_COLOR, TEXT_DIM, BTN_BG, ACCENT_BG, ACCENT_FG } from "../constants";

  let {
    name,
    efficiency,
    usefulness,
    onEfficiency,
    onUsefulness,
    onSave,
    onCancel,
  }: {
    name: string;
    efficiency: number;
    usefulness: number;
    onEfficiency: (v: number) => void;
    onUsefulness: (v: number) => void;
    onSave: () => void;
    onCancel: () => void;
  } = $props();
</script>

<div class="finish-panel" style="background: {BG_PANEL}; border: 1px solid {BORDER_COLOR};">
  <div class="title" style="color: {TEXT_COLOR};">{name || "Завершить дело"}</div>
  <div class="slider-row">
    <span class="label" style="color: {TEXT_DIM};">Эффективность: {efficiency}</span>
    <input
      type="range"
      min="0"
      max="100"
      value={efficiency}
      oninput={(e) => onEfficiency(Number(e.currentTarget.value))}
    />
  </div>
  <div class="slider-row">
    <span class="label" style="color: {TEXT_DIM};">Польза: {usefulness}</span>
    <input
      type="range"
      min="0"
      max="100"
      value={usefulness}
      oninput={(e) => onUsefulness(Number(e.currentTarget.value))}
    />
  </div>
  <div class="actions">
    <button class="btn primary" onclick={onSave} style="background: {ACCENT_BG}; color: {ACCENT_FG}; border: none;">Сохранить</button>
    <button class="btn" onclick={onCancel} style="background: {BTN_BG}; color: {TEXT_COLOR}; border: none;">Отмена</button>
  </div>
</div>

<style>
  .finish-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
  }
  .title {
    font-size: 13px;
    font-weight: bold;
    font-family: "Segoe UI", sans-serif;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .slider-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .label {
    font-size: 11px;
    font-family: "Segoe UI", sans-serif;
  }
  input[type="range"] {
    width: 100%;
    accent-color: #6aafef;
  }
  .actions {
    display: flex;
    gap: 8px;
    margin-top: auto;
  }
  .btn {
    flex: 1;
    height: 24px;
    font-size: 11px;
    font-family: "Segoe UI", sans-serif;
    cursor: pointer;
    padding: 0;
    border-radius: 0;
  }
  .btn:hover { filter: brightness(1.2); }
</style>
