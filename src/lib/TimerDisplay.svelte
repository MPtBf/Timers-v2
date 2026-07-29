<script lang="ts">
  let { time = "00:00", color = "#e0e0e0" }: { time?: string; color?: string } = $props();
</script>

<span class="time" style="color: {color};">
  {time}
</span>

<style>
  .time {
    font-size: 18px;
    font-weight: bold;
    font-family: "Segoe UI", sans-serif;
    user-select: none;
    line-height: 1;
  }
</style>
