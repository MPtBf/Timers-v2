<script lang="ts">
  import { COLORS } from "../constants";

  let { progress = 0, color = COLORS.ringStopped, size = 160, strokeWidth = COLORS.ringWidth }: {
    progress?: number;
    color?: string;
    size?: number;
    strokeWidth?: number;
  } = $props();

  let center = $derived(size / 2);
  let radius = $derived(center - strokeWidth / 2);
  let circumference = $derived(2 * Math.PI * radius);

  let offset = $derived(circumference * (1 - Math.min(Math.max(progress, 0), 1)));
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 {size} {size}"
  style="transform: rotate(-90deg);"
>
  <circle
    cx={center}
    cy={center}
    r={radius}
    fill="none"
    stroke={COLORS.ringBg}
    stroke-width={strokeWidth}
  />
  <circle
    cx={center}
    cy={center}
    r={radius}
    fill="none"
    stroke={color}
    stroke-width={strokeWidth}
    stroke-linecap="round"
    stroke-dasharray={circumference}
    stroke-dashoffset={offset}
    style="transition: stroke-dashoffset 33ms linear, stroke 150ms ease;"
  />
</svg>
