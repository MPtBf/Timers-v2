<script lang="ts">
  let { time = "0:00.00", isOvertime = false }: {
    time?: string;
    isOvertime?: boolean;
  } = $props();
</script>

<span
  class="time"
  style="color: {isOvertime ? '#f44336' : '#e0e0e0'};"
>
  {time}
</span>

<style>
  .time {
    font-family: ui-monospace, Consolas, monospace;
    font-size: 36px;
    font-weight: 300;
    letter-spacing: 1px;
    user-select: none;
    line-height: 1;
  }
</style>
