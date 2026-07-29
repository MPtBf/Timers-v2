<script lang="ts">
  import { RING_BG } from "../constants";

  let { progress = 0, color = "#e0e0e0", size = 74 }: {
    progress?: number;
    color?: string;
    size?: number;
  } = $props();

  let strokeW = 25;
</script>

<svg width={size} height={size} viewBox="0 0 {size} {size}" style="transform: rotate(-90deg); display: block;">
  <circle
    cx={size / 2} cy={size / 2} r={size / 2 - 1}
    fill="none"
    stroke={RING_BG}
    stroke-width={strokeW}
  />
  <circle
    cx={size / 2} cy={size / 2} r={size / 2 - 1}
    fill="none"
    stroke={color}
    stroke-width={strokeW}
    stroke-linecap="butt"
    stroke-dasharray={2 * Math.PI * (size / 2 - 1)}
    stroke-dashoffset={2 * Math.PI * (size / 2 - 1) * (1 - Math.min(Math.max(progress, 0), 1))}
    style="transition: stroke-dashoffset 33ms linear, stroke 150ms ease;"
  />
</svg>
